import { useCallback, useEffect, useState } from "react";
import type {
  HealthResult,
  HistoryEntry,
  RehearsalOutcome,
  RepoConnectResult,
  StalenessResult
} from "../../shared/types";
import { api } from "./api";
import brandUrl from "./assets/brand.svg";
import CommitGraph from "./components/CommitGraph";
import GuaranteesPage from "./components/GuaranteesPage";
import OutcomePanel from "./components/OutcomePanel";
import RepoState from "./components/RepoState";
import { PageLink, ROUTE_PATHS, useRoute } from "./route";

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
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [healthChecked, setHealthChecked] = useState(false);
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
      setHistory(await api.history());
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
      setHistory(await api.history());
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
    await navigator.clipboard.writeText(outcome.display);
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

  const summary: string[] = [];
  if (repo) {
    summary.push(
      repo.state.head.detached
        ? `detached at ${repo.state.head.commit?.slice(0, 7) ?? "unborn"}`
        : (repo.state.head.symbolic?.replace("refs/heads/", "") ?? "unborn")
    );
    summary.push(`${repo.state.stagedEntries.length} staged`);
    summary.push(`${repo.state.worktreeEntries.length} modified`);
    summary.push(`${repo.untracked.length} untracked`);
    if (repo.ignored.length > 0) {
      summary.push(`${repo.ignored.length} ignored`);
    }
    if (
      repo.state.stagedEntries.length === 0 &&
      repo.state.worktreeEntries.length === 0 &&
      repo.untracked.length === 0
    ) {
      summary.push("clean repository state");
    }
  }

  const changedRefs = outcome?.changeSet?.refs ?? [];

  return (
    <div className="page">
      <header className="masthead">
        <div className="masthead-left">
          <h1 className="brand">
            <img src={brandUrl} alt="Foresight" />
          </h1>
          <nav className="nav" aria-label="Pages">
            <PageLink to={ROUTE_PATHS.workbench} current={route === "workbench"}>
              Rehearsal
            </PageLink>
            <PageLink to={ROUTE_PATHS.guarantees} current={route === "guarantees"}>
              Guarantees
            </PageLink>
          </nav>
        </div>
        <div className="status-block">
          <p className={`status ${status.tone}`} role="status">
            {status.text}
          </p>
          <button
            className="quiet"
            onClick={() => void refreshHealth(true)}
            disabled={busy}
            aria-label="Re-check sandbox readiness"
          >
            Re-check
          </button>
        </div>
      </header>

      {route === "guarantees" ? (
        <GuaranteesPage />
      ) : (
        <>
      <section className="section">
        {repo ? (
          <>
            <p className="repo-path">{repo.path}</p>
            <p className="repo-summary">
              {summary.map((part, index) => (
                <span key={part}>
                  {index > 0 ? <span className="sep">&middot;</span> : null}
                  {part}
                </span>
              ))}
            </p>
            {repo.staticDisqualifiers.submodules ||
            repo.staticDisqualifiers.lfs ||
            repo.staticDisqualifiers.linkedWorktrees > 0 ||
            repo.dynamicDisqualifiers.operation ? (
              <p className="repo-summary blocked">Previews are blocked for this repository.</p>
            ) : null}
            <div className="actions">
              <button className="quiet" onClick={() => void refreshState()} disabled={busy}>
                Refresh state
              </button>
              <button className="quiet" onClick={() => setRepo(null)}>
                Change repository
              </button>
            </div>
            <RepoState repo={repo} />
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="repo-path">Repository path</label>
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
            </div>
            <div className="actions">
              <button onClick={() => void connect()} disabled={busy || repoPath.trim().length === 0}>
                Connect
              </button>
            </div>
            <p className="empty">
              Point Foresight at a local Git working copy. It reads the repository to show its state and
              never writes to it.
            </p>
          </>
        )}
        {error && !repo ? <p className="error">{error}</p> : null}
      </section>

      <section className="section">
        <label className="label" htmlFor="command">
          Command
        </label>
        <div className="editor">
          <span className="prompt" aria-hidden="true">
            $
          </span>
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
        </div>

        {needsSequence ? (
          <div className="field">
            <label htmlFor="sequence">Interactive rebase todo</label>
            <textarea
              id="sequence"
              rows={4}
              value={sequence}
              aria-describedby="sequence-hint"
              placeholder={"pick abc123 subject\nsquash def456 subject"}
              onChange={(event) => setSequence(event.target.value)}
            />
            <p className="muted" id="sequence-hint">
              Leave empty to keep git&apos;s own todo list, which picks every commit.
            </p>
          </div>
        ) : null}

        <div className="actions">
          <button className="primary" onClick={() => void runPreview()} disabled={busy}>
            Rehearse
          </button>
          <span className="muted">
            Runs in a throwaway clone. Your repository is not modified by the rehearsal.
          </span>
        </div>
        {error && repo ? <p className="error">{error}</p> : null}
      </section>

      <div className="workspace">
        <section className="pane" aria-label="Command info">
          <h2 className="label">Command info</h2>
          {outcome ? (
            <OutcomePanel
              outcome={outcome}
              footer={
                <>
                  {staleness?.stale ? (
                    <div className="detail">
                      <h4 className="label">Stale</h4>
                      <p className="muted">
                        {staleness.changed.join(", ")} changed after the mirror was taken. Rehearse again
                        for an accurate result.
                      </p>
                    </div>
                  ) : null}
                  <div className="actions">
                    <button onClick={() => void copyCommand()}>Copy command</button>
                    <span className="mono muted">{outcome.display}</span>
                  </div>
                  <p className="copy-note">
                    Foresight has finished rehearsing. Run the command yourself when you are ready.
                  </p>
                </>
              }
            />
          ) : (
            <p className="empty">
              Enter a Git command above and rehearse it to see exactly what it would change. Foresight
              clones the repository, mirrors your staged and unstaged state, runs the command in the
              clone, and reports the difference.
            </p>
          )}
        </section>

        <section className="pane" aria-label="Commit graph">
          <h2 className="label">Commit graph</h2>
          {repo && repo.graph.commits.length > 0 ? (
            <>
              <CommitGraph
                before={outcome?.graphBefore ?? repo.graph}
                after={outcome?.graphAfter ?? null}
                changedRefs={changedRefs}
              />
              {changedRefs.length > 0 ? (
                <p className="cs-note">
                  Refs the rehearsal would move are marked on the graph. Commits the command would create
                  are drawn from the rehearsal clone.
                </p>
              ) : null}
            </>
          ) : (
            <p className="empty">Connect a repository to see its commit graph.</p>
          )}
        </section>
      </div>

      {history.length > 0 ? (
        <section className="section">
          <details>
            <summary>Session history ({history.length})</summary>
            {history
              .slice()
              .reverse()
              .map((entry) => (
                <p className="caveat-item mono" key={entry.id}>
                  {entry.display} <span className="faint">{entry.kind}</span>
                </p>
              ))}
          </details>
        </section>
      ) : null}
        </>
      )}
    </div>
  );
}
