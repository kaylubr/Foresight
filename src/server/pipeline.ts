import type {
  Caveat,
  ChangeSet,
  OutcomeBase,
  RehearsalOutcome,
  RepoConnectResult,
  StalenessResult,
  ModelledState,
  ToolErrorCause
} from "../shared/types";
import { caveat } from "../shared/caveats";
import { describeStaticDisqualifiers, readDynamicDisqualifiers, readStaticDisqualifiers } from "./disqualifiers";
import { readAliases, readIdentity } from "./config";
import { classifyRun } from "./classify";
import { buildChangeSet, compareFingerprints, compareModelledState, detectBlockingAnomaly } from "./diff";
import { readGit } from "./git";
import { createMirror, MirrorFailure } from "./mirror";
import { evaluateGuards } from "./guards";
import { prepareCommand } from "./parseCommand";
import {
  readFingerprints,
  readGraph,
  readIgnored,
  readModelledState,
  readReachableCommits,
  readUntracked
} from "./repoState";
import { probeNetworkDenial, runSandboxed, type DenialProbe } from "./sandbox";

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
    sideEffects: [],
    blockingAnomaly: false,
    caveats: [],
    originSnapshot: null,
    stdout: "",
    stderr: ""
  };
}

function emptyChangeSet(state: ModelledState, commits: string[]): ChangeSet {
  return buildChangeSet(state, state, commits, commits);
}

function refusal(
  display: string,
  code: string,
  reason: string,
  alternative: string | null
): RehearsalOutcome {
  return { ...base(display), kind: "refusal", code, reason, alternative };
}

function toolError(
  display: string,
  cause: ToolErrorCause,
  reason: string,
  nextStep: string
): RehearsalOutcome {
  return { ...base(display), kind: "tool-error", cause, reason, nextStep };
}

function applicableCaveats(input: {
  untracked: number;
  ignored: number;
  executed: boolean;
  mutator: boolean;
  referencesOrigin: boolean;
  autoAnsweredMerge: boolean;
  sequence: string | null;
}): Caveat[] {
  const caveats: Caveat[] = [];
  if (input.untracked > 0) {
    caveats.push(caveat("untracked-not-mirrored"));
  }
  if (input.ignored > 0) {
    caveats.push(caveat("ignored-not-mirrored"));
  }
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
      untracked: untracked.length,
      ignored: ignored.length,
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
  const originState = await readModelledState(repoPath);
  const originSnapshot = { takenAt: Date.now(), state: originState };
  const aliases = await readAliases(repoPath);
  const parsed = prepareCommand(options.command, aliases);

  if (!parsed.ok) {
    return refusal(options.command, parsed.code, parsed.reason, parsed.alternative);
  }

  const [untracked, ignored] = await Promise.all([readUntracked(repoPath), readIgnored(repoPath)]);

  const guards = evaluateGuards(parsed.command, {
    untracked,
    ignored,
    sequence: options.sequence ?? null
  });
  if (guards.refusal) {
    return refusal(
      options.command,
      guards.refusal.code,
      guards.refusal.reason,
      guards.refusal.alternative
    );
  }

  const dynamic = await readDynamicDisqualifiers(repoPath);
  if (dynamic.operation) {
    return refusal(
      options.command,
      "mid-operation",
      `the repository is in the middle of a ${dynamic.operation}, which cannot be mirrored faithfully`,
      "finish or abort the operation, then try again"
    );
  }

  const staticDisqualifiers = await readStaticDisqualifiers(repoPath);
  const staticReasons = describeStaticDisqualifiers(staticDisqualifiers);
  if (staticReasons.length > 0) {
    return refusal(
      options.command,
      "static-disqualifier",
      `this repository cannot be previewed because ${staticReasons.join("; ")}`,
      null
    );
  }

  const probe = await currentDenialProbe();
  if (!probe.ok || !probe.sandbox) {
    return toolError(options.command, probe.cause ?? "sandbox-unavailable", probe.reason, probe.nextStep);
  }

  let mirror;
  try {
    mirror = await createMirror(repoPath, originState);
  } catch (error) {
    if (error instanceof MirrorFailure) {
      const nextStep =
        error.cause === "clone-failed"
          ? "check that the repository can be cloned, and that there is disk space"
          : "check the repository's index and working tree state";
      return toolError(options.command, error.cause, error.message, nextStep);
    }
    throw error;
  }

  try {
    const beforeState = await readModelledState(mirror.path);
    const beforeFingerprints = await readFingerprints(mirror.path);
    const beforeCommits = await readReachableCommits(mirror.path);
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
      untracked: untracked.length,
      ignored: ignored.length,
      executed: true,
      mutator: parsed.command.kind === "mutator",
      referencesOrigin: parsed.command.subArgs.some((arg) => arg.includes("origin/")),
      autoAnsweredMerge: guards.autoAnswerMergeMessage,
      sequence: guards.sequence
    });

    if (run.timedOut) {
      return {
        ...toolError(
          options.command,
          "timeout",
          `the command was still running after ${COMMAND_TIMEOUT_MS} ms and was killed`,
          "raise the timeout, or check whether the command expects input on stdin"
        ),
        caveats
      };
    }
    if (run.outputCapped) {
      return {
        ...toolError(
          options.command,
          "output-capped",
          "the command produced more output than Foresight buffers",
          "check for a runaway command, or narrow it with a pathspec"
        ),
        caveats
      };
    }

    const afterState = await readModelledState(mirror.path);
    const afterFingerprints = await readFingerprints(mirror.path);
    const afterCommits = await readReachableCommits(mirror.path);
    const classification = await classifyRun(mirror.path, run.code);

    const sideEffects = compareFingerprints(beforeFingerprints, afterFingerprints);

    if (classification.kind === "conflict-stop" || classification.kind === "pause-stop") {
      const changeSet = emptyChangeSet(beforeState, beforeCommits);
      detectBlockingAnomaly(sideEffects, changeSet, run.code);
      await abortOperation(mirror.path, classification.operation);
      if (classification.kind === "pause-stop") {
        return {
          ...base(options.command),
          kind: "pause-stop",
          args: parsed.command.argv,
          step: classification.step,
          action: classification.action ?? "edit",
          changeSet,
          sideEffects,
          caveats,
          originSnapshot,
          stdout: run.stdout,
          stderr: run.stderr
        };
      }
      return {
        ...base(options.command),
        kind: "conflict-stop",
        args: parsed.command.argv,
        operation: classification.operation ?? "merge",
        step: classification.step,
        paths: classification.paths,
        changeSet,
        sideEffects,
        caveats,
        originSnapshot,
        stdout: run.stdout,
        stderr: run.stderr
      };
    }

    const changeSet = buildChangeSet(beforeState, afterState, beforeCommits, afterCommits);
    const blockingAnomaly = detectBlockingAnomaly(sideEffects, changeSet, run.code);

    if (classification.kind === "failure") {
      return {
        ...base(options.command),
        kind: "failure",
        args: parsed.command.argv,
        exitCode: run.code,
        changeSet,
        sideEffects,
        blockingAnomaly,
        caveats,
        originSnapshot,
        stdout: run.stdout,
        stderr: run.stderr
      };
    }

    return {
      ...base(options.command),
      kind: "preview",
      args: parsed.command.argv,
      changeSet,
      sideEffects,
      blockingAnomaly,
      caveats,
      originSnapshot,
      stdout: run.stdout,
      stderr: run.stderr
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
