import type { RepoConnectResult } from "../../shared/types";

function Entry({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="row">
      <span className="muted">{label}</span>
      <span className="mono">{value}</span>
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
        <div className="panel">
          <h2>Previews are blocked</h2>
          {staticDisqualifiers.submodules ? <p className="caveat">Submodules are present.</p> : null}
          {staticDisqualifiers.lfs ? <p className="caveat">Git LFS filters are present.</p> : null}
          {staticDisqualifiers.linkedWorktrees > 0 ? (
            <p className="caveat">{staticDisqualifiers.linkedWorktrees} linked worktree(s) present.</p>
          ) : null}
          {dynamicDisqualifiers.operation ? (
            <p className="caveat">
              The repository is mid-{dynamicDisqualifiers.operation}; finish or abort it first.
            </p>
          ) : null}
          <p className="muted">Reading state is still safe; only rehearsals are refused.</p>
        </div>
      ) : null}

      <div className="panel">
        <h2>Repository</h2>
        <Entry label="Name" value={repo.name} />
        <Entry label="Path" value={repo.path} />
        <Entry
          label="HEAD"
          value={
            state.head.detached
              ? `detached at ${state.head.commit?.slice(0, 7) ?? "unborn"}`
              : `${state.head.symbolic ?? "unborn"} @ ${state.head.commit?.slice(0, 7) ?? "none"}`
          }
        />
        <Entry label="Branches" value={branches.length} />
        <Entry label="Tags" value={tags.length} />
        <Entry label="Staged paths" value={state.stagedEntries.length} />
        <Entry label="Worktree paths" value={state.worktreeEntries.length} />
        <Entry label="Untracked files" value={repo.untracked.length} />
        <Entry label="Ignored files" value={repo.ignored.length} />
      </div>

      <div className="panel">
        <h2>Refs</h2>
        {state.refs.length === 0 ? (
          <p className="muted">No refs yet.</p>
        ) : (
          state.refs.map((ref) => <Entry key={ref.name} label={ref.name} value={ref.target.slice(0, 7)} />)
        )}
      </div>

      {state.stagedEntries.length > 0 ? (
        <div className="panel">
          <h2>Staged</h2>
          {state.stagedEntries.map((entry) => (
            <div className="row" key={entry}>
              <span className="mono">{entry.split("\t")[1]}</span>
              <span className="mono">{entry.split("\t")[0]}</span>
            </div>
          ))}
        </div>
      ) : null}

      {state.worktreeEntries.length > 0 ? (
        <div className="panel">
          <h2>Working directory</h2>
          {state.worktreeEntries.map((entry) => (
            <div className="row" key={entry}>
              <span className="mono">{entry.split("\t")[1]}</span>
              <span className="mono">{entry.split("\t")[0]}</span>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
