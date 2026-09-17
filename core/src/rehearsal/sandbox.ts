import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RepoIdentity } from "../repository/config";
import { runProcess, type ProcessResult } from "../platform/git";

export type SandboxKind = "unshare" | "bwrap";

export interface Sandbox {
  kind: SandboxKind;
  wrap(argv: string[]): { file: string; args: string[] };
}

export interface DenialProbe {
  ok: boolean;
  sandbox: Sandbox | null;
  cause: "sandbox-unavailable" | "network-reachable" | null;
  reason: string;
  nextStep: string;
}

export interface SandboxRunOptions {
  clonePath: string;
  homeDir: string;
  identity: RepoIdentity;
  argv: string[];
  timeoutMs: number;
  sequence: string | null;
  autoAnswerMergeMessage: boolean;
}

const NET_PROBE_SCRIPT =
  'const net=require("net");const s=net.connect(80,"1.1.1.1");' +
  's.setTimeout(3000);s.on("connect",()=>process.exit(3));' +
  's.on("error",()=>process.exit(0));s.on("timeout",()=>process.exit(0));';

export function minimalEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    LC_ALL: "C"
  };
}

const UNSHARE_SANDBOX: Sandbox = {
  kind: "unshare",
  wrap: (argv) => ({ file: "unshare", args: ["-Urn", ...argv] })
};

const BWRAP_SANDBOX: Sandbox = {
  kind: "bwrap",
  wrap: (argv) => ({
    file: "bwrap",
    args: [
      "--unshare-net",
      "--die-with-parent",
      "--dev",
      "/dev",
      "--proc",
      "/proc",
      "--bind",
      "/",
      "/",
      ...argv
    ]
  })
};

async function sandboxWorks(sandbox: Sandbox): Promise<boolean> {
  const wrapped = sandbox.wrap(["true"]);
  const result = await runProcess(wrapped.file, wrapped.args, {
    cwd: process.cwd(),
    env: minimalEnv(),
    timeoutMs: 5_000
  });
  return result.code === 0;
}

export async function detectSandbox(): Promise<Sandbox | null> {
  if (await sandboxWorks(UNSHARE_SANDBOX)) {
    return UNSHARE_SANDBOX;
  }
  if (await sandboxWorks(BWRAP_SANDBOX)) {
    return BWRAP_SANDBOX;
  }
  return null;
}

export async function probeNetworkDenial(): Promise<DenialProbe> {
  const sandbox = await detectSandbox();
  if (!sandbox) {
    return {
      ok: false,
      sandbox: null,
      cause: "sandbox-unavailable",
      reason: "neither `unshare -Urn` nor `bwrap` could create an isolated namespace",
      nextStep: "install bubblewrap (`bwrap`), or enable unprivileged user namespaces"
    };
  }
  const wrapped = sandbox.wrap([process.execPath, "-e", NET_PROBE_SCRIPT]);
  const result = await runProcess(wrapped.file, wrapped.args, {
    cwd: process.cwd(),
    env: minimalEnv(),
    timeoutMs: 10_000
  });
  if (result.code === 3) {
    return {
      ok: false,
      sandbox,
      cause: "network-reachable",
      reason: `a connection succeeded from inside the ${sandbox.kind} sandbox`,
      nextStep: "Foresight refuses to preview while the network is reachable from the child"
    };
  }
  if (result.code === 0) {
    return { ok: true, sandbox, cause: null, reason: `network denied inside ${sandbox.kind}`, nextStep: "" };
  }
  return {
    ok: false,
    sandbox,
    cause: "sandbox-unavailable",
    reason: `the network probe exited with code ${result.code}`,
    nextStep: `check that ${sandbox.kind} and node both work on this machine`
  };
}

const SEQUENCE_EDITOR_SOURCE = [
  "#!/usr/bin/env node",
  'import { readFileSync, writeFileSync } from "node:fs";',
  "const target = process.argv[2];",
  "const source = process.env.FORESIGHT_SEQUENCE_FILE;",
  "if (!target || !source) {",
  "  process.exit(0);",
  "}",
  'writeFileSync(target, readFileSync(source, "utf8"));'
].join("\n");

async function writeControlledConfig(homeDir: string, identity: RepoIdentity): Promise<string> {
  const configPath = join(homeDir, "gitconfig");
  const lines: string[] = [];
  if (identity.name) {
    lines.push(`[user]`, `\tname = ${identity.name}`);
  }
  if (identity.email) {
    if (lines.length === 0) {
      lines.push("[user]");
    }
    lines.push(`\temail = ${identity.email}`);
  }
  await writeFile(configPath, lines.length > 0 ? `${lines.join("\n")}\n` : "", "utf8");
  return configPath;
}

export function buildSandboxEnv(internal: {
  homeDir: string;
  configPath: string;
  sequenceFile: string | null;
  sequenceEditorPath: string;
  autoAnswerMergeMessage: boolean;
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: internal.homeDir,
    LC_ALL: "C",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: internal.configPath,
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "/bin/false",
    SSH_ASKPASS: "/bin/false",
    GIT_PAGER: "cat",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_EDITOR: "/bin/true",
    GIT_ALLOW_PROTOCOL: "file",
    GIT_ATTR_NOSYSTEM: "1",
    GIT_CEILING_DIRECTORIES: internal.homeDir,
    GIT_SEQUENCE_EDITOR: internal.sequenceFile ? internal.sequenceEditorPath : "/bin/true"
  };
  if (internal.sequenceFile) {
    env.FORESIGHT_SEQUENCE_FILE = internal.sequenceFile;
  }
  if (internal.autoAnswerMergeMessage) {
    env.GIT_MERGE_AUTOEDIT = "no";
  }
  return env;
}

export async function runSandboxed(sandbox: Sandbox, options: SandboxRunOptions): Promise<ProcessResult> {
  const sequenceEditorPath = join(options.homeDir, "sequence-editor.mjs");
  await writeFile(sequenceEditorPath, SEQUENCE_EDITOR_SOURCE, { mode: 0o755 });

  let sequenceFile: string | null = null;
  if (options.sequence) {
    sequenceFile = join(options.homeDir, "sequence.txt");
    await writeFile(sequenceFile, options.sequence, "utf8");
  }

  const homeDir = options.homeDir;
  await mkdir(homeDir, { recursive: true });
  const configPath = await writeControlledConfig(homeDir, options.identity);

  const env = buildSandboxEnv({
    homeDir,
    configPath,
    sequenceFile,
    sequenceEditorPath,
    autoAnswerMergeMessage: options.autoAnswerMergeMessage
  });

  const wrapped = sandbox.wrap(["git", ...options.argv]);
  return runProcess(wrapped.file, wrapped.args, {
    cwd: options.clonePath,
    env,
    timeoutMs: options.timeoutMs,
    detached: true
  });
}
