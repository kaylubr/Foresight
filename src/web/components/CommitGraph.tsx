import { curveBumpX, line, scaleOrdinal, schemeTableau10 } from "d3";
import { useMemo } from "react";
import type { CommitNode } from "../../shared/types";

const ROW_HEIGHT = 26;
const LANE_WIDTH = 16;
const RADIUS = 5;
const PADDING = 14;
const LABEL_WIDTH = 360;

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

export default function CommitGraph({ commits }: { commits: CommitNode[] }) {
  const rows = useMemo(() => layout(commits), [commits]);
  const laneCount = useMemo(() => Math.max(1, ...rows.map((row) => row.lane + 1)), [rows]);
  const rowIndex = useMemo(() => new Map(rows.map((row) => [row.commit.sha, row])), [rows]);
  const color = useMemo(() => scaleOrdinal<string, string>(schemeTableau10), []);

  const width = PADDING * 2 + laneCount * LANE_WIDTH + LABEL_WIDTH;
  const height = rows.length * ROW_HEIGHT + PADDING * 2;

  const x = (lane: number): number => PADDING + lane * LANE_WIDTH + LANE_WIDTH / 2;
  const y = (index: number): number => PADDING + index * ROW_HEIGHT + ROW_HEIGHT / 2;

  const link = line<[number, number]>()
    .x((point) => point[0])
    .y((point) => point[1])
    .curve(curveBumpX);

  return (
    <div className="graph">
      <svg width={width} height={height} role="img" aria-label="commit graph">
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
                stroke={color(String(row.lane))}
                strokeWidth={1.5}
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
            fill={color(String(row.lane))}
          />
        ))}
        <g fontFamily="ui-monospace, monospace" fontSize={11} fill="#8b93a3">
          {rows.map((row) => (
            <text
              key={`label-${row.commit.sha}`}
              x={PADDING + laneCount * LANE_WIDTH + 10}
              y={y(row.index) + 4}
            >
              {row.commit.refs.length > 0 ? `${row.commit.refs.join(" ")}  ` : ""}
              {row.commit.sha.slice(0, 7)} {row.commit.subject.slice(0, 64)}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
}
