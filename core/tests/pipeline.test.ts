import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectRepo, currentDenialProbe, previewCommand } from "../src/pipeline";

const createdRepos: string[] = [];

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "pipe", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" } });
}

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "foresight-integration-"));
  createdRepos.push(dir);
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  writeFileSync(join(dir, "a.txt"), "one\n");
  writeFileSync(join(dir, "b.txt"), "two\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-qm", "initial"]);
  writeFileSync(join(dir, "a.txt"), "one\nstaged\n");
  git(dir, ["add", "a.txt"]);
  writeFileSync(join(dir, "b.txt"), "two\nunstaged\n");
  writeFileSync(join(dir, "untracked.txt"), "secret\n");
  writeFileSync(join(dir, ".gitignore"), "*.log\n");
  writeFileSync(join(dir, "noise.log"), "ignored\n");
  return dir;
}

function settle(repo: string): void {
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-qm", "settle"]);
}

let sandboxReady = false;

beforeAll(async () => {
  const probe = await currentDenialProbe();
  sandboxReady = probe.ok;
});

afterAll(() => {
  for (const repo of createdRepos) {
    rmSync(repo, { recursive: true, force: true });
  }
});

describe("pipeline integration", () => {
  it("reads a repository's modelled state", async () => {
    const repo = makeRepo();
    const connected = await connectRepo(repo);
    expect(connected.name.startsWith("foresight-integration-")).toBe(true);
    expect(connected.state.head.symbolic).toBe("refs/heads/main");
    expect(connected.state.stagedEntries).toEqual(["M\ta.txt"]);
    expect(connected.state.worktreeEntries).toEqual(["M\tb.txt"]);
    expect(connected.untracked).toContain("untracked.txt");
    expect(connected.ignored).toContain("noise.log");
    expect(connected.staticDisqualifiers).toEqual({ submodules: false, lfs: false, linkedWorktrees: 0 });
    expect(connected.dynamicDisqualifiers.operation).toBeNull();
  });

  it("mirrors untracked files so a staging command is represented", async () => {
    if (!sandboxReady) {
      return;
    }
    const repo = makeRepo();
    const outcome = await previewCommand({ path: repo, command: "git add -A" });
    expect(outcome.kind).toBe("preview");
    if (outcome.kind === "preview") {
      expect(outcome.changeSet?.staged.some((change) => change.path === "untracked.txt")).toBe(true);
    }
  }, 120_000);

  it("refuses a shell line without executing it", async () => {
    const repo = makeRepo();
    const outcome = await previewCommand({ path: repo, command: "git status; rm -rf /" });
    expect(outcome.kind).toBe("refusal");
  });

  it("warns instead of refusing when the repository is mid-operation", async () => {
    const repo = makeRepo();
    settle(repo);
    git(repo, ["checkout", "-qb", "other"]);
    writeFileSync(join(repo, "a.txt"), "other side\n");
    git(repo, ["add", "a.txt"]);
    git(repo, ["commit", "-qm", "other"]);
    git(repo, ["checkout", "-q", "main"]);
    writeFileSync(join(repo, "a.txt"), "main side\n");
    git(repo, ["add", "a.txt"]);
    git(repo, ["commit", "-qm", "main"]);
    try {
      git(repo, ["rebase", "other"]);
    } catch {
      // expected to stop on a conflict
    }
    const outcome = await previewCommand({ path: repo, command: "git status" });
    expect(outcome.kind).not.toBe("refusal");
    expect(outcome.fidelityWarnings.some((warning) => warning.includes("rebase"))).toBe(true);
  }, 60_000);

  it("previews a commit faithfully against a mirrored dirty worktree", async () => {
    if (!sandboxReady) {
      return;
    }
    const repo = makeRepo();
    const outcome = await previewCommand({ path: repo, command: "git commit -m 'second'" });
    expect(outcome.kind).toBe("preview");
    if (outcome.kind === "preview") {
      expect(outcome.changeSet).not.toBeNull();
      expect(outcome.changeSet?.refs.some((ref) => ref.name === "refs/heads/main")).toBe(true);
      expect(outcome.changeSet?.commitsAdded).toHaveLength(1);
      expect(outcome.changeSet?.indexChanged).toBe(true);
      expect(outcome.blockingAnomaly).toBe(false);
    }
  }, 120_000);

  it("reports a command that changes nothing as an empty preview", async () => {
    if (!sandboxReady) {
      return;
    }
    const repo = makeRepo();
    const outcome = await previewCommand({ path: repo, command: "git status" });
    expect(outcome.kind).toBe("preview");
    if (outcome.kind === "preview") {
      expect(outcome.changeSet?.empty).toBe(true);
    }
  }, 120_000);

  it("reports a conflict as its own outcome and leaves the clone clean", async () => {
    if (!sandboxReady) {
      return;
    }
    const repo = makeRepo();
    settle(repo);
    git(repo, ["checkout", "-qb", "other"]);
    writeFileSync(join(repo, "a.txt"), "other side\n");
    git(repo, ["add", "a.txt"]);
    git(repo, ["commit", "-qm", "other"]);
    git(repo, ["checkout", "-q", "main"]);
    writeFileSync(join(repo, "a.txt"), "main side\n");
    git(repo, ["add", "a.txt"]);
    git(repo, ["commit", "-qm", "main"]);

    const outcome = await previewCommand({ path: repo, command: "git rebase other" });
    expect(outcome.kind).toBe("conflict-stop");
    if (outcome.kind === "conflict-stop") {
      expect(outcome.operation).toBe("rebase");
      expect(outcome.paths).toContain("a.txt");
      expect(outcome.changeSet?.empty).toBe(true);
    }
  }, 120_000);
});
