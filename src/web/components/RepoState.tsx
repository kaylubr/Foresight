import type { RepoConnectResult } from "../../shared/types";

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
  const branches = state.refs.filter((ref) => ref.name.startsWith("refs/heads/"));
  const tags = state.refs.filter((ref) => ref.name.startsWith("refs/tags/"));

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

      <div className="state-table">
        <Row
          label="HEAD"
          value={
            state.head.detached
              ? `detached at ${state.head.commit?.slice(0, 7) ?? "unborn"}`
              : `${state.head.symbolic?.replace("refs/heads/", "") ?? "unborn"} @ ${state.head.commit?.slice(0, 7) ?? "none"}`
          }
        />
        <Row label="Branches" value={branches.length} />
        <Row label="Tags" value={tags.length} />
        <Row label="Staged paths" value={state.stagedEntries.length} />
        <Row label="Working directory paths" value={state.worktreeEntries.length} />
        <Row label="Untracked files" value={repo.untracked.length} />
        <Row label="Ignored files" value={repo.ignored.length} />
      </div>

      {state.refs.length > 0 ? (
        <div className="state-table">
          {state.refs.map((ref) => (
            <Row key={ref.name} label={ref.name} value={ref.target.slice(0, 7)} />
          ))}
        </div>
      ) : null}

      {state.stagedEntries.length > 0 ? (
        <div className="state-table">
          {state.stagedEntries.map((entry) => (
            <Row key={entry} label={entry.split("\t")[1] ?? entry} value={entry.split("\t")[0] ?? ""} />
          ))}
        </div>
      ) : null}

      {state.worktreeEntries.length > 0 ? (
        <div className="state-table">
          {state.worktreeEntries.map((entry) => (
            <Row key={entry} label={entry.split("\t")[1] ?? entry} value={entry.split("\t")[0] ?? ""} />
          ))}
        </div>
      ) : null}
    </>
  );
}
