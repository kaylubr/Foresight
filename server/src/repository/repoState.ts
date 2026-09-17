import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type {
  CommitNode,
  Fingerprints,
  GraphData,
  HeadState,
  ModelledState,
  RefState
} from "../../../shared/types";
import { readGit, readGitOk, splitLines, splitNul } from "../platform/git";

export function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashBuffer(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function readFileHash(path: string): Promise<string | null> {
  try {
    return hashBuffer(await readFile(path));
  } catch {
    return null;
  }
}

async function readMtimeMs(path: string): Promise<number | null> {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return null;
  }
}

export async function resolveGitDir(repoPath: string): Promise<string> {
  const output = await readGitOk(["rev-parse", "--absolute-git-dir"], repoPath);
  return output.trim();
}

async function readHead(repoPath: string): Promise<HeadState> {
  const symbolic = await readGit(["symbolic-ref", "-q", "HEAD"], repoPath);
  const revision = await readGit(["rev-parse", "HEAD"], repoPath);
  const commit = revision.code === 0 ? revision.stdout.trim() : null;
  if (symbolic.code === 0) {
    return { symbolic: symbolic.stdout.trim(), commit, detached: false };
  }
  return { symbolic: null, commit, detached: true };
}

async function readRefs(repoPath: string): Promise<RefState[]> {
  const output = await readGitOk(["for-each-ref", "--format=%(refname) %(objectname)"], repoPath);
  return splitLines(output).map((line) => {
    const boundary = line.indexOf(" ");
    return {
      name: line.slice(0, boundary),
      target: line.slice(boundary + 1)
    };
  });
}

interface StatusSplit {
  staged: string[];
  worktree: string[];
  raw: string;
}

function parseStatus(records: string[]): StatusSplit {
  const staged: string[] = [];
  const worktree: string[] = [];
  for (const record of records) {
    const kind = record[0];
    if (kind !== "1" && kind !== "u") {
      continue;
    }
    const fields = record.split(" ");
    const xy = fields[1] ?? "..";
    const path = fields.slice(kind === "1" ? 8 : 10).join(" ");
    const indexStatus = xy[0] ?? ".";
    const worktreeStatus = xy[1] ?? ".";
    if (indexStatus !== ".") {
      staged.push(`${indexStatus}\t${path}`);
    }
    if (worktreeStatus !== ".") {
      worktree.push(`${worktreeStatus}\t${path}`);
    }
  }
  staged.sort();
  worktree.sort();
  return { staged, worktree, raw: records.join("\u0000") };
}

async function readStatus(repoPath: string): Promise<StatusSplit> {
  const result = await readGit(
    ["status", "--porcelain=v2", "-z", "--untracked-files=no", "--no-renames"],
    repoPath
  );
  return parseStatus(splitNul(result.stdout));
}

export async function readModelledState(repoPath: string): Promise<ModelledState> {
  const [head, refs, status, lsFiles] = await Promise.all([
    readHead(repoPath),
    readRefs(repoPath),
    readStatus(repoPath),
    readGit(["ls-files", "--stage", "-z"], repoPath)
  ]);
  return {
    head,
    refs,
    indexDigest: hashText(lsFiles.stdout),
    stagedEntries: status.staged,
    worktreeDigest: hashText(status.raw),
    worktreeEntries: status.worktree
  };
}

export async function readUntracked(repoPath: string): Promise<string[]> {
  const output = await readGitOk(["ls-files", "--others", "--exclude-standard", "-z"], repoPath);
  return splitNul(output);
}

export async function readIgnored(repoPath: string): Promise<string[]> {
  const output = await readGitOk(
    ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"],
    repoPath
  );
  return splitNul(output);
}

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

async function readReflogTips(gitDir: string): Promise<Record<string, string>> {
  const logsDir = join(gitDir, "logs");
  const tips: Record<string, string> = {};
  for (const file of await walkFiles(logsDir)) {
    const content = await readFile(file, "utf8").catch(() => "");
    const lines = content.split("\n").filter((line) => line.length > 0);
    const last = lines[lines.length - 1] ?? "";
    const header = last.split("\t")[0] ?? "";
    const newSha = header.split(" ")[1] ?? "";
    tips[relative(logsDir, file).split(sep).join("/")] = newSha;
  }
  return tips;
}

function parseCountObjects(output: string): { count: number; inPack: number } {
  let count = 0;
  let inPack = 0;
  for (const line of splitLines(output)) {
    const [key, value] = line.split(":").map((part) => part.trim());
    if (key === "count") {
      count = Number.parseInt(value ?? "0", 10);
    }
    if (key === "in-pack") {
      inPack = Number.parseInt(value ?? "0", 10);
    }
  }
  return { count, inPack };
}

export async function readFingerprints(repoPath: string): Promise<Fingerprints> {
  const gitDir = await resolveGitDir(repoPath);
  const [configHash, packedRefsHash, commitGraphMtimeMs, reflogTips, counts] = await Promise.all([
    readFileHash(join(gitDir, "config")),
    readFileHash(join(gitDir, "packed-refs")),
    readMtimeMs(join(gitDir, "objects", "info", "commit-graph")),
    readReflogTips(gitDir),
    readGit(["count-objects", "-v"], repoPath)
  ]);
  const parsed = parseCountObjects(counts.stdout);
  return {
    configHash: configHash ?? "",
    packedRefsHash,
    commitGraphMtimeMs,
    reflogTips,
    objectCount: parsed.count,
    inPackCount: parsed.inPack
  };
}

export async function readReachableCommits(repoPath: string, limit = 2000): Promise<string[]> {
  const result = await readGit(["rev-list", "--all", `--max-count=${limit}`], repoPath);
  return splitLines(result.stdout);
}

export async function readGraph(repoPath: string, limit = 400): Promise<GraphData> {
  const format = "%H%x1f%P%x1f%an%x1f%aI%x1f%s%x1f%D%x1e";
  const [head, output] = await Promise.all([
    readHead(repoPath),
    readGitOk(
      [
        "log",
        "--branches",
        "--remotes",
        "--tags",
        "HEAD",
        "--date-order",
        `--max-count=${limit}`,
        `--format=${format}`
      ],
      repoPath
    )
  ]);
  const commits: CommitNode[] = output
    .split("\u001e")
    .map((record) => record.trim())
    .filter((record) => record.length > 0)
    .map((record) => {
      const [sha, parents, author, authoredAt, subject, refs] = record.split("\u001f");
      return {
        sha: sha ?? "",
        parents: (parents ?? "").split(" ").filter((parent) => parent.length > 0),
        author: author ?? "",
        authoredAt: authoredAt ?? "",
        subject: subject ?? "",
        refs: (refs ?? "")
          .split(",")
          .map((ref) => ref.trim())
          .filter((ref) => ref.length > 0)
          .filter((ref) => !/^[^/]+\/HEAD$/.test(ref))
      };
    });
  return { commits, head };
}
