import { CAVEAT_CATALOG } from "../../../shared/caveats";

export default function GuaranteesPage() {
  return (
    <section className="section prose">
      <h1 className="page-title">What Foresight does, and what it guarantees</h1>
      <p>
        Foresight rehearses the command in a throwaway clone. Your actual repository is not modified by the
        rehearsal.
      </p>
      <p className="guarantee">
        It guarantees one thing: Git&apos;s own object-store-rewriting commands, executed in the clone, cannot
        alter your repository&apos;s object bytes. It is not a general security sandbox, and it does not contain
        shell execution, filesystem writes or network access as a general capability.
      </p>
      <h2 className="label">All known caveats</h2>
      {Object.entries(CAVEAT_CATALOG).map(([id, entry]) => (
        <p className="caveat-item" key={id}>
          <span className="name">{entry.label}</span> {entry.detail}
        </p>
      ))}
    </section>
  );
}
