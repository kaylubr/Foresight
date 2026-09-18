import type { ReactNode } from "react";
import type { ChangeSet } from "../../../../shared/types";
import { shortHash } from "../../lib/format";
import { statusWord } from "../../lib/statusCodes";
import "./ChangeSetView.css";

function word(status: string): string {
  return statusWord(status) ?? status;
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

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="changes-group">
      <h4 className="label">{title}</h4>
      {children}
    </section>
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

  const headBefore = shortHash(head.commitBefore, "none");
  const headAfter = shortHash(head.commitAfter, "none");

  const entryCount =
    changeSet.refs.length + (headMoved ? 1 : 0) + stagedCount + worktreeCount + commitsMoved;

  return (
    <details className="changes">
      <summary>{`Changes (${entryCount})`}</summary>
      <div className="changes-body">
        {changeSet.refs.length > 0 || commitsMoved > 0 ? (
          <Group title="Refs">
            {changeSet.refs.map((ref) => (
              <Entry
                key={ref.name}
                label={ref.name}
                before={shortHash(ref.before, "none")}
                after={ref.after ? shortHash(ref.after, "none") : "deleted"}
                afterFaint={!ref.after}
              />
            ))}
            {changeSet.commitsAdded.length > 0 ? (
              <p className="cs-note">{changeSet.commitsAdded.length} commit(s) newly reachable</p>
            ) : null}
            {changeSet.commitsRemoved.length > 0 ? (
              <p className="cs-note">{changeSet.commitsRemoved.length} commit(s) no longer reachable</p>
            ) : null}
          </Group>
        ) : null}

        {headMoved ? (
          <Group title="HEAD">
            <Entry
              label={head.detachedBefore ? "detached HEAD" : (head.before ?? "unborn")}
              before={headBefore}
              after={headAfter}
            />
          </Group>
        ) : null}

        {indexMoved ? (
          <Group title="Index">
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
          </Group>
        ) : null}

        {worktreeMoved ? (
          <Group title="Working directory">
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
          </Group>
        ) : null}
      </div>
    </details>
  );
}
