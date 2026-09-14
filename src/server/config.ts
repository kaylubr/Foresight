import { readGit, splitLines } from "./git";

export interface AliasEntry {
  name: string;
  value: string;
}

export interface RepoIdentity {
  name: string | null;
  email: string | null;
}

async function readAliasScope(repoPath: string, scope: "--global" | "--local"): Promise<AliasEntry[]> {
  const result = await readGit(["config", scope, "--get-regexp", "^alias\\."], repoPath);
  if (result.code !== 0) {
    return [];
  }
  return splitLines(result.stdout).map((line) => {
    const boundary = line.indexOf(" ");
    const key = boundary === -1 ? line : line.slice(0, boundary);
    return {
      name: key.slice("alias.".length),
      value: boundary === -1 ? "" : line.slice(boundary + 1)
    };
  });
}

export async function readAliases(repoPath: string): Promise<Map<string, AliasEntry>> {
  const [global, local] = await Promise.all([
    readAliasScope(repoPath, "--global"),
    readAliasScope(repoPath, "--local")
  ]);
  const merged = new Map<string, AliasEntry>();
  for (const entry of global) {
    merged.set(entry.name, entry);
  }
  for (const entry of local) {
    merged.set(entry.name, entry);
  }
  return merged;
}

export async function readIdentity(repoPath: string): Promise<RepoIdentity> {
  const [name, email] = await Promise.all([
    readGit(["config", "--get", "user.name"], repoPath),
    readGit(["config", "--get", "user.email"], repoPath)
  ]);
  return {
    name: name.code === 0 ? name.stdout.trim() : null,
    email: email.code === 0 ? email.stdout.trim() : null
  };
}
