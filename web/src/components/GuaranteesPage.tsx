import { CAVEAT_CATALOG } from "../../../shared/caveats";
import { PageLink, ROUTE_PATHS } from "../route";

export default function GuaranteesPage() {
  return (
    <section className="section prose">
      <header className="page-head">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <ol>
            <li>
              <PageLink to={ROUTE_PATHS.workbench}>Foresight</PageLink>
            </li>
            <li>
              <span aria-current="page">Guarantees</span>
            </li>
          </ol>
        </nav>
        <h1 className="page-title">What Foresight does, and what it guarantees</h1>
      </header>
      <p>
        Foresight rehearses the command in a throwaway clone. Your actual repository is not modified by the
        rehearsal.
      </p>
      <p className="guarantee">
        It guarantees one thing: Git&apos;s own object-store-rewriting commands, executed in the clone, cannot
        alter your repository&apos;s object bytes. It is not a general security sandbox, and it does not contain
        shell execution, filesystem writes or network access as a general capability.
      </p>
      <h2 className="label">What a rehearsal needs from your system</h2>
      <p>
        The git process that runs your command has the network denied at the operating-system level, by{" "}
        <span className="mono">unshare</span> or <span className="mono">bwrap</span>, rather than by the
        command allowlist alone. Remote helpers, credential helpers, and LFS filters can reach the network
        through paths a parser cannot see, so denying it at the OS level is the only version of that promise
        that holds.
      </p>
      <p>
        Foresight verifies the denial with a real network call at startup rather than assuming it, and refuses
        to rehearse while claiming otherwise. If the mechanism is missing, rehearsals are unavailable and the
        status in the masthead says why. This is Linux-only for v1.
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
