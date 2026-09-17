import type {
  Caveat,
  ChangeSet,
  GraphData,
  OutcomeBase,
  RehearsalOutcome,
  RepoConnectResult,
  StalenessResult,
  ModelledState,
  ToolErrorCause
} from "../../shared/types";
import { caveat } from "../../shared/caveats";
import { readDynamicDisqualifiers, readStaticDisqualifiers } from "./repository/disqualifiers";
import { readAliases, readIdentity } from "./repository/config";
import { classifyRun } from "./rehearsal/classify";
import { buildChangeSet, compareFingerprints, compareModelledState, detectBlockingAnomaly } from "./change/diff";
import { explainFailure } from "./command/explain";
import { readGit } from "./platform/git";
import { createMirror, MirrorFailure } from "./rehearsal/mirror";
import { evaluateGuards } from "./command/guards";
import { prepareCommand } from "./command/parseCommand";
import {
  readFingerprints,
  readGraph,
  readIgnored,
  readModelledState,
  readReachableCommits,
  readUntracked
} from "./repository/repoState";
import { probeNetworkDenial, runSandboxed, type DenialProbe } from "./rehearsal/sandbox";

const COMMAND_TIMEOUT_MS = 15_000;

let cachedProbe: Promise<DenialProbe> | null = null;

export function currentDenialProbe(force = false): Promise<DenialProbe> {
  if (!cachedProbe || force) {
    cachedProbe = probeNetworkDenial();
  }
  return cachedProbe;
}

export async function resolveRepoPath(input: string): Promise<string> {
  const result = await readGit(["rev-parse", "--show-toplevel"], input);
  if (result.code !== 0) {
    throw new Error(`not a git repository: ${input}`);
  }
  return result.stdout.trim();
}

function base(display: string): OutcomeBase {
  return {
    display,
    args: null,
    changeSet: null,
    graphBefore: null,
    graphAfter: null,
    sideEffects: [],
    blockingAnomaly: false,
    fidelityWarnings: [],
    caveats: [],
    originSnapshot: null,
    stdout: "",
    stderr: ""
  };
}

interface Shared {
  args: string[];
  changeSet: ChangeSet | null;
  graphBefore: GraphData | null;
  graphAfter: GraphData | null;
  sideEffects: OutcomeBase["sideEffects"];
  blockingAnomaly: boolean;
  fidelityWarnings: string[];
  caveats: Caveat[];
  originSnapshot: OutcomeBase["originSnapshot"];
  stdout: string;
  stderr: string;
}

function emptyChangeSet(state: ModelledState, commits: string[]): ChangeSet {
  return buildChangeSet(state, state, commits, commits);
}

function refusal(
  display: string,
  code: string,
  reason: string,
  alternative: string | null,
  fidelityWarnings: string[] = []
): RehearsalOutcome {
  return { ...base(display), kind: "refusal", code, reason, alternative, fidelityWarnings };
}

function toolError(
  display: string,
  cause: ToolErrorCause,
  reason: string,
  nextStep: string,
  fidelityWarnings: string[] = []
): RehearsalOutcome {
  return { ...base(display), kind: "tool-error", cause, reason, nextStep, fidelityWarnings };
}

async function fidelityWarningsFor(repoPath: string): Promise<string[]> {
  const warnings: string[] = [];
  const [staticSignals, dynamic] = await Promise.all([
    readStaticDisqualifiers(repoPath),
    readDynamicDisqualifiers(repoPath)
  ]);

  if (staticSignals.submodules) {
    warnings.push(
      "This repository has submodules, which the rehearsal does not copy. Submodule contents are not represented in this preview."
    );
  }
  if (staticSignals.lfs) {
    warnings.push(
      "This repository tracks files with Git LFS, which the rehearsal does not fetch. Pointers are present, real content is not."
    );
  }
  if (staticSignals.linkedWorktrees > 0) {
    warnings.push(
      `This repository has ${staticSignals.linkedWorktrees} linked worktree(s), which are not copied into the rehearsal.`
    );
  }
  if (dynamic.operation) {
    warnings.push(
      `This repository is in the middle of a ${dynamic.operation}. Git keeps internal state for that which the rehearsal does not reproduce, so the result may differ from your repository.`
    );
  }
  return warnings;
}

