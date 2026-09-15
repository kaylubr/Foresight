import type { ChangeSet } from "../../../shared/types";

const STATUS_WORDS: Record<string, string> = {
  M: "modified",
  A: "added",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "type changed",
  U: "unmerged",
  "?": "untracked",
  ".": "unchanged"
};

function word(status: string): string {
  return STATUS_WORDS[status] ?? status;
}

function short(value: string | null): string {
  return value ? value.slice(0, 7) : "none";
}

function Entry({
  label,
  before,
  after,
  afterFaint = false
}: {
  label: string;
  before: string;
  after: string;
  afterFaint?: boolean;
}) {
  return (
    <div className="cs-entry">
      <span className="cs-key">{label}</span>
      <span className="cs-transition">
        <span className="cs-from">{before}</span>
        <span className="cs-arrow" aria-hidden="true">
          &rarr;
        </span>
        <span className={afterFaint ? "cs-to faint" : "cs-to"}>{after}</span>
      </span>
    </div>
  );
}

export default function ChangeSetView({ changeSet }: { changeSet: ChangeSet }) {
  const { head } = changeSet;

  const headMoved =
    head.before !== head.after ||
    head.commitBefore !== head.commitAfter ||
    head.detachedBefore !== head.detachedAfter;

  const commitsMoved = changeSet.commitsAdded.length + changeSet.commitsRemoved.length;
  const stagedCount = changeSet.staged.length;
  const worktreeCount = changeSet.worktree.length;

  const indexMoved = changeSet.indexCounts.before !== changeSet.indexCounts.after || stagedCount > 0;
  const worktreeMoved =
    changeSet.worktreeCounts.before !== changeSet.worktreeCounts.after || worktreeCount > 0;

  const headBefore = short(head.commitBefore);
  const headAfter = short(head.commitAfter);

  return (
    <div className="changeset">
      {changeSet.refs.length > 0 || commitsMoved > 0 ? (
        <details className="cs-group">
          <summary>
            {changeSet.refs.length > 0 ? `Refs — ${changeSet.refs.length} moved` : "Refs"}
          </summary>
          {changeSet.refs.map((ref) => (
            <Entry
              key={ref.name}
              label={ref.name}
              before={short(ref.before)}
              after={ref.after ? short(ref.after) : "deleted"}
              afterFaint={!ref.after}
            />
          ))}
          {changeSet.commitsAdded.length > 0 ? (
            <p className="cs-note">{changeSet.commitsAdded.length} commit(s) newly reachable</p>
          ) : null}
          {changeSet.commitsRemoved.length > 0 ? (
            <p className="cs-note">{changeSet.commitsRemoved.length} commit(s) no longer reachable</p>
          ) : null}
        </details>
      ) : null}

      {headMoved ? (
        <details className="cs-group">
          <summary>{`HEAD — ${headBefore} → ${headAfter}`}</summary>
          <Entry
            label={head.detachedBefore ? "detached HEAD" : (head.before ?? "unborn")}
            before={headBefore}
            after={headAfter}
          />
        </details>
      ) : null}

      {indexMoved ? (
        <details className="cs-group">
          <summary>{`Index — ${stagedCount} staged`}</summary>
          <Entry
            label="staged files"
            before={String(changeSet.indexCounts.before)}
            after={String(changeSet.indexCounts.after)}
            afterFaint={changeSet.indexCounts.before === changeSet.indexCounts.after}
          />
          {changeSet.staged.map((change) => (
            <Entry
              key={change.path}
              label={change.path}
              before={word(change.before)}
              after={word(change.after)}
              afterFaint={change.after === "."}
            />
          ))}
        </details>
      ) : null}

      {worktreeMoved ? (
        <details className="cs-group">
          <summary>{`Working directory — ${worktreeCount} modified`}</summary>
          <Entry
            label="modified files"
            before={String(changeSet.worktreeCounts.before)}
            after={String(changeSet.worktreeCounts.after)}
            afterFaint={changeSet.worktreeCounts.before === changeSet.worktreeCounts.after}
          />
          {changeSet.worktree.map((change) => (
            <Entry
              key={change.path}
              label={change.path}
              before={word(change.before)}
              after={word(change.after)}
              afterFaint={change.after === "."}
            />
          ))}
        </details>
      ) : null}
    </div>
  );
}
