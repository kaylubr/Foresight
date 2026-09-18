import type { SessionStatus } from "../../lib/status";

export default function StatusIndicator({ status }: { status: SessionStatus }) {
  return (
    <p
      className={`status ${status.tone} ${status.display}`}
      role="status"
      tabIndex={status.detail ? 0 : undefined}
      aria-describedby={status.detail ? "status-detail" : undefined}
    >
      {status.display === "word" ? (
        status.word
      ) : (
        <span className="visually-hidden">{status.word}</span>
      )}
      {status.detail ? (
        <span className="status-tip" id="status-detail" role="tooltip">
          {status.detail}
        </span>
      ) : null}
    </p>
  );
}
