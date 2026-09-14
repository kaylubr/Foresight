import type {
  ChangeSet,
  Fingerprints,
  HeadChange,
  HeadState,
  ModelledState,
  PathChange,
  RefChange,
  SideEffectBadge,
  StalenessResult
} from "../shared/types";

function headIdentity(head: HeadState): string | null {
  return head.symbolic ?? head.commit;
}

function parseEntries(entries: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of entries) {
    const separator = entry.indexOf("\t");
    map.set(entry.slice(separator + 1), entry.slice(0, separator));
  }
  return map;
}

function diffEntries(before: string[], after: string[]): PathChange[] {
  const beforeMap = parseEntries(before);
  const afterMap = parseEntries(after);
  const paths = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort();
  const changes: PathChange[] = [];
  for (const path of paths) {
    const beforeStatus = beforeMap.get(path) ?? ".";
    const afterStatus = afterMap.get(path) ?? ".";
    if (beforeStatus !== afterStatus) {
      changes.push({ path, before: beforeStatus, after: afterStatus });
    }
  }
  return changes;
}

export function buildChangeSet(
  before: ModelledState,
  after: ModelledState,
  commitsBefore: string[],
  commitsAfter: string[]
): ChangeSet {
  const beforeRefs = new Map(before.refs.map((ref) => [ref.name, ref.target]));
  const afterRefs = new Map(after.refs.map((ref) => [ref.name, ref.target]));
  const refs: RefChange[] = [];
  for (const name of [...new Set([...beforeRefs.keys(), ...afterRefs.keys()])].sort()) {
    const previous = beforeRefs.get(name) ?? null;
    const next = afterRefs.get(name) ?? null;
    if (previous !== next) {
      refs.push({ name, before: previous, after: next });
    }
  }

  const head: HeadChange = {
    before: headIdentity(before.head),
    after: headIdentity(after.head),
    commitBefore: before.head.commit,
    commitAfter: after.head.commit,
    detachedBefore: before.head.detached,
    detachedAfter: after.head.detached
  };

  const staged = diffEntries(before.stagedEntries, after.stagedEntries);
  const worktree = diffEntries(before.worktreeEntries, after.worktreeEntries);
  const indexChanged = before.indexDigest !== after.indexDigest || staged.length > 0;
  const worktreeChanged = before.worktreeDigest !== after.worktreeDigest || worktree.length > 0;

  const beforeCommits = new Set(commitsBefore);
  const afterCommits = new Set(commitsAfter);
  const commitsAdded = commitsAfter.filter((sha) => !beforeCommits.has(sha));
  const commitsRemoved = commitsBefore.filter((sha) => !afterCommits.has(sha));

  const headChanged = head.before !== head.after || head.detachedBefore !== head.detachedAfter;
  const empty =
    refs.length === 0 &&
    !headChanged &&
    !indexChanged &&
    !worktreeChanged &&
    staged.length === 0 &&
    worktree.length === 0 &&
    commitsAdded.length === 0 &&
    commitsRemoved.length === 0;

  return {
    empty,
    refs,
    head,
    indexChanged,
    indexCounts: { before: before.stagedEntries.length, after: after.stagedEntries.length },
    staged,
    worktreeChanged,
    worktreeCounts: { before: before.worktreeEntries.length, after: after.worktreeEntries.length },
    worktree,
    commitsAdded,
    commitsRemoved
  };
}

function recordsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}

export function compareFingerprints(before: Fingerprints, after: Fingerprints): SideEffectBadge[] {
  const badges: SideEffectBadge[] = [];
  if (before.configHash !== after.configHash) {
    badges.push({
      surface: "config",
      label: "config changed",
      detail: ".git/config was modified during the run",
      blocking: false
    });
  }
  if (!recordsEqual(before.reflogTips, after.reflogTips)) {
    badges.push({
      surface: "reflog",
      label: "reflog changed",
      detail: "reflog entries differ from before the run",
      blocking: false
    });
  }
  if (before.objectCount !== after.objectCount || before.inPackCount !== after.inPackCount) {
    badges.push({
      surface: "object-store",
      label: "object store changed",
      detail: `loose ${before.objectCount} to ${after.objectCount}, packed ${before.inPackCount} to ${after.inPackCount}`,
      blocking: false
    });
  }
  if (before.packedRefsHash !== after.packedRefsHash) {
    badges.push({
      surface: "packed-refs",
      label: "packed-refs changed",
      detail: "refs were repacked or rewritten",
      blocking: false
    });
  }
  if (before.commitGraphMtimeMs !== after.commitGraphMtimeMs) {
    badges.push({
      surface: "commit-graph",
      label: "commit-graph touched",
      detail: "the commit-graph file changed",
      blocking: false
    });
  }
  return badges;
}

const OBJECT_STORE_SURFACES = new Set(["object-store", "packed-refs", "commit-graph"]);

export function detectBlockingAnomaly(
  badges: SideEffectBadge[],
  changeSet: ChangeSet,
  exitCode: number
): boolean {
  const objectStoreMoved = badges.some((badge) => OBJECT_STORE_SURFACES.has(badge.surface));
  if (exitCode !== 0) {
    return false;
  }
  const anomaly = objectStoreMoved && changeSet.empty;
  if (anomaly) {
    for (const badge of badges) {
      if (OBJECT_STORE_SURFACES.has(badge.surface)) {
        badge.blocking = true;
      }
    }
  }
  return anomaly;
}

export function compareModelledState(before: ModelledState, after: ModelledState): StalenessResult {
  const changed: string[] = [];
  if (headIdentity(before.head) !== headIdentity(after.head)) {
    changed.push("HEAD");
  }
  if (before.indexDigest !== after.indexDigest) {
    changed.push("the index");
  }
  if (before.worktreeDigest !== after.worktreeDigest) {
    changed.push("the working directory");
  }
  const beforeRefs = JSON.stringify([...before.refs].sort((a, b) => a.name.localeCompare(b.name)));
  const afterRefs = JSON.stringify([...after.refs].sort((a, b) => a.name.localeCompare(b.name)));
  if (beforeRefs !== afterRefs) {
    changed.push("refs");
  }
  return { stale: changed.length > 0, changed };
}
