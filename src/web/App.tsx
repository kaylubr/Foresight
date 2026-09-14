import { useCallback, useEffect, useState } from "react";
import { CAVEAT_CATALOG } from "../shared/caveats";
import type {
  HealthResult,
  HistoryEntry,
  RehearsalOutcome,
  RepoConnectResult,
  StalenessResult
} from "../shared/types";
import { api } from "./api";
import CommitGraph from "./components/CommitGraph";
import OutcomePanel from "./components/OutcomePanel";
import RepoState from "./components/RepoState";

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "unexpected failure";
}

interface Status {
  tone: "ready" | "blocked" | "busy";
  mark: string;
  text: string;
}

export default function App() {
  const [repoPath, setRepoPath] = useState("");
  const [repo, setRepo] = useState<RepoConnectResult | null>(null);
  const [command, setCommand] = useState("git status");
  const [sequence, setSequence] = useState("");
  const [outcome, setOutcome] = useState<RehearsalOutcome | null>(null);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [staleness, setStaleness] = useState<StalenessResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllCaveats, setShowAllCaveats] = useState(false);

  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  const needsSequence = /^\s*git\s+rebase\b/.test(command) && /\s(-i|--interactive)\b/.test(command);

  const connect = useCallback(async () => {
    setBusy(true);
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
      setBusy(false);
    }
  }, [repoPath]);

  const refreshState = useCallback(async () => {
    if (!repo) {
      return;
    }
    const result = await api.connect(repo.path);
    setRepo(result);
  }, [repo]);

  const runPreview = useCallback(async () => {
    if (!repo) {
      setError("Connect to a repository first, then rehearse against it.");
      return;
    }
    setBusy(true);
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
      if (result.originSnapshot) {
        setStaleness(await api.staleness(repo.path, result.originSnapshot.state));
      }
    } catch (caught) {
      setError(describe(caught));
    } finally {
      setBusy(false);
    }
  }, [repo, command, needsSequence, sequence]);

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

  const status: Status = busy
    ? { tone: "busy", mark: "\u25d0", text: "Rehearsing. The clone is being built and the command is running." }
    : !repo
      ? { tone: "blocked", mark: "\u25b2", text: "Connect to a repository to rehearse against it." }
      : !health
        ? { tone: "blocked", mark: "\u25b2", text: "Foresight cannot reach its own API, so rehearsals will fail." }
        : !sandboxReady
          ? {
              tone: "blocked",
              mark: "\u25b2",
              text: `Rehearsals are unavailable: ${health.sandbox.reason}. Next step: ${health.sandbox.nextStep}`
            }
          : { tone: "ready", mark: "\u25cf", text: `Sandbox ready (${health.sandbox.method}). Network is denied to the command.` };

  return (
    <div className="app">
      <header className="setupbar">
        <h1 className="brand">Foresight</h1>
        <div className="field">
          <label htmlFor="repo-path">Repository path</label>
          <input
            id="repo-path"
            value={repoPath}
            placeholder="/home/you/code/project"
            onChange={(event) => setRepoPath(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void connect();
              }
            }}
          />
        </div>
        <button onClick={() => void connect()} disabled={busy || repoPath.trim().length === 0}>
          Connect
        </button>
      </header>

      <section className="commandbar" aria-label="Rehearsal">
        <div className="command-row">
          <div className="field">
            <label htmlFor="command">Command to rehearse</label>
            <input
              id="command"
              value={command}
              placeholder="git commit -m 'message'"
              onChange={(event) => setCommand(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void runPreview();
                }
              }}
            />
          </div>
          <button className="primary" onClick={() => void runPreview()} disabled={busy}>
            Rehearse
          </button>
        </div>

        {needsSequence ? (
          <div className="field">
            <label htmlFor="sequence">Interactive rebase todo</label>
            <textarea
              id="sequence"
              rows={5}
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

        <p className={`precondition ${status.tone}`} role="status">
          <span className="mark" aria-hidden="true">
            {status.mark}
          </span>
          {status.text}
        </p>

        {error ? <p className="error">{error}</p> : null}
      </section>

      <div className="workspace">
        <section className="stage" aria-label="Outcome">
          <h2 className="section-label">Outcome</h2>
          <div className="stage-surface">
            {outcome ? (
              <OutcomePanel
                outcome={outcome}
                footer={
                  <>
                    {staleness?.stale ? (
                      <p className="stale">
                        This preview is stale: {staleness.changed.join(", ")} changed after the mirror was taken.
                      </p>
                    ) : null}
                    {outcome.kind !== "refusal" && outcome.kind !== "tool-error" ? (
                      <div className="copy-row">
                        <button onClick={() => void copyCommand()}>Copy command</button>
                        <span className="muted mono">{outcome.display}</span>
                      </div>
                    ) : null}
                  </>
                }
              />
            ) : (
              <p className="empty">
                Rehearse a command to see what it would change. Foresight clones the repository, runs the command
                there, and reports the difference. Nothing here touches your working copy.
              </p>
            )}
          </div>
        </section>

        <aside className="inspector" aria-label="Repository">
          <div className="inspector-head">
            <h2 className="section-label">Repository</h2>
            {repo ? (
              <button className="quiet" onClick={() => void refreshState()} disabled={busy}>
                Refresh
              </button>
            ) : null}
          </div>
          {repo ? (
            <RepoState repo={repo} />
          ) : (
            <p className="empty">No repository connected yet.</p>
          )}
          {repo && repo.graph.commits.length > 0 ? (
            <div className="group">
              <h3 className="section-label">Commits</h3>
              <CommitGraph commits={repo.graph.commits} />
            </div>
          ) : null}
        </aside>
      </div>

      <footer className="footnotes">
        <div className="footnote-block">
          <h2 className="section-label">Caveats</h2>
          {outcome && outcome.caveats.length > 0 ? (
            outcome.caveats.map((caveat) => (
              <p className="caveat" key={caveat.id}>
                {caveat.label} <span className="muted">{caveat.detail}</span>
              </p>
            ))
          ) : (
            <p className="muted">No caveats apply to the current outcome.</p>
          )}
          {repo ? (
            <details open={showAllCaveats} onToggle={(event) => setShowAllCaveats(event.currentTarget.open)}>
              <summary>All known caveats</summary>
              {Object.entries(CAVEAT_CATALOG).map(([id, entry]) => (
                <p className="caveat" key={id}>
                  {entry.label} <span className="muted">{entry.detail}</span>
                </p>
              ))}
            </details>
          ) : null}
        </div>

        <div className="footnote-block">
          <h2 className="section-label">Session history</h2>
          {history.length > 0 ? (
            history
              .slice()
              .reverse()
              .map((entry) => (
                <div className="entry" key={entry.id}>
                  <span className="mono key">{entry.display}</span>
                  <span className="value muted">{entry.kind}</span>
                </div>
              ))
          ) : (
            <p className="muted">
              Commands you rehearse appear here for as long as the session lasts. Nothing is written to disk.
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
