import { Fragment, useEffect, useState } from "react";
import type { BrowseResult } from "../../../../shared/types";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";

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
          setFailed({ key, message: errorMessage(caught) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [current, hidden, key]);

  const listing = loaded?.listing ?? null;
  const error = failed?.key === key ? failed.message : null;
  const loading = loaded?.key !== key && error === null;
  const entries = listing?.entries ?? [];
  const trail = listing?.trail ?? [];

  return (
    <div className="repo-browser">
      {current !== null && trail.length > 0 ? (
        <nav className="browse-trail" aria-label="Folder trail">
          {trail.map((entry, index) => {
            const last = index === trail.length - 1;
            return (
              <Fragment key={entry.path ?? "roots"}>
                {last ? (
                  <span aria-current="location">{entry.label}</span>
                ) : (
                  <button
                    type="button"
                    className="browse-ancestor"
                    onClick={() => setCurrent(entry.path)}
                  >
                    {entry.label}
                  </button>
                )}
                {last ? null : (
                  <span className="browse-separator" aria-hidden="true">
                    /
                  </span>
                )}
              </Fragment>
            );
          })}
        </nav>
      ) : null}

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

      <label className="browse-hidden">
        <input
          type="checkbox"
          checked={hidden}
          onChange={(event) => setHidden(event.target.checked)}
        />
        Show hidden folders
      </label>

      {current !== null ? (
        <button
          type="button"
          className="primary browse-connect"
          disabled={loading}
          onClick={() => {
            if (current !== null) {
              onChoose(current);
            }
          }}
        >
          Connect this folder
        </button>
      ) : null}
    </div>
  );
}
