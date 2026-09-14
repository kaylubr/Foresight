import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathExists } from "./fsutil";
import { readGit, splitNul } from "./git";
import { resolveGitDir } from "./repoState";

export interface Classification {
  kind: "preview" | "conflict-stop" | "pause-stop" | "failure";
  operation: string | null;
  step: string | null;
  paths: string[];
  action: string | null;
}

async function exists(path: string): Promise<boolean> {
  return pathExists(path);
}

function parseUnmerged(output: string): string[] {
  const paths = new Set<string>();
  for (const record of splitNul(output)) {
    const separator = record.indexOf("\t");
    if (separator !== -1) {
      paths.add(record.slice(separator + 1));
    }
  }
  return [...paths].sort();
}

async function readStoppedSha(gitDir: string): Promise<string | null> {
  const candidates = [
    join(gitDir, "rebase-merge", "stopped-sha"),
    join(gitDir, "rebase-apply", "original-commit")
  ];
  for (const candidate of candidates) {
    const value = await readFile(candidate, "utf8").catch(() => null);
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

async function readStoppedAction(gitDir: string): Promise<string | null> {
  const done = await readFile(join(gitDir, "rebase-merge", "done"), "utf8").catch(() => null);
  if (done === null) {
    return null;
  }
  const lines = done
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  const last = lines[lines.length - 1];
  if (!last) {
    return null;
  }
  return last.split(/\s+/)[0] ?? null;
}

export async function classifyRun(clonePath: string, exitCode: number): Promise<Classification> {
  const gitDir = await resolveGitDir(clonePath);
  const unmergedOutput = await readGit(["ls-files", "-u", "-z"], clonePath);
  const paths = parseUnmerged(unmergedOutput.stdout);

  const hasRebaseState =
    (await exists(join(gitDir, "rebase-merge"))) || (await exists(join(gitDir, "rebase-apply")));
  const hasMergeState = await exists(join(gitDir, "MERGE_HEAD"));
  const hasCherryPickState = await exists(join(gitDir, "CHERRY_PICK_HEAD"));
  const hasRevertState = await exists(join(gitDir, "REVERT_HEAD"));

  let operation: string | null = null;
  if (hasRebaseState) {
    operation = "rebase";
  } else if (hasMergeState) {
    operation = "merge";
  } else if (hasCherryPickState) {
    operation = "cherry-pick";
  } else if (hasRevertState) {
    operation = "revert";
  }

  const step = await readStoppedSha(gitDir);

  if (paths.length > 0) {
    return {
      kind: "conflict-stop",
      operation: operation ?? "merge",
      step,
      paths,
      action: null
    };
  }

  if (hasRebaseState) {
    const action = await readStoppedAction(gitDir);
    if (action === "edit") {
      return { kind: "pause-stop", operation: "rebase", step, paths: [], action: "edit" };
    }
  }

  if (exitCode !== 0) {
    return { kind: "failure", operation, step, paths: [], action: null };
  }

  return { kind: "preview", operation: null, step: null, paths: [], action: null };
}
