import type { RepoConnectResult } from "../../../shared/types";

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="state-row">
      <span className="key">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}

export default function RepoState({ repo }: { repo: RepoConnectResult }) {
  const { state, staticDisqualifiers, dynamicDisqualifiers } = repo;

  const blocked =
    staticDisqualifiers.submodules ||
    staticDisqualifiers.lfs ||
    staticDisqualifiers.linkedWorktrees > 0 ||
    dynamicDisqualifiers.operation !== null;

  return (
    <>
      {blocked ? (
        <div className="detail">
          <h3 className="label">Previews are blocked</h3>
          {staticDisqualifiers.submodules ? <p className="caveat-item">Submodules are present.</p> : null}
          {staticDisqualifiers.lfs ? <p className="caveat-item">Git LFS filters are present.</p> : null}
          {staticDisqualifiers.linkedWorktrees > 0 ? (
            <p className="caveat-item">
              {staticDisqualifiers.linkedWorktrees} linked worktree(s) present.
            </p>
          ) : null}
          {dynamicDisqualifiers.operation ? (
            <p className="caveat-item">
              The repository is mid-{dynamicDisqualifiers.operation}; finish or abort it first.
            </p>
          ) : null}
          <p className="muted">Reading state is still safe. Only rehearsals are refused.</p>
        </div>
      ) : null}

      {state.refs.length > 0 ? (
        <details>
          <summary>Refs ({state.refs.length})</summary>
          <div className="state-table">
            {state.refs.map((ref) => (
              <Row key={ref.name} label={ref.name} value={ref.target.slice(0, 7)} />
            ))}
          </div>
        </details>
      ) : null}

      {state.stagedEntries.length > 0 ? (
        <details>
          <summary>Staged ({state.stagedEntries.length})</summary>
          <div className="state-table">
            {state.stagedEntries.map((entry) => (
              <Row key={entry} label={entry.split("\t")[1] ?? entry} value={entry.split("\t")[0] ?? ""} />
            ))}
          </div>
        </details>
      ) : null}

      {state.worktreeEntries.length > 0 ? (
        <details>
          <summary>Working directory ({state.worktreeEntries.length})</summary>
          <div className="state-table">
            {state.worktreeEntries.map((entry) => (
              <Row key={entry} label={entry.split("\t")[1] ?? entry} value={entry.split("\t")[0] ?? ""} />
            ))}
          </div>
        </details>
      ) : null}
    </>
  );
}
