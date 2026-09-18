import { CAVEAT_CATALOG } from "../../../shared/caveats";
import "./GuaranteesPage.css";

export default function GuaranteesPage() {
  return (
    <div className="prose">
      <section className="section">
        <h1 className="page-title">What Foresight guarantees</h1>
        <p className="lead">
          A rehearsal runs your command in a throwaway clone, so your repository is not
          modified by it. The guarantee is narrower than that sounds.
        </p>
        <p className="guarantee">
          Git&apos;s own object-store-rewriting commands, executed in the clone, cannot alter
          your repository&apos;s object bytes.
        </p>
        <p>
          It is not a general security sandbox. Shell execution, filesystem writes, and
          network access are not contained as a general capability.
        </p>
      </section>

      <section className="section">
        <h2 className="label">What a rehearsal needs from your system</h2>
        <p>
          The git process that runs your command has the network denied at the operating-system
          level, by <span className="mono">unshare</span> or <span className="mono">bwrap</span>,
          rather than by the command allowlist alone. Remote helpers, credential helpers, and
          LFS filters can reach the network through paths a parser cannot see, so denying it at
          the OS level is the only version of that promise that holds.
        </p>
        <p>
          Foresight verifies the denial with a real network call at startup rather than assuming
          it, and refuses to rehearse while claiming otherwise. If the mechanism is missing,
          rehearsals are unavailable and the status in the masthead says why. This is Linux-only
          for v1.
        </p>
      </section>

      <section className="section">
        <h2 className="label">Where a rehearsal diverges from reality</h2>
        <dl className="caveats">
          {Object.entries(CAVEAT_CATALOG).map(([id, entry]) => (
            <div className="caveat-row" key={id}>
              <dt>{entry.label}</dt>
              <dd>{entry.detail}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
