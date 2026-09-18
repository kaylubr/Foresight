import { useEffect, useState } from "react";
import type { BrowseResult } from "../../../shared/types";
import { api } from "../api";

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "unexpected failure";
}

export default function RepoBrowser({ onChoose }: { onChoose: (path: string) => void }) {
  const [current, setCurrent] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [loaded, setLoaded] = useState<{ key: string; listing: BrowseResult } | null>(null);
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null);

  const key = `${hidden ? "1" : "0"}:${current ?? ""}`;

  useEffect(() => {
    let cancelled = false;
    api
      .browse(current, hidden)
      .then((listing) => {
        if (!cancelled) {
          setLoaded({ key, listing });
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setFailed({ key, message: describe(caught) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [current, hidden, key]);

  const listing = loaded?.listing ?? null;
  const error = failed?.key === key ? failed.message : null;
  const loading = loaded?.key !== key && error === null;
  const parent = loaded?.key === key ? listing?.parent ?? null : null;
  const entries = listing?.entries ?? [];

  return (
    <div className="repo-browser">
      <div className="browse-head">
        <p className="browse-path">{current ?? "Choose a starting folder"}</p>
        <div className="browse-tools">
          <button
            type="button"
            className="icon-button"
            disabled={loading || parent === null}
            onClick={() => {
              if (parent !== null) {
                setCurrent(parent);
              }
            }}
            aria-label="Go to the parent folder"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
            <span className="icon-tip" role="tooltip">
              Go to the parent folder
            </span>
          </button>
          <label className="browse-hidden">
            <input
              type="checkbox"
              checked={hidden}
              onChange={(event) => setHidden(event.target.checked)}
            />
            Show hidden folders
          </label>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <ul className="browse-list">
        {entries.map((entry) => (
          <li key={entry.path}>
            <button
              type="button"
              className="browse-entry"
              onClick={() => setCurrent(entry.path)}
            >
              <span className="browse-name">{entry.name}</span>
              {entry.isRepo ? <span className="browse-repo">git</span> : null}
            </button>
          </li>
        ))}
        {!error && entries.length === 0 ? (
          <li className="browse-note">{loading ? "Reading" : "No folders here."}</li>
        ) : null}
      </ul>

      {listing?.truncated ? (
        <p className="browse-note">Showing the first {entries.length} folders.</p>
      ) : null}

      <div className="browse-actions">
        <button
          type="button"
          className="primary"
          disabled={current === null || loading}
          onClick={() => {
            if (current !== null) {
              onChoose(current);
            }
          }}
        >
          Connect this folder
        </button>
      </div>
    </div>
  );
}
