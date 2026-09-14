import { useEffect, useMemo, useState } from "react";
import type { ChangeSet } from "../../shared/types";

interface Step {
  surface: string;
  text: string;
}

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

function short(value: string): string {
  return value.slice(0, 7);
}

export function buildSteps(changeSet: ChangeSet): Step[] {
  const steps: Step[] = [];

  const headChanged =
    changeSet.head.before !== changeSet.head.after ||
    changeSet.head.detachedBefore !== changeSet.head.detachedAfter;
  if (headChanged) {
    const before = changeSet.head.detachedBefore
      ? `detached at ${short(changeSet.head.before ?? "")}`
      : changeSet.head.before;
    const after = changeSet.head.detachedAfter
      ? `detached at ${short(changeSet.head.after ?? "")}`
      : changeSet.head.after;
    steps.push({ surface: "HEAD", text: `${before ?? "(unborn)"} becomes ${after ?? "(unborn)"}` });
  }

  for (const ref of changeSet.refs) {
    const direction =
      ref.before === null
        ? `created at ${short(ref.after ?? "")}`
        : ref.after === null
          ? `deleted (was ${short(ref.before)})`
          : `moved ${short(ref.before)} to ${short(ref.after)}`;
    steps.push({ surface: "refs", text: `${ref.name} ${direction}` });
  }

  if (changeSet.commitsAdded.length > 0) {
    steps.push({ surface: "commits", text: `${changeSet.commitsAdded.length} new commit(s) reachable` });
  }
  if (changeSet.commitsRemoved.length > 0) {
    steps.push({
      surface: "commits",
      text: `${changeSet.commitsRemoved.length} commit(s) no longer reachable`
    });
  }

  for (const change of changeSet.staged) {
    steps.push({ surface: "index", text: `${word(change.after)} ${change.path}` });
  }

  for (const change of changeSet.worktree) {
    steps.push({ surface: "worktree", text: `${word(change.after)} ${change.path}` });
  }

  return steps;
}

export default function ChangeSetView({ changeSet }: { changeSet: ChangeSet | null }) {
  const steps = useMemo(() => (changeSet ? buildSteps(changeSet) : []), [changeSet]);
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    setVisible(0);
    if (steps.length === 0) {
      return;
    }
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setVisible(index);
      if (index >= steps.length) {
        window.clearInterval(timer);
      }
    }, 240);
    return () => window.clearInterval(timer);
  }, [steps]);

  if (!changeSet) {
    return <p className="muted">No change set — the command did not run.</p>;
  }

  if (changeSet.empty) {
    return <p className="muted">Nothing in Modelled state changed.</p>;
  }

  return (
    <div>
      {steps.slice(0, visible).map((step, index) => (
        <div className="change-step" key={`${step.surface}-${index}`}>
          <span className="surface">{step.surface}</span>
          <span>{step.text}</span>
        </div>
      ))}
      {visible < steps.length ? <p className="muted">playing…</p> : null}
    </div>
  );
}
