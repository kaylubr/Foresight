import type { RepoConnectResult } from "../../shared/types";

export function caveatCount(repo: RepoConnectResult): number {
  return [
    repo.staticDisqualifiers.submodules,
    repo.staticDisqualifiers.lfs,
    repo.staticDisqualifiers.linkedWorktrees > 0,
    repo.dynamicDisqualifiers.operation !== null
  ].filter(Boolean).length;
}

export function headLabel(repo: RepoConnectResult): string {
  if (repo.state.head.detached) {
    return "detached";
  }
  return repo.state.head.symbolic?.replace("refs/heads/", "") ?? "unborn";
}

export function summaryParts(repo: RepoConnectResult): string[] {
  const branches = repo.state.refs.filter((ref) => ref.name.startsWith("refs/heads/")).length;
  const tags = repo.state.refs.filter((ref) => ref.name.startsWith("refs/tags/")).length;
  const commit = repo.state.head.commit?.slice(0, 7) ?? "none";

  const parts = [
    repo.state.head.detached ? `detached at ${commit}` : `${headLabel(repo)} @ ${commit}`,
    `${branches} branch${branches === 1 ? "" : "es"}`,
    `${tags} tag${tags === 1 ? "" : "s"}`,
    `${repo.state.stagedEntries.length} staged`,
    `${repo.state.worktreeEntries.length} modified`,
    `${repo.untracked.length} untracked`
  ];

  if (repo.ignored.length > 0) {
    parts.push(`${repo.ignored.length} ignored`);
  }
  if (
    repo.state.stagedEntries.length === 0 &&
    repo.state.worktreeEntries.length === 0 &&
    repo.untracked.length === 0
  ) {
    parts.push("clean repository state");
  }

  return parts;
}
