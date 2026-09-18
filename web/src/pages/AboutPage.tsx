import PageLink from "../components/PageLink";
import { ROUTE_PATHS } from "../lib/route";

export default function AboutPage() {
  return (
    <div className="prose">
      <section className="section">
        <h1 className="page-title">What Foresight is for</h1>
        <p className="lead">
          Every git command is a small experiment. Most are fine. The one that is not is the one you
          will remember.
        </p>
        <p>
          Foresight runs the experiment somewhere else first. It clones your repository into a
          throwaway copy, mirrors your staged and unstaged state, runs your command there, and reports
          the difference.
        </p>
        <p>
          Your repository is not touched. When the preview shows what you hoped for, you copy the
          command out and run it yourself.
        </p>
        <p>
          Foresight is not a sandbox, and it does not make a dangerous command safe. It makes an
          uncertain one legible. That is a smaller promise, and the only one it can keep. The exact
          version, exclusions included, is on the{" "}
          <PageLink to={ROUTE_PATHS.guarantees}>Guarantees page</PageLink>.
        </p>
      </section>
    </div>
  );
}