function applicableCaveats(input: {
  executed: boolean;
  mutator: boolean;
  referencesOrigin: boolean;
  autoAnsweredMerge: boolean;
  sequence: string | null;
}): Caveat[] {
  const caveats: Caveat[] = [];
  if (input.executed && input.mutator) {
    caveats.push(caveat("sanitized-environment"));
  }
  if (input.referencesOrigin) {
    caveats.push(caveat("origin-topology"));
  }
  if (input.autoAnsweredMerge) {
    caveats.push(caveat("auto-answered-message"));
  }
  if (input.sequence && /^\s*(squash|s)\s/m.test(input.sequence)) {
    caveats.push(caveat("squash-auto-message"));
  }
  return caveats;
}

export async function connectRepo(input: string): Promise<RepoConnectResult> {
  const repoPath = await resolveRepoPath(input);
  const [state, graph, staticDisqualifiers, dynamicDisqualifiers, untracked, ignored] =
    await Promise.all([
      readModelledState(repoPath),
      readGraph(repoPath),
      readStaticDisqualifiers(repoPath),
      readDynamicDisqualifiers(repoPath),
      readUntracked(repoPath),
      readIgnored(repoPath)
    ]);

  return {
    path: repoPath,
    name: repoPath.split("/").filter(Boolean).pop() ?? repoPath,
    state,
    graph,
    staticDisqualifiers,
    dynamicDisqualifiers,
    untracked,
    ignored,
    caveats: applicableCaveats({
      executed: false,
      mutator: false,
      referencesOrigin: false,
      autoAnsweredMerge: false,
      sequence: null
    })
  };
}

export interface PreviewOptions {
  path: string;
  command: string;
  sequence?: string | null;
}

async function abortOperation(clonePath: string, operation: string | null): Promise<void> {
  if (!operation) {
    return;
  }
  await readGit([operation, "--abort"], clonePath);
}

