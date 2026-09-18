import type { ReactNode } from "react";
import type { ChangeSet, RehearsalOutcome } from "../../../../shared/types";
import { TOOL_ERROR_LABELS } from "../../lib/api";
import { shortHash } from "../../lib/format";
import ChangeSetView from "./ChangeSetView";
import "./OutcomePanel.css";

const UNMERGED_PREVIEW = 5;

const KIND_LABELS: Record<RehearsalOutcome["kind"], string> = {
  preview: "Preview",
  "conflict-stop": "Would conflict here",
  "pause-stop": "Would pause here",
  failure: "Command failed",
  refusal: "Refused",
  "tool-error": "Foresight failed"
};

interface Explainer {
  label: string;
  text?: string;
  paths?: string[];
}

function plain(value: string): string {
  return value.replace(/`/g, "");
}

function changeParts(changeSet: ChangeSet): string[] {
  const { head } = changeSet;
  const parts: string[] = [];

  if (
    head.before !== head.after ||
    head.commitBefore !== head.commitAfter ||
    head.detachedBefore !== head.detachedAfter
  ) {
    parts.push(`HEAD ${shortHash(head.commitBefore, "unknown")} \u2192 ${shortHash(head.commitAfter, "unknown")}`);
  }
  if (changeSet.refs.length > 0) {
    parts.push(`${changeSet.refs.length} ref${changeSet.refs.length === 1 ? "" : "s"} moved`);
  }
  if (changeSet.staged.length > 0) {
    parts.push(`${changeSet.staged.length} staged`);
  }
  if (changeSet.worktree.length > 0) {
    parts.push(`${changeSet.worktree.length} modified`);
  }
  const commits = changeSet.commitsAdded.length + changeSet.commitsRemoved.length;
  if (commits > 0) {
    parts.push(`${commits} commit${commits === 1 ? "" : "s"}`);
  }

  return parts;
}

function verdictParts(outcome: RehearsalOutcome): string[] {
  const counted = outcome.changeSet ? changeParts(outcome.changeSet) : [];
  if (counted.length > 0) {
    return counted;
  }

  switch (outcome.kind) {
    case "preview":
      return ["Nothing in the modelled state changed."];
    case "conflict-stop":
      return [`Would stop at ${shortHash(outcome.step, "unknown")}.`];
    case "pause-stop":
      return [`Would stop at an ${outcome.action} step.`];
    case "failure":
      return [`git exited with code ${outcome.exitCode}.`];
    case "refusal":
      return [];
    case "tool-error":
      return [TOOL_ERROR_LABELS[outcome.cause] ?? "Foresight could not complete the rehearsal."];
  }
}

function explainersFor(outcome: RehearsalOutcome): Explainer[] {
  switch (outcome.kind) {
    case "refusal": {
      const items: Explainer[] = [{ label: "Reason", text: plain(outcome.reason) }];
      if (outcome.alternative) {
        items.push({ label: "Alternative", text: plain(outcome.alternative) });
      }
      return items;
    }
    case "tool-error":
      return [
        { label: "Cause", text: plain(outcome.reason) },
        { label: "Next step", text: plain(outcome.nextStep) }
      ];
    case "conflict-stop":
      return outcome.paths.length > 0 ? [{ label: "Unmerged paths", paths: outcome.paths }] : [];
    case "pause-stop":
      return [
        {
          label: "Behaviour",
          text: "Foresight stopped the rehearsal there rather than resolving it, and discarded the clone."
        }
      ];
    case "failure":
      return outcome.explanation ? [{ label: "What this means", text: outcome.explanation }] : [];
    case "preview":
      return [];
  }
}

export default function OutcomePanel({
  outcome,
  stale,
  actions
}: {
  outcome: RehearsalOutcome;
  stale?: ReactNode;
  actions?: ReactNode;
}) {
  const showChangeSet =
    outcome.kind === "preview" || outcome.kind === "pause-stop" || outcome.kind === "failure";

  const parts = verdictParts(outcome);
  const explainers = explainersFor(outcome);
  const divergenceCount = outcome.fidelityWarnings.length + outcome.caveats.length;
  const gitOutput =
    outcome.kind === "failure" || outcome.kind === "tool-error"
      ? outcome.stderr.trim().slice(0, 2000)
      : "";

  return (
    <div className={`outcome ${outcome.kind}`}>
      <div className="verdict">
        <div className="verdict-head">
          <p className="verdict-line">
            <span className="verdict-kind">{KIND_LABELS[outcome.kind]}</span>
            {parts.map((part) => (
              <span key={part}>
                <span className="sep">+</span>
                {part}
              </span>
            ))}
          </p>
          {actions ? <div className="verdict-actions">{actions}</div> : null}
        </div>

        {stale}

        {explainers.map((explainer) => (
          <div className="explainer" key={explainer.label}>
            <p className="caption">{explainer.label}</p>
            {explainer.text ? <p>{explainer.text}</p> : null}
            {explainer.paths ? (
              <>
                <ul className="stop-list">
                  {explainer.paths.slice(0, UNMERGED_PREVIEW).map((path) => (
                    <li key={path}>{path}</li>
                  ))}
                </ul>
                {explainer.paths.length > UNMERGED_PREVIEW ? (
                  <details>
                    <summary>{`+${explainer.paths.length - UNMERGED_PREVIEW} more`}</summary>
                    <ul className="stop-list">
                      {explainer.paths.slice(UNMERGED_PREVIEW).map((path) => (
                        <li key={path}>{path}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </>
            ) : null}
          </div>
        ))}
      </div>

      {gitOutput.length > 0 ? (
        <details className="aside">
          <summary>{`git output (${gitOutput.split("\n").length} lines)`}</summary>
          <div className="aside-body">
            <pre className="diagnostic">{gitOutput}</pre>
          </div>
        </details>
      ) : null}

      {showChangeSet && outcome.changeSet && !outcome.changeSet.empty ? (
        <ChangeSetView changeSet={outcome.changeSet} />
      ) : null}

      {divergenceCount > 0 ? (
        <details className="aside">
          <summary>{`Why this may differ (${divergenceCount})`}</summary>
          <div className="aside-body">
            {outcome.fidelityWarnings.length > 0 ? (
              <div className="fidelity">
                {outcome.fidelityWarnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}
            {outcome.caveats.map((caveat) => (
              <p className="caveat-item" key={caveat.id}>
                <span className="name">{caveat.label}</span> {caveat.detail}
              </p>
            ))}
          </div>
        </details>
      ) : null}

      {outcome.sideEffects.length > 0 ? (
        <details className="aside">
          <summary>{`What Foresight could not model (${outcome.sideEffects.length})`}</summary>
          <div className="aside-body">
            <p className="muted">
              Detected but not modelled directly. Foresight cannot say what these mean for your
              repository beyond the fact that they moved.
            </p>
            <ul className="side-effects">
              {outcome.sideEffects.map((badge) => (
                <li
                  key={badge.surface}
                  className={badge.blocking ? "side-effect blocking" : "side-effect"}
                >
                  <span className="name">{badge.label}</span>
                  <span className="note">{badge.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      ) : null}

      {outcome.blockingAnomaly ? (
        <div className="anomaly">
          <p className="caption">Blocking anomaly</p>
          <p>The object store changed, but no modelled change explains it.</p>
        </div>
      ) : null}
    </div>
  );
}
