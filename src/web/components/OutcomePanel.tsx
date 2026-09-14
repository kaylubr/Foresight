import type { ReactNode } from "react";
import type { RehearsalOutcome } from "../../shared/types";
import { TOOL_ERROR_LABELS } from "../api";
import ChangeSetView from "./ChangeSetView";

const KIND_LABELS: Record<RehearsalOutcome["kind"], string> = {
  preview: "Preview",
  "conflict-stop": "Would conflict here",
  "pause-stop": "Would pause here",
  failure: "Command failed",
  refusal: "Refused",
  "tool-error": "Foresight failed"
};

function short(value: string | null): string {
  return value ? value.slice(0, 7) : "unknown";
}

function headline(outcome: RehearsalOutcome): string {
  switch (outcome.kind) {
    case "preview":
      return outcome.changeSet?.empty
        ? "The command would change nothing in Modelled state."
        : "Here is what the command would change.";
    case "conflict-stop":
      return `The ${outcome.operation} would stop on a conflict at ${short(outcome.step)}; the rehearsal backed it out.`;
    case "pause-stop":
      return `The rebase would stop at an \`${outcome.action}\` step (${short(outcome.step)}) and hand control back to you.`;
    case "failure":
      return `git ran the command and exited with code ${outcome.exitCode}.`;
    case "refusal":
      return outcome.reason;
    case "tool-error":
      return TOOL_ERROR_LABELS[outcome.cause] ?? outcome.reason;
  }
}

export default function OutcomePanel({
  outcome,
  footer
}: {
  outcome: RehearsalOutcome;
  footer?: ReactNode;
}) {
  const showChangeSet =
    outcome.kind === "preview" || outcome.kind === "pause-stop" || outcome.kind === "failure";

  return (
    <div className={`panel outcome ${outcome.kind}`}>
      <div className="outcome-kind">{KIND_LABELS[outcome.kind]}</div>
      <div className="outcome-title">{headline(outcome)}</div>

      {outcome.kind === "refusal" && outcome.alternative ? (
        <p className="muted">Try instead: {outcome.alternative}</p>
      ) : null}

      {outcome.kind === "tool-error" ? (
        <>
          <p className="muted">{outcome.reason}</p>
          <p className="muted">Next step: {outcome.nextStep}</p>
        </>
      ) : null}

      {outcome.kind === "conflict-stop" && outcome.paths.length > 0 ? (
        <ul className="stop-list">
          {outcome.paths.map((path) => (
            <li key={path}>{path}</li>
          ))}
        </ul>
      ) : null}

      {outcome.kind === "pause-stop" && outcome.action ? (
        <p className="muted">
          Foresight stopped the rehearsal there rather than resolving it; the clone was discarded.
        </p>
      ) : null}

      {showChangeSet ? <ChangeSetView changeSet={outcome.changeSet} /> : null}

      {(outcome.kind === "failure" || outcome.kind === "tool-error") &&
      outcome.stderr.trim().length > 0 ? (
        <pre className="muted">{outcome.stderr.trim().slice(0, 2000)}</pre>
      ) : null}

      {outcome.blockingAnomaly ? (
        <div className="badge blocking" style={{ marginTop: 10 }}>
          Blocking anomaly: the object store moved and no Modelled surface explains it
        </div>
      ) : null}

      {outcome.sideEffects.length > 0 ? (
        <div className="badges">
          {outcome.sideEffects.map((badge) => (
            <span key={badge.surface} className={badge.blocking ? "badge blocking" : "badge"} title={badge.detail}>
              {badge.label}
            </span>
          ))}
        </div>
      ) : null}

      {outcome.caveats.map((caveat) => (
        <div className="caveat" key={caveat.id}>
          {caveat.label} — <span className="muted">{caveat.detail}</span>
        </div>
      ))}

      {footer}
    </div>
  );
}
