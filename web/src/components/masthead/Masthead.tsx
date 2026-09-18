import type { RepoConnectResult } from "../../../../shared/types";
import brandUrl from "../../assets/brand.svg";
import { caveatCount, headLabel } from "../../lib/repoSummary";
import { ROUTE_PATHS } from "../../lib/route";
import type { Route } from "../../lib/route";
import type { SessionStatus } from "../../lib/status";
import PageLink from "../PageLink";
import StatusIndicator from "./StatusIndicator";

export default function Masthead({
  repo,
  route,
  status
}: {
  repo: RepoConnectResult | null;
  route: Route;
  status: SessionStatus;
}) {
  return (
    <header className="masthead">
      <div className="masthead-left">
        <h1 className="brand">
          <img src={brandUrl} alt="Foresight" />
        </h1>
        {repo ? (
          <PageLink
            to={ROUTE_PATHS.repository}
            current={route === "repository"}
            className="repo-line-link"
          >
            <span className="repo-line">
              <span className="repo-line-path">{repo.path}</span>
              <span>--→</span>
              <span className="repo-line-branch">{headLabel(repo)}</span>
              {caveatCount(repo) > 0 ? (
                <span className="repo-line-marker">
                  fidelity caveats ({caveatCount(repo)})
                </span>
              ) : null}
            </span>
          </PageLink>
        ) : null}
        <nav className="nav" aria-label="Pages">
          <PageLink to={ROUTE_PATHS.rehearsal} current={route === "rehearsal"}>
            Rehearsal
          </PageLink>
          {repo ? (
            <PageLink to={ROUTE_PATHS.repository} current={route === "repository"}>
              Repository
            </PageLink>
          ) : null}
          <PageLink to={ROUTE_PATHS.guarantees} current={route === "guarantees"}>
            Guarantees
          </PageLink>
          <PageLink to={ROUTE_PATHS.about} current={route === "about"}>
            About
          </PageLink>
        </nav>
      </div>
      <StatusIndicator status={status} />
    </header>
  );
}
