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

function plain(value: string): string {
  return value.replace(/`/g, "");
}

function short(value: string | null): string {
  return value ? value.slice(0, 7) : "unknown";
}

function headline(outcome: RehearsalOutcome): string {
  switch (outcome.kind) {
    case "preview":
      return outcome.changeSet?.empty
        ? "Nothing in Modelled state changed."
        : "Changes detected across the modelled state.";
    case "conflict-stop":
      return `Stopped at ${short(outcome.step)}; the rehearsal backed it out.`;
    case "pause-stop":
      return `The rebase would stop at an \`${outcome.action}\` step and hand control back to you.`;
    case "failure":
      return `git ran the command and exited with code ${outcome.exitCode}.`;
    case "refusal":
      return "Foresight refused to rehearse this command.";
    case "tool-error":
      return TOOL_ERROR_LABELS[outcome.cause] ?? "Foresight could not complete the rehearsal.";
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
    <div className={`outcome ${outcome.kind}`}>
      <div className="outcome-head">
        <p className="outcome-kind">{KIND_LABELS[outcome.kind]}</p>
        <p className="outcome-command">{outcome.display}</p>
        <h3 className="outcome-headline">{headline(outcome)}</h3>
      </div>

      {outcome.kind === "refusal" ? (
        <div className="detail">
          <h4 className="label">Reason</h4>
          <p>{plain(outcome.reason)}</p>
          {outcome.alternative ? (
            <>
              <h4 className="label">Alternative</h4>
              <p>{plain(outcome.alternative)}</p>
            </>
          ) : null}
        </div>
      ) : null}

      {outcome.kind === "tool-error" ? (
        <div className="detail">
          <h4 className="label">Cause</h4>
          <p>{plain(outcome.reason)}</p>
          <h4 className="label">Next step</h4>
          <p>{plain(outcome.nextStep)}</p>
        </div>
      ) : null}

      {outcome.kind === "conflict-stop" && outcome.paths.length > 0 ? (
        <div className="detail">
          <h4 className="label">Unmerged paths</h4>
          <ul className="stop-list">
            {outcome.paths.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {outcome.kind === "pause-stop" ? (
        <div className="detail">
          <h4 className="label">Behaviour</h4>
          <p>
            Foresight stopped the rehearsal there rather than resolving it, and discarded the clone.
          </p>
        </div>
      ) : null}

      {outcome.kind === "failure" && outcome.stderr.trim().length > 0 ? (
        <div className="detail">
          <h4 className="label">git output</h4>
          <pre className="diagnostic">{outcome.stderr.trim().slice(0, 2000)}</pre>
        </div>
      ) : null}

      {outcome.kind === "tool-error" && outcome.stderr.trim().length > 0 ? (
        <div className="detail">
          <h4 className="label">git output</h4>
          <pre className="diagnostic">{outcome.stderr.trim().slice(0, 2000)}</pre>
        </div>
      ) : null}

      {showChangeSet && outcome.changeSet ? (
        <div className="detail">
          <h4 className="label">Change set</h4>
          <ChangeSetView changeSet={outcome.changeSet} />
        </div>
      ) : null}

      {outcome.blockingAnomaly ? (
        <div className="anomaly">
          <h4 className="label">Blocking anomaly</h4>
          <p>The object store changed, but no modelled change explains it.</p>
        </div>
      ) : null}

      {outcome.sideEffects.length > 0 ? (
        <div className="detail">
          <h4 className="label">Side effects</h4>
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
      ) : null}

      {footer}
    </div>
  );
}
