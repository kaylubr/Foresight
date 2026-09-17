import { curveBumpY, line } from "d3";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { CommitNode, GraphData, RefChange } from "../../../shared/types";

const COLUMN_WIDTH = 38;
const LANE_HEIGHT = 26;
const RADIUS = 5;
const PADDING = 14;
const LABEL_PAD = 130;
const LANE_TONES = [0.82, 0.66, 0.54, 0.46, 0.4];

type NodeState = "present" | "added" | "removed";

interface Row {
  commit: CommitNode;
  lane: number;
  index: number;
  state: NodeState;
}

interface Hovered {
  sha: string;
  left: number;
  top: number;
}

function layout(commits: CommitNode[]): Array<Omit<Row, "state">> {
  const active: Array<string | null> = [];
  const rows: Array<Omit<Row, "state">> = [];

  commits.forEach((commit, index) => {
    let lane = active.indexOf(commit.sha);
    if (lane === -1) {
      const free = active.indexOf(null);
      if (free === -1) {
        active.push(commit.sha);
        lane = active.length - 1;
      } else {
        active[free] = commit.sha;
        lane = free;
      }
    }

    rows.push({ commit, lane, index });
    active[lane] = null;

    commit.parents.forEach((parent, parentIndex) => {
      if (active.includes(parent)) {
        return;
      }
      if (parentIndex === 0) {
        active[lane] = parent;
        return;
      }
      const free = active.indexOf(null);
      if (free === -1) {
        active.push(parent);
      } else {
        active[free] = parent;
      }
    });
  });

  return rows;
}

