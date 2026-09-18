import { useCallback, useEffect, useRef, useState } from "react";
import type {
  HealthResult,
  RehearsalOutcome,
  RepoConnectResult,
  StalenessResult
} from "../../shared/types";
import AboutPage from "./components/AboutPage";
import CommitGraph from "./components/CommitGraph";
import GuaranteesPage from "./components/GuaranteesPage";
import PageLink from "./components/PageLink";
import Masthead from "./components/masthead/Masthead";
import RepoBrowser from "./components/connect/RepoBrowser";
import RepositoryPage from "./components/RepositoryPage";
import OutcomePanel from "./components/outcome/OutcomePanel";
import { api } from "./lib/api";
import { errorMessage } from "./lib/errors";
import { navigate, ROUTE_PATHS, useRoute } from "./lib/route";
import { sessionStatus } from "./lib/status";
import type { Activity } from "./lib/status";

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
  const [browsing, setBrowsing] = useState(false);
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

  const connect = useCallback(async (target: string) => {
    setActivity("connect");
    setError(null);
    try {
      const result = await api.connect(target);
      setRepo(result);
      setRepoPath(result.path);
      setOutcome(null);
      setStaleness(null);
      setBrowsing(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActivity(null);
    }
  }, []);

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
      setError(errorMessage(caught));
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

  const status = sessionStatus(activity, healthChecked, health);

  const changedRefs = outcome?.changeSet?.refs ?? [];

  return (
    <div className={route === "workbench" ? "page workbench" : "page"}>
      <Masthead repo={repo} route={route} status={status} />

      {route === "about" ? (
        <AboutPage />
      ) : route === "repository" ? (
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
                        placeholder={"C:\\Users\\you\\code\\project"}
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(event) => setRepoPath(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            void connect(repoPath);
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
                    type="button"
                    className="icon-button browse-open"
                    onClick={() => setBrowsing((open) => !open)}
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
                    onClick={() => void connect(repoPath)}
                    disabled={busy || repoPath.trim().length === 0}
                  >
                    Connect
                  </button>
                </div>
                {error ? <p className="error">{error}</p> : null}
                {browsing ? (
                  <RepoBrowser
                    onChoose={(path) => {
                      setRepoPath(path);
                      void connect(path);
                    }}
                  />
                ) : null}
                <p className="muted">
                  New here?{" "}
                  <PageLink to={ROUTE_PATHS.about}>What Foresight is for</PageLink>.
                </p>
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

          <div className="workspace">
            <section className="pane graph-pane" aria-label="Commit graph">
              <div className="pane-head">
                <h2 className="label">Commit graph</h2>
                {repo ? (
                  <button
                    className="icon-button"
                    onClick={() => void refreshState()}
                    disabled={busy}
                    aria-label="Refresh state"
                    aria-describedby="refresh-tip"
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
                    <span className="icon-tip" id="refresh-tip" role="tooltip">
                      Re-read the repository and redraw the graph. Use it after
                      the working copy changes outside Foresight.
                    </span>
                  </button>
                ) : null}
              </div>
              {repo && repo.graph.commits.length > 0 ? (
                <CommitGraph
                  before={outcome?.graphBefore ?? repo.graph}
                  after={outcome?.graphAfter ?? null}
                  changedRefs={changedRefs}
                />
              ) : (
                <p className="empty">
                  Connect a repository to see its commit graph.
                </p>
              )}
            </section>

            <section className="pane info-pane" aria-label="Outcome">
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
            </section>
          </div>
        </>
      )}
    </div>
  );
}
