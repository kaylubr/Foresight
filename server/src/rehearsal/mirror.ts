import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ModelledState } from "../../../shared/types";
import type { ToolErrorCause } from "../../../shared/types";
import { readEnv, readGit, runGit, splitNul } from "../platform/git";
import { resolveGitDir } from "../repository/repoState";

export const DEAD_ORIGIN = "/foresight/dead-remote";
export const MIRROR_PREFIX = "foresight-";
const MAX_MIRRORED_UNTRACKED_FILES = 5000;

export function cloneArguments(originPath: string, clonePath: string): string[] {
  return ["clone", "--quiet", originPath, clonePath];
}

export async function sweepOrphanedMirrors(): Promise<number> {
  const temporary = tmpdir();
  const entries = await readdir(temporary, { withFileTypes: true }).catch(() => []);
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(MIRROR_PREFIX)) {
      continue;
    }
    const target = join(temporary, entry.name);
    try {
      await rm(target, { recursive: true, force: true });
      removed += 1;
    } catch {
      continue;
    }
  }
  return removed;
}

export interface Mirror {
  root: string;
  path: string;
  homeDir: string;
  warnings: string[];
  dispose: () => Promise<void>;
}

export class MirrorFailure extends Error {
  readonly cause: ToolErrorCause;

  constructor(cause: ToolErrorCause, message: string) {
    super(message);
    this.name = "MirrorFailure";
    this.cause = cause;
  }
}

async function copyWorktreeChange(originPath: string, clonePath: string, relativePath: string): Promise<void> {
  const source = join(originPath, relativePath);
  const target = join(clonePath, relativePath);
  const info = await lstat(source).catch(() => null);
  if (!info) {
    await rm(target, { force: true, recursive: true });
    return;
  }
  await mkdir(dirname(target), { recursive: true });
  if (info.isSymbolicLink()) {
    const link = await readlink(source);
    await rm(target, { force: true, recursive: true });
    await symlink(link, target);
    return;
  }
  await copyFile(source, target);
  await chmod(target, info.mode & 0o777);
}

async function mirrorStash(originPath: string, clonePath: string, state: ModelledState): Promise<void> {
  const stash = state.refs.find((ref) => ref.name === "refs/stash");
  if (!stash) {
    return;
  }
  const env = readEnv();
  await runGit(["update-ref", "refs/stash", stash.target], { cwd: clonePath, env, timeoutMs: 30_000 });
  const originGitDir = await resolveGitDir(originPath);
  const cloneGitDir = await resolveGitDir(clonePath);
  const stashLog = await readFile(join(originGitDir, "logs", "refs", "stash"), "utf8").catch(() => null);
  if (stashLog !== null) {
    const target = join(cloneGitDir, "logs", "refs", "stash");
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, stashLog, "utf8");
  }
}

export async function createMirror(
  originPath: string,
  originState: ModelledState,
  options: { includeIgnored: boolean } = { includeIgnored: false }
): Promise<Mirror> {
  const root = await mkdtemp(join(tmpdir(), MIRROR_PREFIX));
  const clonePath = join(root, "clone");
  const homeDir = join(root, "home");
  const warnings: string[] = [];
  await mkdir(homeDir, { recursive: true });

  const env = readEnv({ GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" });
  const dispose = (): Promise<void> => rm(root, { recursive: true, force: true });

  const clone = await runGit(cloneArguments(originPath, clonePath), {
    cwd: root,
    env,
    timeoutMs: 120_000
  });
  if (clone.code !== 0) {
    await dispose();
    throw new MirrorFailure("clone-failed", clone.stderr.trim() || "git clone failed");
  }

  const inClone = { cwd: clonePath, env, timeoutMs: 60_000 };

  await runGit(["remote", "set-url", "origin", DEAD_ORIGIN], inClone);
  await runGit(["checkout", "--quiet", "--detach"], inClone);

  for (const ref of originState.refs) {
    if (ref.name.startsWith("refs/heads/")) {
      await runGit(["update-ref", ref.name, ref.target], inClone);
    }
  }

  if (originState.head.symbolic) {
    await runGit(["symbolic-ref", "HEAD", originState.head.symbolic], inClone);
  } else if (originState.head.commit) {
    await runGit(["update-ref", "--no-deref", "HEAD", originState.head.commit], inClone);
  }

  if (originState.head.commit) {
    await runGit(["reset", "--hard", "--quiet"], inClone);
  }

  const branchName = originState.head.symbolic?.replace(/^refs\/heads\//, "");
  if (branchName) {
    await runGit(["config", "--unset", `branch.${branchName}.remote`], inClone);
    await runGit(["config", "--unset", `branch.${branchName}.merge`], inClone);
  }

  const lsFiles = await readGit(["ls-files", "--stage", "-z"], originPath);
  await runGit(["read-tree", "--empty"], inClone);
  if (lsFiles.stdout.length > 0) {
    const applied = await runGit(["update-index", "-z", "--index-info"], {
      ...inClone,
      stdin: lsFiles.stdout
    });
    if (applied.code !== 0) {
      await dispose();
      throw new MirrorFailure("mirror-failed", applied.stderr.trim() || "could not rebuild the index");
    }
  }
  await runGit(["checkout-index", "-a", "-f", "-u"], inClone);

  const changed = splitNul((await readGit(["diff", "--name-only", "-z", "--no-renames"], originPath)).stdout);
  for (const relativePath of changed) {
    await copyWorktreeChange(originPath, clonePath, relativePath);
  }

  const untracked = await readGit(["ls-files", "--others", "--exclude-standard", "-z"], originPath);
  const unmirrored = splitNul(untracked.stdout).sort();

  if (options.includeIgnored) {
    const ignored = await readGit(
      ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"],
      originPath
    );
    unmirrored.push(...splitNul(ignored.stdout).sort());
  }

  if (unmirrored.length > MAX_MIRRORED_UNTRACKED_FILES) {
    warnings.push(
      `This repository has ${unmirrored.length} untracked or ignored files. Foresight mirrored the first ${MAX_MIRRORED_UNTRACKED_FILES}, so a command that acts on the rest is not fully represented.`
    );
  }
  for (const relativePath of unmirrored.slice(0, MAX_MIRRORED_UNTRACKED_FILES)) {
    await copyWorktreeChange(originPath, clonePath, relativePath);
  }

  await mirrorStash(originPath, clonePath, originState);

  return { root, path: clonePath, homeDir, warnings, dispose };
}