export async function previewCommand(options: PreviewOptions): Promise<RehearsalOutcome> {
  const repoPath = await resolveRepoPath(options.path);
  const [originState, fidelityWarnings, aliases] = await Promise.all([
    readModelledState(repoPath),
    fidelityWarningsFor(repoPath),
    readAliases(repoPath)
  ]);
  const originSnapshot = { takenAt: Date.now(), state: originState };
  const parsed = prepareCommand(options.command, aliases);

  if (!parsed.ok) {
    return refusal(options.command, parsed.code, parsed.reason, parsed.alternative, fidelityWarnings);
  }

  const guards = evaluateGuards(parsed.command, { sequence: options.sequence ?? null });
  if (guards.refusal) {
    return refusal(
      options.command,
      guards.refusal.code,
      guards.refusal.reason,
      guards.refusal.alternative,
      fidelityWarnings
    );
  }

  const probe = await currentDenialProbe();
  if (!probe.ok || !probe.sandbox) {
    return toolError(
      options.command,
      probe.cause ?? "sandbox-unavailable",
      probe.reason,
      probe.nextStep,
      fidelityWarnings
    );
  }

  const IGNORED_AWARE_SUBCOMMANDS = new Set(["add", "stash", "clean", "checkout", "restore", "reset", "rm", "status", "ls-files"]);
  const IGNORED_FLAGS = new Set(["-f", "--force", "-a", "--all", "-X", "--ignored", "--include-ignored"]);
  const includeIgnored =
    IGNORED_AWARE_SUBCOMMANDS.has(parsed.command.subcommand) &&
    parsed.command.argv.some((arg) => IGNORED_FLAGS.has(arg));

  let mirror;
  try {
    mirror = await createMirror(repoPath, originState, { includeIgnored });
  } catch (error) {
    if (error instanceof MirrorFailure) {
      const nextStep =
        error.cause === "clone-failed"
          ? "check that the repository can be cloned, and that there is disk space"
          : "check the repository's index and working tree state";
      return toolError(options.command, error.cause, error.message, nextStep, fidelityWarnings);
    }
    throw error;
  }

  const allWarnings = [...fidelityWarnings, ...mirror.warnings];

  try {
    const [beforeState, beforeFingerprints, beforeCommits, graphBefore] = await Promise.all([
      readModelledState(mirror.path),
      readFingerprints(mirror.path),
      readReachableCommits(mirror.path),
      readGraph(mirror.path)
    ]);
    const identity = await readIdentity(repoPath);

    const run = await runSandboxed(probe.sandbox, {
      clonePath: mirror.path,
      homeDir: mirror.homeDir,
      identity,
      argv: parsed.command.argv,
      timeoutMs: COMMAND_TIMEOUT_MS,
      sequence: guards.sequence,
      autoAnswerMergeMessage: guards.autoAnswerMergeMessage
    });

    const caveats = applicableCaveats({
      executed: true,
      mutator: parsed.command.kind === "mutator",
      referencesOrigin: parsed.command.subArgs.some((arg) => arg.includes("origin/")),
      autoAnsweredMerge: guards.autoAnswerMergeMessage,
      sequence: guards.sequence
    });

    const shared = (over: Partial<Shared>): Shared => ({
      args: parsed.command.argv,
      changeSet: null,
      graphBefore,
      graphAfter: null,
      sideEffects: [],
      blockingAnomaly: false,
      fidelityWarnings: allWarnings,
      caveats,
      originSnapshot,
      stdout: run.stdout,
      stderr: run.stderr,
      ...over
    });

    if (run.timedOut) {
      return {
        ...base(options.command),
        kind: "tool-error",
        cause: "timeout",
        reason: `the command was still running after ${COMMAND_TIMEOUT_MS} ms and was killed`,
        nextStep: "raise the timeout, or check whether the command expects input on stdin",
        ...shared({})
      };
    }
    if (run.outputCapped) {
      return {
        ...base(options.command),
        kind: "tool-error",
        cause: "output-capped",
        reason: "the command produced more output than Foresight buffers",
        nextStep: "check for a runaway command, or narrow it with a pathspec",
        ...shared({})
      };
    }

    const classification = await classifyRun(mirror.path, run.code);
    const sideEffects = compareFingerprints(beforeFingerprints, await readFingerprints(mirror.path));

    if (classification.kind === "conflict-stop" || classification.kind === "pause-stop") {
      await abortOperation(mirror.path, classification.operation);
      const changeSet = emptyChangeSet(beforeState, beforeCommits);
      detectBlockingAnomaly(sideEffects, changeSet, run.code);
      const graphAfter = await readGraph(mirror.path);
      const common = shared({ changeSet, sideEffects, graphAfter });
      if (classification.kind === "pause-stop") {
        return {
          ...base(options.command),
          kind: "pause-stop",
          step: classification.step,
          action: classification.action ?? "edit",
          ...common
        };
      }
      return {
        ...base(options.command),
        kind: "conflict-stop",
        operation: classification.operation ?? "merge",
        step: classification.step,
        paths: classification.paths,
        ...common
      };
    }

    const [afterState, afterCommits, graphAfter] = await Promise.all([
      readModelledState(mirror.path),
      readReachableCommits(mirror.path),
      readGraph(mirror.path)
    ]);
    const changeSet = buildChangeSet(beforeState, afterState, beforeCommits, afterCommits);
    const blockingAnomaly = detectBlockingAnomaly(sideEffects, changeSet, run.code);

    if (classification.kind === "failure") {
      return {
        ...base(options.command),
        kind: "failure",
        exitCode: run.code,
        explanation: explainFailure(run.stderr),
        ...shared({ changeSet, sideEffects, blockingAnomaly, graphAfter })
      };
    }

    return {
      ...base(options.command),
      kind: "preview",
      ...shared({ changeSet, sideEffects, blockingAnomaly, graphAfter })
    };
  } finally {
    await mirror.dispose();
  }
}

export async function checkStaleness(input: {
  path: string;
  snapshot: ModelledState;
}): Promise<StalenessResult> {
  const repoPath = await resolveRepoPath(input.path);
  const current = await readModelledState(repoPath);
  return compareModelledState(input.snapshot, current);
}
