import { describe, expect, it } from "vitest";
import {
  buildChangeSet,
  compareFingerprints,
  compareModelledState,
  detectBlockingAnomaly
} from "../src/server/diff";
import type { Fingerprints, ModelledState } from "../src/shared/types";

function state(partial: Partial<ModelledState> = {}): ModelledState {
  return {
    head: { symbolic: "refs/heads/main", commit: "aaa", detached: false },
    refs: [{ name: "refs/heads/main", target: "aaa" }],
    indexDigest: "index-1",
    stagedEntries: [],
    worktreeDigest: "work-1",
    worktreeEntries: [],
    ...partial
  };
}

function fingerprints(partial: Partial<Fingerprints> = {}): Fingerprints {
  return {
    configHash: "config-1",
    reflogTips: { "refs/heads/main": "aaa" },
    objectCount: 10,
    inPackCount: 90,
    packedRefsHash: null,
    commitGraphMtimeMs: null,
    ...partial
  };
}

describe("buildChangeSet", () => {
  it("reports nothing for identical state", () => {
    const changeSet = buildChangeSet(state(), state(), ["a"], ["a"]);
    expect(changeSet.empty).toBe(true);
  });

  it("reports a moved ref", () => {
    const after = state({ refs: [{ name: "refs/heads/main", target: "bbb" }] });
    const changeSet = buildChangeSet(state(), after, ["a"], ["a", "b"]);
    expect(changeSet.empty).toBe(false);
    expect(changeSet.refs).toEqual([{ name: "refs/heads/main", before: "aaa", after: "bbb" }]);
    expect(changeSet.commitsAdded).toEqual(["b"]);
  });

  it("reports a created and a deleted ref", () => {
    const before = state({
      refs: [
        { name: "refs/heads/main", target: "aaa" },
        { name: "refs/heads/gone", target: "ccc" }
      ]
    });
    const after = state({
      refs: [
        { name: "refs/heads/main", target: "aaa" },
        { name: "refs/heads/fresh", target: "ddd" }
      ]
    });
    const changeSet = buildChangeSet(before, after, [], []);
    expect(changeSet.refs).toEqual([
      { name: "refs/heads/fresh", before: null, after: "ddd" },
      { name: "refs/heads/gone", before: "ccc", after: null }
    ]);
  });

  it("reports a branch switch as a HEAD change", () => {
    const after = state({ head: { symbolic: "refs/heads/other", commit: "aaa", detached: false } });
    const changeSet = buildChangeSet(state(), after, [], []);
    expect(changeSet.empty).toBe(false);
    expect(changeSet.head.before).toBe("refs/heads/main");
    expect(changeSet.head.after).toBe("refs/heads/other");
  });

  it("reports staged and worktree path changes", () => {
    const after = state({
      indexDigest: "index-2",
      stagedEntries: ["M\tb.txt"],
      worktreeDigest: "work-2",
      worktreeEntries: ["M\tc.txt"]
    });
    const changeSet = buildChangeSet(state(), after, [], []);
    expect(changeSet.indexChanged).toBe(true);
    expect(changeSet.staged).toEqual([{ path: "b.txt", before: ".", after: "M" }]);
    expect(changeSet.worktreeChanged).toBe(true);
    expect(changeSet.worktree).toEqual([{ path: "c.txt", before: ".", after: "M" }]);
  });

  it("reports commits that became unreachable", () => {
    const changeSet = buildChangeSet(state(), state(), ["a", "b"], ["a"]);
    expect(changeSet.commitsRemoved).toEqual(["b"]);
    expect(changeSet.empty).toBe(false);
  });
});

describe("compareFingerprints", () => {
  it("reports no badges when nothing moved", () => {
    expect(compareFingerprints(fingerprints(), fingerprints())).toEqual([]);
  });

  it("names the config surface", () => {
    const badges = compareFingerprints(fingerprints(), fingerprints({ configHash: "config-2" }));
    expect(badges.map((badge) => badge.surface)).toEqual(["config"]);
  });

  it("names the object store, packed-refs and commit-graph surfaces", () => {
    const badges = compareFingerprints(
      fingerprints(),
      fingerprints({
        objectCount: 12,
        packedRefsHash: "packed-1",
        commitGraphMtimeMs: 42
      })
    );
    expect(badges.map((badge) => badge.surface).sort()).toEqual([
      "commit-graph",
      "object-store",
      "packed-refs"
    ]);
  });

  it("detects a reflog rewrite with no ref move", () => {
    const badges = compareFingerprints(
      fingerprints(),
      fingerprints({ reflogTips: { "refs/heads/main": "zzz" } })
    );
    expect(badges.map((badge) => badge.surface)).toEqual(["reflog"]);
  });
});

describe("detectBlockingAnomaly", () => {
  const emptySet = buildChangeSet(state(), state(), [], []);
  const movedSet = buildChangeSet(state(), state({ indexDigest: "index-2" }), [], []);

  it("fires when the object store moved with no modelled explanation on a successful run", () => {
    const badges = compareFingerprints(fingerprints(), fingerprints({ objectCount: 11 }));
    expect(detectBlockingAnomaly(badges, emptySet, 0)).toBe(true);
    expect(badges[0]?.blocking).toBe(true);
  });

  it("stays quiet when a modelled surface explains the churn", () => {
    const badges = compareFingerprints(fingerprints(), fingerprints({ objectCount: 11 }));
    expect(detectBlockingAnomaly(badges, movedSet, 0)).toBe(false);
    expect(badges[0]?.blocking).toBe(false);
  });

  it("stays quiet when the run failed", () => {
    const badges = compareFingerprints(fingerprints(), fingerprints({ objectCount: 11 }));
    expect(detectBlockingAnomaly(badges, emptySet, 2)).toBe(false);
  });
});

describe("compareModelledState", () => {
  it("is not stale for identical state", () => {
    expect(compareModelledState(state(), state())).toEqual({ stale: false, changed: [] });
  });

  it("reports the surfaces that moved", () => {
    const after = state({
      head: { symbolic: "refs/heads/other", commit: "bbb", detached: false },
      worktreeDigest: "work-9"
    });
    const result = compareModelledState(state(), after);
    expect(result.stale).toBe(true);
    expect(result.changed).toContain("HEAD");
    expect(result.changed).toContain("the working directory");
  });
});
