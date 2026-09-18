import type { RefState, RepoConnectResult } from "../../shared/types";

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

export function headLine(repo: RepoConnectResult): string {
  const commit = repo.state.head.commit?.slice(0, 7) ?? "none";
  return repo.state.head.detached ? `detached at ${commit}` : `${headLabel(repo)} @ ${commit}`;
}

export function countRefs(repo: RepoConnectResult, prefix: string): number {
  return repo.state.refs.filter((ref) => ref.name.startsWith(prefix)).length;
}

export interface FactRow {
  label: string;
  value: number;
}

export function factRows(repo: RepoConnectResult): FactRow[] {
  return [
    { label: "branches", value: countRefs(repo, "refs/heads/") },
    { label: "tags", value: countRefs(repo, "refs/tags/") },
    { label: "staged", value: repo.state.stagedEntries.length },
    { label: "modified", value: repo.state.worktreeEntries.length },
    { label: "untracked", value: repo.untracked.length },
    { label: "ignored", value: repo.ignored.length }
  ];
}

export interface RefRow {
  name: string;
  full: string;
  target: string;
}

export interface RefGroup {
  label: string;
  rows: RefRow[];
}

const REF_KINDS = [
  { label: "Local branches", prefix: "refs/heads/" },
  { label: "Remote-tracking", prefix: "refs/remotes/" },
  { label: "Tags", prefix: "refs/tags/" }
];

function refRow(ref: RefState, prefix: string): RefRow {
  return {
    name: ref.name.slice(prefix.length),
    full: ref.name,
    target: ref.target.slice(0, 7)
  };
}

export function refGroups(repo: RepoConnectResult): RefGroup[] {
  const claimed = new Set<string>();
  const groups = REF_KINDS.map(({ label, prefix }) => {
    const rows = repo.state.refs
      .filter((ref) => ref.name.startsWith(prefix))
      .map((ref) => {
        claimed.add(ref.name);
        return refRow(ref, prefix);
      });
    return { label, rows };
  });

  const rest = repo.state.refs.filter((ref) => !claimed.has(ref.name));
  if (rest.length > 0) {
    groups.push({ label: "Other refs", rows: rest.map((ref) => refRow(ref, "")) });
  }

  return groups.filter((group) => group.rows.length > 0);
}
