import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DynamicDisqualifiers, StaticDisqualifiers } from "../shared/types";
import { pathExists } from "./fsutil";
import { readGit, splitLines } from "./git";
import { resolveGitDir } from "./repoState";

async function exists(path: string): Promise<boolean> {
  return pathExists(path);
}

export async function readStaticDisqualifiers(repoPath: string): Promise<StaticDisqualifiers> {
  const [gitmodules, attributes, worktrees] = await Promise.all([
    exists(join(repoPath, ".gitmodules")),
    readFile(join(repoPath, ".gitattributes"), "utf8").catch(() => ""),
    readGit(["worktree", "list", "--porcelain"], repoPath)
  ]);
  const worktreeCount = splitLines(worktrees.stdout).filter((line) => line.startsWith("worktree ")).length;
  return {
    submodules: gitmodules,
    lfs: /filter=lfs/.test(attributes),
    linkedWorktrees: Math.max(0, worktreeCount - 1)
  };
}

export async function readDynamicDisqualifiers(repoPath: string): Promise<DynamicDisqualifiers> {
  const gitDir = await resolveGitDir(repoPath);
  const probes: Array<[string, string]> = [
    ["rebase", "rebase-merge"],
    ["rebase", "rebase-apply"],
    ["merge", "MERGE_HEAD"],
    ["cherry-pick", "CHERRY_PICK_HEAD"],
    ["revert", "REVERT_HEAD"],
    ["revert", "sequencer"],
    ["bisect", "BISECT_LOG"]
  ];
  for (const [operation, marker] of probes) {
    if (await exists(join(gitDir, marker))) {
      return { operation };
    }
  }
  return { operation: null };
}

export function describeStaticDisqualifiers(value: StaticDisqualifiers): string[] {
  const reasons: string[] = [];
  if (value.submodules) {
    reasons.push("it has submodules, which are not cloned and would re-share objects with the original");
  }
  if (value.lfs) {
    reasons.push("it uses Git LFS, whose files live outside the object store and can fetch over the network");
  }
  if (value.linkedWorktrees > 0) {
    reasons.push("it has linked worktrees, which are not copied into the mirror");
  }
  return reasons;
}
