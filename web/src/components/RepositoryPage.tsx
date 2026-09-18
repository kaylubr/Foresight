import { useEffect } from "react";
import type { RepoConnectResult } from "../../../shared/types";
import { headLine } from "../lib/repoSummary";
import { ROUTE_PATHS } from "../lib/route";
import PageLink from "./PageLink";
import FidelityCaveats from "./repository/FidelityCaveats";
import InfoTip from "./InfoTip";
import RepoFacts from "./repository/RepoFacts";

const PURPOSE = "Foresight reads this repository and never writes to it.";
const CHANGE = "Disconnects this repository and returns you to the rehearsal screen.";

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

  return (
    <div className="repo-page">
      <section className="repo-frame" aria-label="Repository facts">
        <div className="repo-frame-head">
          <h1 className="page-title">{repo.name}</h1>
          <InfoTip label={`${PURPOSE} Path: ${repo.path}`} align="start">
            <span className="repo-tip-path">{repo.path}</span>
            {PURPOSE}
          </InfoTip>
          <div className="repo-frame-actions">
            <button className="quiet" onClick={onDisconnect} disabled={busy}>
              Change repository
            </button>
            <InfoTip label={CHANGE}>{CHANGE}</InfoTip>
          </div>
        </div>
        <p className="repo-identity">{headLine(repo)}</p>
        <RepoFacts repo={repo} />
      </section>
      <FidelityCaveats repo={repo} />
    </div>
  );
}
