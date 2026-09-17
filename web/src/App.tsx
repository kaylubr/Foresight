import { useCallback, useEffect, useRef, useState } from "react";
import type {
  HealthResult,
  RehearsalOutcome,
  RepoConnectResult,
  StalenessResult
} from "../../shared/types";
import { api } from "./api";
import brandUrl from "./assets/brand.svg";
import CommitGraph from "./components/CommitGraph";
import GuaranteesPage from "./components/GuaranteesPage";
import OutcomePanel from "./components/OutcomePanel";
import RepositoryPage from "./components/RepositoryPage";
import { caveatCount, headLabel } from "./repoSummary";
import { PageLink, ROUTE_PATHS, navigate, useRoute } from "./route";

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "unexpected failure";
}

type Activity = "connect" | "refresh" | "rehearse";

export default function App() {
  const [repoPath, setRepoPath] = useState("");
  const [repo, setRepo] = useState<RepoConnectResult | null>(null);
  const [command, setCommand] = useState("");
  const [sequence, setSequence] = useState("");
  const [outcome, setOutcome] = useState<RehearsalOutcome | null>(null);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [staleness, setStaleness] = useState<StalenessResult | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [healthChecked, setHealthChecked] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const copyTimer = useRef<number | null>(null);
  const route = useRoute();

  const busy = activity !== null;

  const refreshHealth = useCallback(async (force: boolean) => {
    try {
      setHealth(force ? await api.probe() : await api.health());
    } catch {
      setHealth(null);
    } finally {
      setHealthChecked(true);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      await refreshHealth(false);
    };
    void load();
  }, [refreshHealth]);

  useEffect(() => {
    const recheck = () => {
      void refreshHealth(true);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        recheck();
      }
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshHealth]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  useEffect(() => {
    setCopyStatus("idle");
  }, [outcome]);

  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) {
        window.clearTimeout(copyTimer.current);
      }
    };
  }, []);

  const needsSequence = /^\s*git\s+rebase\b/.test(command) && /\s(-i|--interactive)\b/.test(command);

  const connect = useCallback(async () => {
    setActivity("connect");
    setError(null);
    try {
      const result = await api.connect(repoPath);
      setRepo(result);
      setRepoPath(result.path);
      setOutcome(null);
      setStaleness(null);
    } catch (caught) {
      setError(describe(caught));
    } finally {
      setActivity(null);
    }
  }, [repoPath]);

  const refreshState = useCallback(async () => {
    if (!repo) {
      return;
    }
    setActivity("refresh");
    try {
      const result = await api.connect(repo.path);
      setRepo(result);
    } finally {
      setActivity(null);
    }
  }, [repo]);

  const disconnectRepo = useCallback(() => {
    setRepo(null);
    setOutcome(null);
    setStaleness(null);
    navigate(ROUTE_PATHS.workbench);
  }, []);

  const runPreview = useCallback(async () => {
    if (!repo) {
      setError("Connect a repository before rehearsing a command against it.");
      return;
    }
    setActivity("rehearse");
    setError(null);
    setStaleness(null);
    try {
      const result = await api.preview(
        repo.path,
        command,
        needsSequence && sequence.trim().length > 0 ? sequence : null
      );
      setOutcome(result);
      if (
        result.kind === "tool-error" &&
        (result.cause === "sandbox-unavailable" || result.cause === "network-reachable")
      ) {
        void refreshHealth(true);
      }
      if (result.originSnapshot) {
        setStaleness(await api.staleness(repo.path, result.originSnapshot.state));
      }
    } catch (caught) {
      setError(describe(caught));
    } finally {
      setActivity(null);
    }
  }, [repo, command, needsSequence, sequence, refreshHealth]);

  const copyCommand = useCallback(async () => {
    if (!outcome) {
      return;
    }
    try {
      await navigator.clipboard.writeText(outcome.display);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
      return;
    }
    if (copyTimer.current !== null) {
      window.clearTimeout(copyTimer.current);
    }
    copyTimer.current = window.setTimeout(() => setCopyStatus("idle"), 2400);
    if (repo && outcome.originSnapshot) {
      setStaleness(await api.staleness(repo.path, outcome.originSnapshot.state));
    }
  }, [outcome, repo]);

  const sandboxReady = health?.sandbox.ok ?? false;

  const status =
    activity === "connect"
      ? { tone: "busy", text: "Connecting to the repository…" }
      : activity === "refresh"
        ? { tone: "busy", text: "Re-reading the repository state…" }
        : activity === "rehearse"
          ? { tone: "busy", text: "Rehearsing. Building the clone and running the command." }
          : !healthChecked
            ? { tone: "busy", text: "Checking sandbox readiness…" }
            : health === null
              ? { tone: "blocked", text: "Foresight cannot reach its own API." }
              : !sandboxReady
                ? { tone: "blocked", text: `Rehearsals unavailable: ${health.sandbox.reason}` }
                : { tone: "ready", text: "Ready" };

  const changedRefs = outcome?.changeSet?.refs ?? [];

  return (
    <div className={route === "workbench" ? "page workbench" : "page"}>
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
                    caveats ({caveatCount(repo)})
                  </span>
                ) : null}
              </span>
            </PageLink>
          ) : null}
          <nav className="nav" aria-label="Pages">
            <PageLink
              to={ROUTE_PATHS.workbench}
              current={route === "workbench"}
            >
              Rehearsal
            </PageLink>
            {repo ? (
              <PageLink
                to={ROUTE_PATHS.repository}
                current={route === "repository"}
              >
                Repository
              </PageLink>
            ) : null}
            <PageLink
              to={ROUTE_PATHS.guarantees}
              current={route === "guarantees"}
            >
              Guarantees
            </PageLink>
          </nav>
        </div>
        <div className="status-block">
          <p className={`status ${status.tone}`} role="status">
            {status.text}
          </p>
        </div>
      </header>

      {route === "repository" ? (
        <RepositoryPage
          repo={repo}
          busy={busy}
          onReload={() => void refreshState()}
          onDisconnect={disconnectRepo}
        />
      ) : route === "guarantees" ? (
        <GuaranteesPage />
      ) : (
        <>
          <div className="workbench-controls">
            {!repo ? (
              <section className="section">
                <div className="connect-row">
                  <div className="field repo-path-field">
                    <div className="control">
                      <input
                        id="repo-path"
                        value={repoPath}
                        placeholder="/home/you/code/project"
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(event) => setRepoPath(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            void connect();
                          }
                        }}
                      />
                      <label htmlFor="repo-path">Repository path</label>
                      <button
                        type="button"
                        className="info"
                        aria-label="Point Foresight at a local Git working copy. It reads the repository to show its state and never writes to it."
                      >
                        <span aria-hidden="true">i</span>
                        <span className="info-tip" role="tooltip">
                          Point Foresight at a local Git working copy. It reads
                          the repository to show its state and never writes to
                          it.
                        </span>
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => void connect()}
                    disabled={busy || repoPath.trim().length === 0}
                  >
                    Connect
                  </button>
                </div>
                {error ? <p className="error">{error}</p> : null}
              </section>
            ) : null}

            <section className="section">
              <div className="editor">
                <span className="prompt" aria-hidden="true">
                  $
                </span>
                <div className="control">
                  <input
                    id="command"
                    value={command}
                    placeholder="git reset --soft HEAD~1"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => setCommand(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        void runPreview();
                      }
                    }}
                  />
                  <label htmlFor="command">Command</label>
                  <button
                    type="button"
                    className="info"
                    aria-label="Runs in a throwaway clone. Your repository is not modified by the rehearsal."
                  >
                    <span aria-hidden="true">i</span>
                    <span className="info-tip" role="tooltip">
                      Runs in a throwaway clone. Your repository is not modified
                      by the rehearsal.
                    </span>
                  </button>
                </div>
              </div>

              {needsSequence ? (
                <div className="field">
                  <div className="control">
                    <textarea
                      id="sequence"
                      rows={4}
                      value={sequence}
                      aria-describedby="sequence-hint"
                      placeholder={"pick abc123 subject\nsquash def456 subject"}
                      onChange={(event) => setSequence(event.target.value)}
                    />
                    <label htmlFor="sequence">Interactive rebase todo</label>
                  </div>
                  <p className="muted" id="sequence-hint">
                    Leave empty to keep git&apos;s own todo list, which picks
                    every commit.
                  </p>
                </div>
              ) : null}

              <div className="actions">
                <span className="rehearse">
                  <button
                    className="primary"
                    onClick={() => void runPreview()}
                    disabled={busy || !repo}
                    aria-describedby={repo ? undefined : "rehearse-reason"}
                  >
                    Rehearse
                  </button>
                  {!repo ? (
                    <span className="rehearse-tip" id="rehearse-reason" role="tooltip">
                      Connect a repository first. A rehearsal runs against one
                      specific working copy.
                    </span>
                  ) : null}
                </span>
              </div>
              {error && repo ? <p className="error">{error}</p> : null}
            </section>
          </div>

          <div className={outcome ? "workspace has-outcome" : "workspace"}>
            <section className="pane graph-pane" aria-label="Commit graph">
              <div className="pane-head">
                <h2 className="label">Commit graph</h2>
                {repo ? (
                  <button
                    className="icon-button"
                    onClick={() => void refreshState()}
                    disabled={busy}
                    aria-label="Refresh state"
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
                      <path d="m15 14 5-5-5-5" />
                      <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5 5.5 5.5 0 0 0 9.5 20H13" />
                    </svg>
                  </button>
                ) : null}
              </div>
              {repo && repo.graph.commits.length > 0 ? (
                <>
                  <CommitGraph
                    before={outcome?.graphBefore ?? repo.graph}
                    after={outcome?.graphAfter ?? null}
                    changedRefs={changedRefs}
                  />
                  {changedRefs.length > 0 ? (
                    <p className="cs-note">
                      Refs the rehearsal would move are marked on the graph. Commits the command
                      would create are drawn from the rehearsal clone.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="empty">
                  Connect a repository to see its commit graph.
                </p>
              )}
            </section>

            <section className="pane info-pane" aria-label="Outcome">
              <h2 className="label">Outcome</h2>
              <div className="pane-body">
                {outcome ? (
                  <OutcomePanel
                    outcome={outcome}
                    stale={
                      staleness?.stale ? (
                        <p className="stale">
                          {staleness.changed.join(", ")} changed after the mirror was taken. Rehearse
                          again for an accurate result.
                        </p>
                      ) : null
                    }
                    actions={
                      <>
                        <button onClick={() => void copyCommand()}>Copy command</button>
                        <span
                          className={`copy-status ${copyStatus}`}
                          role="status"
                        >
                          {copyStatus === "copied"
                            ? "Copied to clipboard"
                            : copyStatus === "failed"
                              ? "Could not copy"
                              : ""}
                        </span>
                      </>
                    }
                  />
                ) : (
                  <p className="empty">
                    Enter a Git command above and rehearse it to see exactly what
                    it would change. Foresight clones the repository, mirrors your
                    staged and unstaged state, runs the command in the clone, and
                    reports the difference.
                  </p>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
