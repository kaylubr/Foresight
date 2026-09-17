import { curveBumpY, line } from "d3";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { CommitNode, GraphData, RefChange } from "../../../shared/types";

const COLUMN_WIDTH = 44;
const LANE_HEIGHT = 40;
const RADIUS = 7;
const PADDING = 12;
const LABEL_PAD = 150;
const REF_GAP = 13;
const LABEL_CHAR = 6.6;

const SPINE_FILL = "oklch(0.82 0 0)";
const MARKER = "oklch(0.96 0 0)";
const LANE_LIGHTNESS = 0.72;
const LANE_CHROMA = 0.11;
const LANE_HUES = [250, 200, 300, 225, 330, 270];

function laneColor(lane: number): string {
  if (lane === 0) {
    return SPINE_FILL;
  }
  return `oklch(${LANE_LIGHTNESS} ${LANE_CHROMA} ${LANE_HUES[(lane - 1) % LANE_HUES.length]})`;
}

type NodeState = "present" | "added" | "removed";

interface Row {
  commit: CommitNode;
  lane: number;
  index: number;
  state: NodeState;
  refs: string[];
}

interface Hovered {
  sha: string;
  left: number;
  top: number;
}

function layout(commits: CommitNode[]): Array<Omit<Row, "state" | "refs">> {
  const active: Array<string | null> = [];
  const rows: Array<Omit<Row, "state" | "refs">> = [];

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

function stripHead(decoration: string): string {
  return decoration.startsWith("HEAD -> ") ? decoration.slice(8) : decoration;
}

function isRemote(decoration: string): boolean {
  const cleaned = stripHead(decoration);
  return !cleaned.startsWith("tag: ") && cleaned.includes("/");
}

function remoteBranchName(decoration: string): string {
  const segments = stripHead(decoration).split("/");
  return segments.slice(1).join("/");
}

function visibleRefs(refs: string[]): string[] {
  const localNames = new Set(
    refs
      .filter((ref) => !isRemote(ref) && !ref.startsWith("tag: "))
      .map((ref) => stripHead(ref))
  );
  return refs.filter((ref) => !isRemote(ref) || !localNames.has(remoteBranchName(ref)));
}

function trackName(row: Row): string {
  const branch = row.refs.find((ref) => !ref.startsWith("tag: "));
  return branch ? stripHead(branch) : `track ${row.lane + 1}`;
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

function NodeGlyph({ state }: { state: NodeState }) {
  return (
    <svg width="20" height="14" aria-hidden="true" className="graph-glyph">
      {state === "removed" ? (
        <circle cx="10" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth={1.5} />
      ) : (
        <circle cx="10" cy="7" r="5" fill="currentColor" />
      )}
      {state === "added" ? (
        <circle cx="10" cy="7" r="7" fill="none" stroke="currentColor" strokeWidth={1.5} />
      ) : null}
    </svg>
  );
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
    const laid = layout(union);
    const headSha = target.head?.commit ?? null;
    const headLane =
      headSha === null ? undefined : laid.find((row) => row.commit.sha === headSha)?.lane;
    const spineSwap = headLane !== undefined && headLane !== 0 ? headLane : null;
    const ordered =
      spineSwap === null
        ? laid
        : laid.map((row) => ({
            ...row,
            lane: row.lane === 0 ? spineSwap : row.lane === spineSwap ? 0 : row.lane
          }));
    return ordered.map((row) => ({
      ...row,
      refs: visibleRefs(row.commit.refs),
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

  const trackNames = useMemo(() => {
    const names = new Map<number, string>();
    for (const row of rows) {
      if (!names.has(row.lane) && row.refs.some((ref) => !ref.startsWith("tag: "))) {
        names.set(row.lane, trackName(row));
      }
    }
    return names;
  }, [rows]);

  const width = PADDING * 2 + LABEL_PAD * 2 + rows.length * COLUMN_WIDTH;
  const height = PADDING * 2 + laneCount * LANE_HEIGHT;

  const x = (index: number): number =>
    PADDING + LABEL_PAD + (rows.length - 1 - index) * COLUMN_WIDTH + COLUMN_WIDTH / 2;
  const y = (lane: number): number => PADDING + lane * LANE_HEIGHT + LANE_HEIGHT / 2;

  const link = line<[number, number]>()
    .x((point) => point[0])
    .y((point) => point[1])
    .curve(curveBumpY);

  const edgeOpacity = (state: NodeState): number => {
    if (state === "added") {
      return revealed ? 1 : 0;
    }
    if (state === "removed") {
      return revealed ? 0.18 : 1;
    }
    return 1;
  };

  const nodeOpacity = (state: NodeState): number => (state === "added" && !revealed ? 0 : 1);
  const nodeScale = (state: NodeState): number => (state === "added" && !revealed ? 0.4 : 1);
  const fillOpacity = (state: NodeState): number => (state === "removed" && revealed ? 0 : 1);

  const headCommit = revealed ? (target.head?.commit ?? null) : (before.head?.commit ?? null);
  const headRow = headCommit ? rowIndex.get(headCommit) : undefined;
  const tipRow = hovered ? rowIndex.get(hovered.sha) : undefined;

  const showTip = (event: MouseEvent<SVGGElement>, sha: string) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHovered({ sha, left: rect.left + rect.width / 2, top: rect.bottom });
  };

  return (
    <div className="graph-wrap">
      <div className="graph-bar">
        <div className="graph-bar-left">
          {hasChanges ? (
            <span className="mono faint">
              {revealed ? "After the rehearsal" : "Before the rehearsal"}
            </span>
          ) : null}
        </div>
        <span className="graph-key">
          <span className="key-item">
            <NodeGlyph state="present" />
            present
          </span>
          <span className="key-item">
            <NodeGlyph state="added" />
            added
          </span>
          <span className="key-item">
            <NodeGlyph state="removed" />
            removed
          </span>
        </span>
        <button className="quiet" onClick={replay} disabled={!hasChanges}>
          Replay
        </button>
      </div>
      <div className="graph" ref={graphRef} onMouseLeave={() => setHovered(null)}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Commit graph, history running left to right from oldest to newest, ${laneCount} tracks. The commit list below carries every commit's sha, track, refs and subject.`}
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
              return (
                <path
                  key={`edge-${row.commit.sha}-${parentPosition}`}
                  className="graph-edge"
                  d={path ?? ""}
                  fill="none"
                  stroke={laneColor(parentRow.lane)}
                  strokeWidth={1}
                  style={{
                    opacity: Math.min(edgeOpacity(row.state), edgeOpacity(parentRow.state)) * 0.55
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
                transform: `translate(${x(row.index)}px, ${y(row.lane)}px) scale(${nodeScale(row.state)})`,
                opacity: nodeOpacity(row.state)
              }}
            >
              <circle
                className="graph-fill"
                r={RADIUS}
                fill={laneColor(row.lane)}
                fillOpacity={fillOpacity(row.state)}
                stroke={row.state === "removed" ? laneColor(row.lane) : "none"}
                strokeWidth={1.5}
              />
              {row.state === "added" ? (
                <circle r={RADIUS + 2.5} fill="none" stroke={MARKER} strokeWidth={1.5} />
              ) : null}
            </g>
          ))}

          {headRow ? (
            <g
              className="graph-head"
              style={{ transform: `translate(${x(headRow.index)}px, ${y(headRow.lane)}px)` }}
            >
              <circle r={RADIUS + 4.5} fill="none" stroke={MARKER} strokeWidth={1.5} />
            </g>
          ) : null}

          {rows.map((row) => {
            const isHead = headCommit === row.commit.sha;
            const refs = isHead && row.refs.length === 0 ? [""] : row.refs;
            if (refs.length === 0) {
              return null;
            }
            const items = refs.map((decoration) => {
              const head = decoration.length === 0 || decoration.startsWith("HEAD -> ");
              const label = decoration.length === 0
                ? "HEAD"
                : head
                  ? `HEAD ${stripHead(decoration)}`
                  : decoration;
              return {
                decoration,
                head,
                label,
                change: decoration.length === 0 ? undefined : moved.get(fullRefName(decoration))
              };
            });
            const widths = items.map(
              (item) => (item.label.length + (item.change ? 12 : 0)) * LABEL_CHAR + 10
            );
            let cursor = x(row.index) - widths.reduce((sum, width) => sum + width, 0) / 2;
            return (
              <g
                key={`label-${row.commit.sha}`}
                className="graph-label"
                style={{ opacity: nodeOpacity(row.state) }}
              >
                {items.map((item, position) => {
                  const center = cursor + widths[position] / 2;
                  cursor += widths[position];
                  return (
                    <g key={`${row.commit.sha}-${item.decoration}-${position}`}>
                      <line
                        x1={center}
                        y1={y(row.lane) - RADIUS - REF_GAP + 2}
                        x2={x(row.index)}
                        y2={y(row.lane) - RADIUS - 1}
                        stroke={laneColor(row.lane)}
                        strokeWidth={1}
                      />
                      <text
                        x={center}
                        y={y(row.lane) - RADIUS - REF_GAP}
                        textAnchor="middle"
                        style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
                      >
                        <tspan style={{ fill: item.head ? MARKER : "oklch(0.82 0 0)" }}>
                          {item.label}
                        </tspan>
                        {item.change ? (
                          <tspan style={{ fill: "var(--warn)" }}>
                            {item.change.after
                              ? ` \u2192 ${item.change.after.slice(0, 7)}`
                              : " \u2192 deleted"}
                          </tspan>
                        ) : null}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
        {hovered && tipRow ? (
          <div className="graph-tip" style={{ left: hovered.left, top: hovered.top }}>
            <span className="sha">{hovered.sha.slice(0, 7)}</span>
            <span className="track">
              {trackNames.get(tipRow.lane) ?? `track ${tipRow.lane + 1}`}
            </span>
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
              <th scope="col">Track</th>
              <th scope="col">Refs</th>
              <th scope="col">Subject</th>
              <th scope="col">State</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.commit.sha}>
                <td className="sha">{row.commit.sha.slice(0, 7)}</td>
                <td className="track">{trackNames.get(row.lane) ?? `track ${row.lane + 1}`}</td>
                <td>
                  {row.refs.length === 0
                    ? "none"
                    : row.refs.map((decoration) => {
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
