import type { RepoConnectResult } from "../../../shared/types";
import CommitGraph from "../components/CommitGraph";
import InfoTip from "../components/InfoTip";
import ConnectForm from "../components/connect/ConnectForm";
import OutcomePanel from "../components/outcome/OutcomePanel";
import type { RehearsalSession } from "./useRehearsalSession";

const COMMAND_TIP = "Runs in a throwaway clone. Your repository is not modified by the rehearsal.";

export default function RehearsalPage({
  repo,
  busy,
  session,
  onRefresh
}: {
  repo: RepoConnectResult | null;
  busy: boolean;
  session: RehearsalSession;
  onRefresh: () => Promise<void>;
}) {
  const changedRefs = session.outcome?.changeSet?.refs ?? [];

  return (
    <>
      <div className="rehearsal-controls">
        {!repo ? (
          <ConnectForm
            path={session.repoPath}
            onPathChange={session.setRepoPath}
            browsing={session.browsing}
            onToggleBrowsing={session.toggleBrowsing}
            onConnect={session.connect}
            error={session.error}
            busy={busy}
          />
        ) : null}

        <section className="section">
          <div className="editor">
            <span className="prompt" aria-hidden="true">
              $
            </span>
            <div className="control">
              <input
                id="command"
                value={session.command}
                placeholder="git reset --soft HEAD~1"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => session.setCommand(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void session.runPreview();
                  }
                }}
              />
              <label htmlFor="command">Command</label>
              <InfoTip label={COMMAND_TIP}>{COMMAND_TIP}</InfoTip>
            </div>
          </div>

          {session.needsSequence ? (
            <div className="field">
              <div className="control">
                <textarea
                  id="sequence"
                  rows={4}
                  value={session.sequence}
                  aria-describedby="sequence-hint"
                  placeholder={"pick abc123 subject\nsquash def456 subject"}
                  onChange={(event) => session.setSequence(event.target.value)}
                />
                <label htmlFor="sequence">Interactive rebase todo</label>
              </div>
              <p className="muted" id="sequence-hint">
                Leave empty to keep git&apos;s own todo list, which picks every commit.
              </p>
            </div>
          ) : null}

          <div className="actions">
            <span className="rehearse">
              <button
                className="primary"
                onClick={() => void session.runPreview()}
                disabled={busy || !repo}
                aria-describedby={repo ? undefined : "rehearse-reason"}
              >
                Rehearse
              </button>
              {!repo ? (
                <span className="rehearse-tip" id="rehearse-reason" role="tooltip">
                  Connect a repository first. A rehearsal runs against one specific working copy.
                </span>
              ) : null}
            </span>
          </div>
          {session.error && repo ? <p className="error">{session.error}</p> : null}
        </section>
      </div>

      <div className="workspace">
        <section className="pane graph-pane" aria-label="Commit graph">
          <div className="pane-head">
            <h2 className="label">Commit graph</h2>
            {repo ? (
              <button
                className="icon-button"
                onClick={() => void onRefresh()}
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
                  Re-read the repository and redraw the graph. Use it after the working copy changes
                  outside Foresight.
                </span>
              </button>
            ) : null}
          </div>
          {repo && repo.graph.commits.length > 0 ? (
            <CommitGraph
              before={session.outcome?.graphBefore ?? repo.graph}
              after={session.outcome?.graphAfter ?? null}
              changedRefs={changedRefs}
            />
          ) : (
            <p className="empty">Connect a repository to see its commit graph.</p>
          )}
        </section>

        <section className="pane info-pane" aria-label="Outcome">
          {session.outcome ? (
            <OutcomePanel
              outcome={session.outcome}
              stale={
                session.staleness?.stale ? (
                  <p className="stale">
                    {session.staleness.changed.join(", ")} changed after the mirror was taken.
                    Rehearse again for an accurate result.
                  </p>
                ) : null
              }
              actions={
                <>
                  <button onClick={() => void session.copyCommand()}>Copy command</button>
                  <span className={`copy-status ${session.copyStatus}`} role="status">
                    {session.copyStatus === "copied"
                      ? "Copied to clipboard"
                      : session.copyStatus === "failed"
                        ? "Could not copy"
                        : ""}
                  </span>
                </>
              }
            />
          ) : (
            <p className="empty">
              Enter a Git command above and rehearse it to see exactly what it would change.
              Foresight clones the repository, mirrors your staged and unstaged state, runs the
              command in the clone, and reports the difference.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
