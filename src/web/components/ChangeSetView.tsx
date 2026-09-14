import type { ChangeSet } from "../../shared/types";

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

function HeadLine({ changeSet }: { changeSet: ChangeSet }) {
  const { head } = changeSet;
  const label = head.detachedBefore ? "detached HEAD" : (head.before ?? "unborn");
  return (
    <div className="cs-row">
      <span className="cs-key">{label}</span>
      <span className="cs-from">{short(head.commitBefore)}</span>
      <span className="cs-arrow" aria-hidden="true">
        &rarr;
      </span>
      <span className="cs-to">{short(head.commitAfter)}</span>
    </div>
  );
}

export default function ChangeSetView({ changeSet }: { changeSet: ChangeSet }) {
  const headChanged =
    changeSet.head.before !== changeSet.head.after ||
    changeSet.head.detachedBefore !== changeSet.head.detachedAfter;

  const indexMoved =
    changeSet.indexCounts.before !== changeSet.indexCounts.after || changeSet.staged.length > 0;
  const worktreeMoved =
    changeSet.worktreeCounts.before !== changeSet.worktreeCounts.after ||
    changeSet.worktree.length > 0;

  return (
    <div className="changeset">
      <div className="cs-group">
        <h3 className="cs-group-label">Refs</h3>
        {changeSet.refs.length === 0 ? (
          <p className="cs-note">unchanged</p>
        ) : (
          changeSet.refs.map((ref) => (
            <div className="cs-row" key={ref.name}>
              <span className="cs-key">{ref.name}</span>
              <span className="cs-from">{short(ref.before)}</span>
              <span className="cs-arrow" aria-hidden="true">
                &rarr;
              </span>
              <span className={ref.after ? "cs-to" : "cs-to faint"}>
                {ref.after ? short(ref.after) : "deleted"}
              </span>
            </div>
          ))
        )}
        {changeSet.commitsAdded.length > 0 ? (
          <p className="cs-note">{changeSet.commitsAdded.length} commit(s) newly reachable</p>
        ) : null}
        {changeSet.commitsRemoved.length > 0 ? (
          <p className="cs-note">{changeSet.commitsRemoved.length} commit(s) no longer reachable</p>
        ) : null}
      </div>

      <div className="cs-group">
        <h3 className="cs-group-label">HEAD</h3>
        {headChanged ? <HeadLine changeSet={changeSet} /> : <p className="cs-note">unchanged</p>}
      </div>

      <div className="cs-group">
        <h3 className="cs-group-label">Index</h3>
        <div className="cs-row">
          <span className="cs-key">staged files</span>
          <span className="cs-from">{changeSet.indexCounts.before}</span>
          <span className="cs-arrow" aria-hidden="true">
            &rarr;
          </span>
          <span className={indexMoved ? "cs-to" : "cs-to faint"}>{changeSet.indexCounts.after}</span>
        </div>
        {changeSet.staged.map((change) => (
          <div className="cs-row" key={change.path}>
            <span className="cs-key">{change.path}</span>
            <span className="cs-from">{word(change.before)}</span>
            <span className="cs-arrow" aria-hidden="true">
              &rarr;
            </span>
            <span className={change.after === "." ? "cs-to faint" : "cs-to"}>
              {word(change.after)}
            </span>
          </div>
        ))}
      </div>

      <div className="cs-group">
        <h3 className="cs-group-label">Working directory</h3>
        <div className="cs-row">
          <span className="cs-key">modified files</span>
          <span className="cs-from">{changeSet.worktreeCounts.before}</span>
          <span className="cs-arrow" aria-hidden="true">
            &rarr;
          </span>
          <span className={worktreeMoved ? "cs-to" : "cs-to faint"}>
            {changeSet.worktreeCounts.after}
          </span>
        </div>
        {changeSet.worktree.map((change) => (
          <div className="cs-row" key={change.path}>
            <span className="cs-key">{change.path}</span>
            <span className="cs-from">{word(change.before)}</span>
            <span className="cs-arrow" aria-hidden="true">
              &rarr;
            </span>
            <span className={change.after === "." ? "cs-to faint" : "cs-to"}>
              {word(change.after)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