function fullRefName(decoration: string): string {
  const cleaned = decoration.replace(/^HEAD -> /, "").trim();
  if (cleaned.startsWith("tag: ")) {
    return `refs/tags/${cleaned.slice(5)}`;
  }
  if (cleaned.includes("/")) {
    return `refs/remotes/${cleaned}`;
  }
  return `refs/heads/${cleaned}`;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export default function CommitGraph({
  before,
  after,
  changedRefs
}: {
  before: GraphData;
  after: GraphData | null;
  changedRefs: RefChange[];
}) {
  const target = after ?? before;
  const hasChanges = after !== null && after !== before;
  const reduced = useReducedMotion();

  const beforeShas = useMemo(() => new Set(before.commits.map((c) => c.sha)), [before]);
  const afterShas = useMemo(() => new Set(target.commits.map((c) => c.sha)), [target]);
  const moved = useMemo(() => new Map(changedRefs.map((ref) => [ref.name, ref])), [changedRefs]);

  const rows = useMemo<Row[]>(() => {
    const union: CommitNode[] = [...target.commits];
    for (const commit of before.commits) {
      if (!afterShas.has(commit.sha)) {
        union.push(commit);
      }
    }
    return layout(union).map((row) => ({
      ...row,
      state: afterShas.has(row.commit.sha)
        ? beforeShas.has(row.commit.sha)
          ? "present"
          : "added"
        : "removed"
    }));
  }, [target, before, beforeShas, afterShas]);

  const [revealed, setRevealed] = useState(true);
  const [replayToken, setReplayToken] = useState(0);
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const graphRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = graphRef.current;
    if (element) {
      element.scrollLeft = element.scrollWidth;
    }
  }, [rows.length, hasChanges]);

  useEffect(() => {
    if (!hasChanges || reduced) {
      setRevealed(true);
      return;
    }
    setRevealed(false);
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) {
          setRevealed(true);
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [hasChanges, before, after, replayToken, reduced]);

  const replay = useCallback(() => setReplayToken((token) => token + 1), []);

  const laneCount = useMemo(() => Math.max(1, ...rows.map((row) => row.lane + 1)), [rows]);
  const rowIndex = useMemo(() => new Map(rows.map((row) => [row.commit.sha, row])), [rows]);

  const width = PADDING * 2 + LABEL_PAD * 2 + rows.length * COLUMN_WIDTH;
  const height = PADDING * 2 + laneCount * LANE_HEIGHT;

  const x = (index: number): number =>
    PADDING + LABEL_PAD + (rows.length - 1 - index) * COLUMN_WIDTH + COLUMN_WIDTH / 2;
  const y = (lane: number): number => PADDING + lane * LANE_HEIGHT + LANE_HEIGHT / 2;

  const link = line<[number, number]>()
    .x((point) => point[0])
    .y((point) => point[1])
    .curve(curveBumpY);

  const opacityFor = (state: NodeState): number => {
    if (state === "added") {
      return revealed ? 1 : 0;
    }
    if (state === "removed") {
      return revealed ? 0.18 : 1;
    }
    return 1;
  };

  const scaleFor = (state: NodeState): number => (state === "added" && !revealed ? 0.4 : 1);

  const headCommit = revealed ? (target.head?.commit ?? null) : (before.head?.commit ?? null);
  const headRow = headCommit ? rowIndex.get(headCommit) : undefined;
  const tipRow = hovered ? rowIndex.get(hovered.sha) : undefined;

  const showTip = (event: MouseEvent<SVGGElement>, sha: string) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHovered({ sha, left: rect.left + rect.width / 2, top: rect.bottom });
  };

  return (
    <div className="graph-wrap">
      {hasChanges ? (
        <div className="graph-bar">
          <span className="mono faint">
            {revealed ? "After the rehearsal" : "Before the rehearsal"}
          </span>
          <button className="quiet" onClick={replay}>
            Replay
          </button>
        </div>
      ) : null}
      <div className="graph" ref={graphRef} onMouseLeave={() => setHovered(null)}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Commit graph, history running left to right from oldest to newest. The commit list below carries every commit's sha, refs and subject."
        >
          {rows.map((row) =>
            row.commit.parents.map((parent, parentPosition) => {
              const parentRow = rowIndex.get(parent);
              if (!parentRow) {
                return null;
              }
              const path = link([
                [x(row.index), y(row.lane)],
                [x(parentRow.index), y(parentRow.lane)]
              ]);
              const edgeTone = LANE_TONES[parentRow.lane % LANE_TONES.length];
              return (
                <path
                  key={`edge-${row.commit.sha}-${parentPosition}`}
                  className="graph-edge"
                  d={path ?? ""}
                  fill="none"
                  stroke={`oklch(${edgeTone} 0 0)`}
                  strokeWidth={1}
                  style={{
                    opacity: Math.min(opacityFor(row.state), opacityFor(parentRow.state)) * 0.55
                  }}
                />
              );
            })
          )}

          {rows.map((row) => (
            <g
              key={`node-${row.commit.sha}`}
              className="graph-node"
              onMouseEnter={(event) => showTip(event, row.commit.sha)}
              style={{
                transform: `translate(${x(row.index)}px, ${y(row.lane)}px) scale(${scaleFor(row.state)})`,
                opacity: opacityFor(row.state)
              }}
            >
              <circle
                r={RADIUS}
                fill={`oklch(${LANE_TONES[row.lane % LANE_TONES.length]} 0 0)`}
              />
            </g>
          ))}

          {headRow ? (
            <g
              className="graph-head"
              style={{ transform: `translate(${x(headRow.index)}px, ${y(headRow.lane)}px)` }}
            >
              <circle r={RADIUS + 3.5} fill="none" stroke="oklch(0.96 0 0)" strokeWidth={1.5} />
            </g>
          ) : null}

          {rows.map((row) => {
            const isHead = headCommit === row.commit.sha;
            if (row.commit.refs.length === 0 && !isHead) {
              return null;
            }
            return (
              <g
                key={`label-${row.commit.sha}`}
                className="graph-label"
                style={{ opacity: opacityFor(row.state) }}
              >
                <text
                  x={x(row.index)}
                  y={y(row.lane) - RADIUS - 6}
                  textAnchor="middle"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
                >
                  {isHead ? <tspan style={{ fill: "oklch(0.96 0 0)" }}>HEAD </tspan> : null}
                  {row.commit.refs.map((decoration) => {
                    const change = moved.get(fullRefName(decoration));
                    return (
                      <tspan key={decoration}>
                        <tspan style={{ fill: "oklch(0.82 0 0)" }}>{decoration}</tspan>
                        {change ? (
                          <tspan style={{ fill: "var(--warn)" }}>
                            {change.after
                              ? ` \u2192 ${change.after.slice(0, 7)}`
                              : " \u2192 deleted"}
                          </tspan>
                        ) : null}
                        <tspan> </tspan>
                      </tspan>
                    );
                  })}
                </text>
              </g>
            );
          })}
        </svg>
        {hovered && tipRow ? (
          <div className="graph-tip" style={{ left: hovered.left, top: hovered.top }}>
            <span className="sha">{hovered.sha.slice(0, 7)}</span>
            <span>{tipRow.commit.subject}</span>
            {tipRow.state === "present" ? null : (
              <span className={`state ${tipRow.state}`}>{tipRow.state}</span>
            )}
          </div>
        ) : null}
      </div>

      <details className="graph-list">
        <summary>Commits ({rows.length})</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Commit</th>
              <th scope="col">Refs</th>
              <th scope="col">Subject</th>
              <th scope="col">State</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.commit.sha}>
                <td className="sha">{row.commit.sha.slice(0, 7)}</td>
                <td>
                  {row.commit.refs.length === 0
                    ? "none"
                    : row.commit.refs.map((decoration) => {
                        const change = moved.get(fullRefName(decoration));
                        return (
                          <span key={decoration}>
                            {decoration}
                            {change ? (
                              <span className="ref-change">
                                {change.after
                                  ? ` \u2192 ${change.after.slice(0, 7)}`
                                  : " \u2192 deleted"}
                              </span>
                            ) : null}{" "}
                          </span>
                        );
                      })}
                </td>
                <td className="subject">{row.commit.subject}</td>
                <td className={`state ${row.state}`}>{row.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
