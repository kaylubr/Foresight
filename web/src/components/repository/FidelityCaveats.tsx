import type { RepoConnectResult } from "../../../../shared/types";
import { fidelityCaveats } from "../../lib/fidelityCaveats";
import InfoTip from "../InfoTip";

const EXPLAINER = "A rehearsal still runs, but these can make it differ from a real run.";

export default function FidelityCaveats({ repo }: { repo: RepoConnectResult }) {
  const caveats = fidelityCaveats(repo);

  if (caveats.length === 0) {
    return null;
  }

  return (
    <section className="repo-frame repo-fidelity" aria-label="Fidelity caveats">
      <div className="repo-frame-head">
        <h2 className="repo-frame-title">
          {caveats.length === 1 ? "Fidelity caveat" : "Fidelity caveats"}
        </h2>
        <InfoTip label={EXPLAINER} align="start">
          {EXPLAINER}
        </InfoTip>
      </div>
      <dl className="repo-caveats">
        {caveats.map((caveat) => (
          <div className="repo-caveat" key={caveat.id}>
            <dt>{caveat.label}</dt>
            <dd>{caveat.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
