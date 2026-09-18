import { ROUTE_PATHS } from "../../lib/route";
import InfoTip from "../InfoTip";
import PageLink from "../PageLink";
import RepoBrowser from "./RepoBrowser";
import "./ConnectForm.css";

const FIELD_TIP =
  "Point Foresight at a local Git working copy. It reads the repository to show its state and never writes to it.";

export default function ConnectForm({
  path,
  onPathChange,
  browsing,
  onToggleBrowsing,
  onConnect,
  error,
  busy
}: {
  path: string;
  onPathChange: (path: string) => void;
  browsing: boolean;
  onToggleBrowsing: () => void;
  onConnect: (path: string) => Promise<void>;
  error: string | null;
  busy: boolean;
}) {
  return (
    <section className="section">
      <div className="connect-row">
        <div className="field repo-path-field">
          <div className="control">
            <input
              id="repo-path"
              value={path}
              placeholder={"C:\\Users\\you\\code\\project"}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => onPathChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void onConnect(path);
                }
              }}
            />
            <label htmlFor="repo-path">Repository path</label>
            <InfoTip label={FIELD_TIP}>{FIELD_TIP}</InfoTip>
          </div>
        </div>
        <button
          type="button"
          className="icon-button browse-open"
          onClick={onToggleBrowsing}
          aria-expanded={browsing}
          aria-label="Browse for a folder"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
          <span className="icon-tip" role="tooltip">
            Browse for a folder
          </span>
        </button>
        <button
          onClick={() => void onConnect(path)}
          disabled={busy || path.trim().length === 0}
        >
          Connect
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {browsing ? (
        <RepoBrowser
          onChoose={(chosen) => {
            onPathChange(chosen);
            void onConnect(chosen);
          }}
        />
      ) : null}
      <p className="muted">
        New here?{" "}
        <PageLink to={ROUTE_PATHS.about}>What Foresight is for</PageLink>.
      </p>
    </section>
  );
}
