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

  return (
    <div className="app">
      <div className="topbar">
        <span className="brand">Foresight</span>
        <input
          value={repoPath}
          placeholder="/path/to/repository"
          onChange={(event) => setRepoPath(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void connect();
            }
          }}
        />
        <button onClick={() => void connect()} disabled={busy || repoPath.trim().length === 0}>
          Connect
        </button>
        {health ? (
          <span
            className={sandboxReady ? "health ok" : "health bad"}
            title={health.sandbox.ok ? health.sandbox.reason : `${health.sandbox.reason} — ${health.sandbox.nextStep}`}
          >
            {sandboxReady ? `sandbox: ${health.sandbox.method}` : "sandbox: unavailable"}
          </span>
        ) : null}
      </div>

      <div className="layout">
        <div>
          {repo ? <RepoState repo={repo} /> : <div className="panel muted">Connect to a repository to begin.</div>}
          {repo && repo.graph.commits.length > 0 ? (
            <div className="panel">
              <h2>Commits</h2>
              <CommitGraph commits={repo.graph.commits} />
            </div>
          ) : null}
        </div>

        <div>
          <div className="panel">
            <h2>Rehearse a command</h2>
            <input
              value={command}
              placeholder="git commit -m 'message'"
              onChange={(event) => setCommand(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void runPreview();
                }
              }}
            />
            {needsSequence ? (
              <div className="sequence">
                <p className="muted">
                  Interactive rebase todo (leave empty to keep git&apos;s default, all picks):
                </p>
                <textarea
                  rows={5}
                  value={sequence}
                  placeholder={"pick abc123 subject\nsquash def456 subject"}
                  onChange={(event) => setSequence(event.target.value)}
                />
              </div>
            ) : null}
            <div className="copy-row">
              <button onClick={() => void runPreview()} disabled={busy || !repo || !sandboxReady}>
                Preview
              </button>
              <button onClick={() => void refreshState()} disabled={busy || !repo}>
                Refresh state
              </button>
            </div>
            {error ? <div className="error">{error}</div> : null}
          </div>

          {outcome ? (
            <OutcomePanel
              outcome={outcome}
              footer={
                <>
                  {staleness?.stale ? (
                    <div className="stale">
                      This preview is stale: {staleness.changed.join(", ")} changed since the mirror was taken.
                    </div>
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
          ) : null}

          {outcome && outcome.caveats.length > 0 ? (
            <div className="panel caveat-list">
              <h2>Caveats that apply</h2>
              {outcome.caveats.map((caveat) => (
                <div className="row" key={caveat.id}>
                  <span>{caveat.label}</span>
                </div>
              ))}
            </div>
          ) : null}

          {repo ? (
            <div className="panel caveat-list">
              <details open={showAllCaveats} onToggle={(event) => setShowAllCaveats(event.currentTarget.open)}>
                <summary>All known caveats</summary>
                {Object.entries(CAVEAT_CATALOG).map(([id, entry]) => (
                  <div key={id} style={{ marginTop: 8 }}>
                    <div>{entry.label}</div>
                    <div className="muted">{entry.detail}</div>
                  </div>
                ))}
              </details>
            </div>
          ) : null}

          {history.length > 0 ? (
            <div className="panel">
              <h2>Session history</h2>
              {history
                .slice()
                .reverse()
                .map((entry) => (
                  <div className="row" key={entry.id}>
                    <span className="mono">{entry.display}</span>
                    <span className="muted">{entry.kind}</span>
                  </div>
                ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
