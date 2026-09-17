import type { RepoConnectResult } from "../../../shared/types";

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="state-row">
      <span className="key">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}

function caveatLines(repo: RepoConnectResult): string[] {
  const lines: string[] = [];
  if (repo.staticDisqualifiers.submodules) {
    lines.push("This repository has submodules, and their contents are not copied into the rehearsal.");
  }
  if (repo.staticDisqualifiers.lfs) {
    lines.push("Git LFS filters are present, so LFS files rehearse as pointers rather than real content.");
  }
  if (repo.staticDisqualifiers.linkedWorktrees > 0) {
    lines.push(
      `${repo.staticDisqualifiers.linkedWorktrees} linked worktree(s) are present and are not copied into the rehearsal.`
    );
  }
  if (repo.dynamicDisqualifiers.operation) {
    lines.push(
      `The repository is mid-${repo.dynamicDisqualifiers.operation}, and git's internal state for that is not reproduced.`
    );
  }
  return lines;
}

export default function RepoState({ repo }: { repo: RepoConnectResult }) {
  const { state } = repo;
  const lines = caveatLines(repo);

  return (
    <>
      {lines.length > 0 ? (
        <div className="detail">
          <h3 className="label">Caveats</h3>
          <p className="muted">A rehearsal still runs, but these can make it differ from a real run.</p>
          {lines.map((line) => (
            <p className="caveat-item" key={line}>
              {line}
            </p>
          ))}
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
