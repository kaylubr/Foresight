import { execFileSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import { cloneArguments, createMirror } from "../src/rehearsal/mirror";
import { readModelledState } from "../src/repository/repoState";

const mirrors: Array<{ dispose: () => Promise<void> }> = [];

afterAll(async () => {
  for (const mirror of mirrors) {
    await mirror.dispose();
  }
});

function repoRoot(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd() })
    .toString()
    .trim();
}

describe("cloneArguments", () => {
  it("does not force --local, so a cross-filesystem clone copies instead of failing", () => {
    const args = cloneArguments("/home/someone/repo", "/tmp/foresight-x/clone");
    expect(args).not.toContain("--local");
    expect(args).not.toContain("-l");
    expect(args).toEqual(["clone", "--quiet", "/home/someone/repo", "/tmp/foresight-x/clone"]);
  });
});

describe("createMirror", () => {
  it("mirrors a repository that may live on a different filesystem than the temp dir", async () => {
    const origin = repoRoot();
    const originState = await readModelledState(origin);
    const mirror = await createMirror(origin, originState);
    mirrors.push(mirror);

    const cloned = await readModelledState(mirror.path);
    expect(cloned.head.symbolic).toBe(originState.head.symbolic);
    expect(cloned.head.commit).toBe(originState.head.commit);

    const localHeads = (refs: { name: string }[]) =>
      refs.filter((ref) => ref.name.startsWith("refs/heads/")).sort((a, b) => a.name.localeCompare(b.name));
    expect(localHeads(cloned.refs)).toEqual(localHeads(originState.refs));
  }, 120_000);
});
