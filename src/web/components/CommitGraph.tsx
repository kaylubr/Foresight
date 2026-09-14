import { curveBumpX, line } from "d3";
import { useMemo } from "react";
import type { CommitNode, HeadState, RefChange } from "../../shared/types";

const ROW_HEIGHT = 26;
const LANE_WIDTH = 16;
const RADIUS = 5;
const PADDING = 14;
const LABEL_WIDTH = 460;

const LANE_TONES = [0.8, 0.64, 0.52, 0.44, 0.38];

interface Row {
  commit: CommitNode;
  lane: number;
  index: number;
}

function layout(commits: CommitNode[]): Row[] {
  const active: Array<string | null> = [];
  const rows: Row[] = [];

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
  commits,
  head,
  changedRefs
}: {
  commits: CommitNode[];
  head: HeadState;
  changedRefs: RefChange[];
}) {
  const rows = useMemo(() => layout(commits), [commits]);
  const laneCount = useMemo(() => Math.max(1, ...rows.map((row) => row.lane + 1)), [rows]);
  const rowIndex = useMemo(() => new Map(rows.map((row) => [row.commit.sha, row])), [rows]);
  const moved = useMemo(() => new Map(changedRefs.map((ref) => [ref.name, ref])), [changedRefs]);

  const width = PADDING * 2 + laneCount * LANE_WIDTH + LABEL_WIDTH;
  const height = rows.length * ROW_HEIGHT + PADDING * 2;

  const x = (lane: number): number => PADDING + lane * LANE_WIDTH + LANE_WIDTH / 2;
  const y = (index: number): number => PADDING + index * ROW_HEIGHT + ROW_HEIGHT / 2;

  const link = line<[number, number]>()
    .x((point) => point[0])
    .y((point) => point[1])
    .curve(curveBumpX);

  const headRow = head.commit ? rowIndex.get(head.commit) : undefined;

  return (
    <div className="graph">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Commit graph of the connected repository"
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
            return (
              <path
                key={`edge-${row.commit.sha}-${parentPosition}`}
                d={path ?? ""}
                fill="none"
                stroke={`oklch(${LANE_TONES[parentRow.lane % LANE_TONES.length]} 0 0)`}
                strokeWidth={1}
                opacity={0.55}
              />
            );
          })
        )}

        {rows.map((row) => (
          <circle
            key={`node-${row.commit.sha}`}
            cx={x(row.lane)}
            cy={y(row.index)}
            r={RADIUS}
            fill={`oklch(${LANE_TONES[row.lane % LANE_TONES.length]} 0 0)`}
          />
        ))}

        {headRow ? (
          <circle
            cx={x(headRow.lane)}
            cy={y(headRow.index)}
            r={RADIUS + 3}
            fill="none"
            stroke="oklch(0.96 0 0)"
            strokeWidth={1.5}
          />
        ) : null}

        <g style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
          {rows.map((row) => (
            <text
              key={`label-${row.commit.sha}`}
              x={PADDING + laneCount * LANE_WIDTH + 12}
              y={y(row.index) + 4}
            >
              {head.commit === row.commit.sha ? (
                <tspan style={{ fill: "oklch(0.96 0 0)" }}>HEAD </tspan>
              ) : null}
              {row.commit.refs.map((decoration) => {
                const change = moved.get(fullRefName(decoration));
                return (
                  <tspan key={decoration}>
                    <tspan style={{ fill: "oklch(0.8 0 0)" }}>{decoration}</tspan>
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
              <tspan style={{ fill: "oklch(0.72 0 0)" }}>{row.commit.subject.slice(0, 72)}</tspan>
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
}
