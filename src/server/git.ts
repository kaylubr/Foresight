import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

const DEFAULT_OUTPUT_CAP_BYTES = 8 * 1024 * 1024;

export interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputCapped: boolean;
  spawnError: NodeJS.ErrnoException | null;
}

export interface ProcessOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  detached?: boolean;
  outputCapBytes?: number;
  stdin?: string;
}

export function killProcessGroup(child: ChildProcess, signal: NodeJS.Signals = "SIGKILL"): void {
  if (!child.pid) {
    return;
  }
  try {
    process.kill(-child.pid, signal);
    return;
  } catch {
    try {
      child.kill(signal);
    } catch {
      return;
    }
  }
}

function isSpawnError(error: Error): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "EACCES";
}

export function runProcess(file: string, args: string[], options: ProcessOptions): Promise<ProcessResult> {
  return new Promise<ProcessResult>((resolve) => {
    const cap = options.outputCapBytes ?? DEFAULT_OUTPUT_CAP_BYTES;
    let settled = false;
    let timedOut = false;
    let outputCapped = false;
    let stdout = "";
    let stderr = "";
    let spawnError: NodeJS.ErrnoException | null = null;

    const child = spawn(file, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      detached: options.detached ?? false,
      stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"]
    });

    const append = (chunk: Buffer, stream: "stdout" | "stderr"): void => {
      const text = chunk.toString("utf8");
      const current = stream === "stdout" ? stdout : stderr;
      if (current.length >= cap) {
        outputCapped = true;
        return;
      }
      const next = current + text;
      if (next.length > cap) {
        outputCapped = true;
        if (stream === "stdout") {
          stdout = next.slice(0, cap);
        } else {
          stderr = next.slice(0, cap);
        }
        return;
      }
      if (stream === "stdout") {
        stdout = next;
      } else {
        stderr = next;
      }
    };

    child.stdout?.on("data", (chunk: Buffer) => append(chunk, "stdout"));
    child.stderr?.on("data", (chunk: Buffer) => append(chunk, "stderr"));

    child.on("error", (error: Error) => {
      spawnError = isSpawnError(error) ? (error as NodeJS.ErrnoException) : null;
    });

    if (options.stdin !== undefined && child.stdin) {
      child.stdin.end(options.stdin);
    }

    const timer =
      options.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            killProcessGroup(child);
          }, options.timeoutMs)
        : null;

    child.on("close", (code: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      if (outputCapped && !timedOut) {
        killProcessGroup(child);
      }
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
        timedOut,
        outputCapped,
        spawnError
      });
    });
  });
}

export function runGit(args: string[], options: ProcessOptions): Promise<ProcessResult> {
  return runProcess("git", args, options);
}

export function readEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    LC_ALL: "C",
    GIT_PAGER: "cat",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    ...overrides
  };
}

export async function readGit(args: string[], cwd: string): Promise<ProcessResult> {
  return runGit(["--no-optional-locks", ...args], { cwd, env: readEnv(), timeoutMs: 20_000 });
}

export async function readGitOk(args: string[], cwd: string): Promise<string> {
  const result = await readGit(args, cwd);
  if (result.code !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim() || `exit ${result.code}`}`);
  }
  return result.stdout;
}

export async function readGitLines(args: string[], cwd: string): Promise<string[]> {
  const output = await readGitOk(args, cwd);
  return splitLines(output);
}

export function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function splitNul(value: string): string[] {
  return value.split("\u0000").filter((entry) => entry.length > 0);
}
