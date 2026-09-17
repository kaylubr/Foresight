import { useEffect } from "react";
import type { RepoConnectResult } from "../../../shared/types";
import { PageLink, ROUTE_PATHS } from "../route";
import { summaryParts } from "../repoSummary";
import RepoState from "./RepoState";

export default function RepositoryPage({
  repo,
  busy,
  onReload,
  onDisconnect
}: {
  repo: RepoConnectResult | null;
  busy: boolean;
  onReload: () => void;
  onDisconnect: () => void;
}) {
  useEffect(() => {
    if (repo) {
      onReload();
    }
  }, []);

  if (!repo) {
    return (
      <section className="section">
        <p className="empty">
          No repository is connected.{" "}
          <PageLink to={ROUTE_PATHS.workbench}>Connect one on the rehearsal screen</PageLink>.
        </p>
      </section>
    );
  }

  const parts = summaryParts(repo);

  return (
    <section className="section">
      <div className="repo-head">
        <p className="repo-path">{repo.path}</p>
        <div className="actions">
          <button className="quiet" onClick={onDisconnect} disabled={busy}>
            Change repository
          </button>
        </div>
      </div>
      <p className="repo-summary">
        {parts.map((part, index) => (
          <span key={part}>
            {index > 0 ? <span className="sep">&middot;</span> : null}
            {part}
          </span>
        ))}
      </p>
      <RepoState repo={repo} />
    </section>
  );
}
