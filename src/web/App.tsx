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

export default function App() {
  const [repoPath, setRepoPath] = useState("");
  const [repo, setRepo] = useState<RepoConnectResult | null>(null);
  const [command, setCommand] = useState("");
  const [sequence, setSequence] = useState("");
  const [outcome, setOutcome] = useState<RehearsalOutcome | null>(null);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [staleness, setStaleness] = useState<StalenessResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError("Connect a repository before rehearsing a command against it.");
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

  const status = busy
    ? { tone: "busy", text: "Rehearsing. Building the clone and running the command." }
    : !health
      ? { tone: "blocked", text: "Foresight cannot reach its own API." }
      : !sandboxReady
        ? { tone: "blocked", text: `Rehearsals unavailable: ${health.sandbox.reason}` }
        : { tone: "ready", text: `Network denied to the command (${health.sandbox.method}).` };

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
        <h1 className="brand">Foresight</h1>
        <p className={`status ${status.tone}`} role="status">
          {status.text}
        </p>
      </header>

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

      <section className="section">
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
            clones the repository, mirrors your staged and unstaged state, runs the command in the clone,
            and reports the difference.
          </p>
        )}
      </section>

      {repo && repo.graph.commits.length > 0 ? (
        <section className="section">
          <h2 className="label">Commit graph</h2>
          <CommitGraph commits={repo.graph.commits} head={repo.state.head} changedRefs={changedRefs} />
          {changedRefs.length > 0 ? (
            <p className="cs-note">
              Refs the rehearsal would move are marked on the graph. Commits the command would create do
              not exist in this repository yet, so they are not drawn.
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="disclosure">
        <h2 className="label">What Foresight does, and what it guarantees</h2>
        <p>
          Foresight rehearses the command in a throwaway clone. Your actual repository is not modified by
          the rehearsal.
        </p>
        <p className="guarantee">
          It guarantees one thing: Git&apos;s own object-store-rewriting commands, executed in the clone,
          cannot alter your repository&apos;s object bytes. It is not a general security sandbox, and it
          does not contain shell execution, filesystem writes or network access as a general capability.
        </p>

        {outcome && outcome.caveats.length > 0 ? (
          <div className="detail">
            <h3 className="label">Caveats that apply to this result</h3>
            {outcome.caveats.map((caveat) => (
              <p className="caveat-item" key={caveat.id}>
                <span className="name">{caveat.label}</span> {caveat.detail}
              </p>
            ))}
          </div>
        ) : null}

        <details>
          <summary>All known caveats</summary>
          {Object.entries(CAVEAT_CATALOG).map(([id, entry]) => (
            <p className="caveat-item" key={id}>
              <span className="name">{entry.label}</span> {entry.detail}
            </p>
          ))}
        </details>

        {history.length > 0 ? (
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
        ) : null}
      </section>
    </div>
  );
}
