import { curveBumpX, line } from "d3";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CommitNode, GraphData, RefChange } from "../../shared/types";

const ROW_HEIGHT = 26;
const LANE_WIDTH = 16;
const RADIUS = 5;
const PADDING = 14;
const LABEL_WIDTH = 460;
const LANE_TONES = [0.82, 0.66, 0.54, 0.46, 0.4];

type NodeState = "present" | "added" | "removed";

interface Row {
  commit: CommitNode;
  lane: number;
  index: number;
  state: NodeState;
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

  useEffect(() => {
    if (!hasChanges) {
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
  }, [hasChanges, before, after, replayToken]);

  const replay = useCallback(() => setReplayToken((token) => token + 1), []);

  const laneCount = useMemo(() => Math.max(1, ...rows.map((row) => row.lane + 1)), [rows]);
  const rowIndex = useMemo(() => new Map(rows.map((row) => [row.commit.sha, row])), [rows]);

  const width = PADDING * 2 + laneCount * LANE_WIDTH + LABEL_WIDTH;
  const height = rows.length * ROW_HEIGHT + PADDING * 2;

  const x = (lane: number): number => PADDING + lane * LANE_WIDTH + LANE_WIDTH / 2;
  const y = (index: number): number => PADDING + index * ROW_HEIGHT + ROW_HEIGHT / 2;

  const link = line<[number, number]>()
    .x((point) => point[0])
    .y((point) => point[1])
    .curve(curveBumpX);

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
      <div className="graph">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Commit graph, before and after the rehearsal"
        >
          {rows.map((row) =>
            row.commit.parents.map((parent, parentPosition) => {
              const parentRow = rowIndex.get(parent);
              if (!parentRow) {
                return null;
              }
              const path = link([
                [x(row.lane), y(row.index)],
                [x(parentRow.lane), y(parentRow.index)]
              ]);
              const edgeTone = LANE_TONES[parentRow.lane % LANE_TONES.length];
              return (
                <path
                  key={`edge-${row.commit.sha}-${parentPosition}`}
                  d={path ?? ""}
                  fill="none"
                  stroke={`oklch(${edgeTone} 0 0)`}
                  strokeWidth={1}
                  style={{
                    opacity: Math.min(opacityFor(row.state), opacityFor(parentRow.state)) * 0.55,
                    transition: "opacity 320ms ease"
                  }}
                />
              );
            })
          )}

          {rows.map((row) => (
            <g
              key={`node-${row.commit.sha}`}
              style={{
                transform: `translate(${x(row.lane)}px, ${y(row.index)}px) scale(${scaleFor(row.state)})`,
                opacity: opacityFor(row.state),
                transition: "opacity 320ms ease, transform 320ms cubic-bezier(0.16, 1, 0.3, 1)"
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
              style={{
                transform: `translate(${x(headRow.lane)}px, ${y(headRow.index)}px)`,
                transition: "transform 420ms cubic-bezier(0.16, 1, 0.3, 1)"
              }}
            >
              <circle r={RADIUS + 3.5} fill="none" stroke="oklch(0.96 0 0)" strokeWidth={1.5} />
            </g>
          ) : null}

          {rows.map((row) => {
            const isHead = headCommit === row.commit.sha;
            return (
              <g
                key={`label-${row.commit.sha}`}
                style={{
                  opacity: opacityFor(row.state),
                  transition: "opacity 320ms ease"
                }}
              >
                <text
                  x={PADDING + laneCount * LANE_WIDTH + 12}
                  y={y(row.index) + 4}
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
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
                  <tspan style={{ fill: "oklch(0.6 0 0)" }}>{row.commit.sha.slice(0, 7)} </tspan>
                  <tspan style={{ fill: "oklch(0.74 0 0)" }}>{row.commit.subject.slice(0, 72)}</tspan>
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
