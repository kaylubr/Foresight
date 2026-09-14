import { describe, expect, it } from "vitest";
import { evaluateGuards } from "../src/server/guards";
import { prepareCommand } from "../src/server/parseCommand";
import type { GuardContext, GuardResult } from "../src/server/guards";

const noAliases = new Map();

function guard(input: string, context: Partial<GuardContext> = {}): GuardResult {
  const parsed = prepareCommand(input, noAliases);
  if (!parsed.ok) {
    throw new Error(`parse failed: ${parsed.reason}`);
  }
  return evaluateGuards(parsed.command, {
    untracked: [],
    ignored: [],
    sequence: null,
    ...context
  });
}

describe("untracked and ignored gate", () => {
  it("refuses add -A when untracked files exist", () => {
    const result = guard("git add -A", { untracked: ["u.txt"] });
    expect(result.refusal?.code).toBe("untracked-add");
    expect(result.refusal?.reason).toContain("1 untracked file");
  });

  it("allows add -A when nothing is untracked", () => {
    expect(guard("git add -A").refusal).toBeNull();
  });

  it("refuses a pathspec naming a specific untracked file", () => {
    const result = guard("git add secret.txt", { untracked: ["secret.txt"] });
    expect(result.refusal?.code).toBe("untracked-add");
  });

  it("refuses a pathspec that names an untracked directory", () => {
    const result = guard("git add build", { untracked: ["build/output.js"] });
    expect(result.refusal?.code).toBe("untracked-add");
  });

  it("allows a pathspec that names a tracked file", () => {
    expect(guard("git add a.txt", { untracked: ["other.txt"] }).refusal).toBeNull();
  });

  it("refuses add -f when ignored files exist", () => {
    const result = guard("git add -f local.env", { ignored: ["local.env"] });
    expect(result.refusal?.code).toBe("ignored-add");
  });

  it("refuses add -e because the edit is the command", () => {
    expect(guard("git add -e a.txt").refusal?.code).toBe("interactive-add-edit");
  });

  it("refuses add -p as an interactive loop", () => {
    expect(guard("git add -p").refusal?.code).toBe("interactive-add");
  });

  it("refuses stash -u when untracked files exist", () => {
    expect(guard("git stash -u", { untracked: ["u.txt"] }).refusal?.code).toBe("untracked-stash");
  });
});

describe("branch switching", () => {
  it("refuses a plain switch when ignored files exist", () => {
    const result = guard("git checkout feature", { ignored: ["local.env"] });
    expect(result.refusal?.code).toBe("ignored-switch");
  });

  it("allows a plain switch with --no-overwrite-ignore", () => {
    expect(
      guard("git checkout --no-overwrite-ignore feature", { ignored: ["local.env"] }).refusal
    ).toBeNull();
  });

  it("refuses a forced switch when untracked files exist", () => {
    const result = guard("git checkout -f feature", { untracked: ["u.txt"] });
    expect(result.refusal?.code).toBe("forced-switch-untracked");
  });

  it("fails closed on switch -f", () => {
    const result = guard("git switch -f feature", { untracked: ["u.txt"] });
    expect(result.refusal?.code).toBe("forced-switch-untracked");
  });

  it("does not gate a path restore", () => {
    expect(guard("git checkout -- a.txt", { ignored: ["local.env"] }).refusal).toBeNull();
  });

  it("does not gate merge against untracked files", () => {
    expect(guard("git merge feature", { untracked: ["u.txt"] }).refusal).toBeNull();
  });
});

describe("editor-driven commands", () => {
  it("refuses commit without a message", () => {
    expect(guard("git commit").refusal?.code).toBe("commit-needs-message");
  });

  it("allows commit with a message or --no-edit", () => {
    expect(guard("git commit -m 'x'").refusal).toBeNull();
    expect(guard("git commit --amend --no-edit").refusal).toBeNull();
  });

  it("refuses an annotated tag without a message", () => {
    expect(guard("git tag -a v1").refusal?.code).toBe("tag-needs-message");
    expect(guard("git tag -a v1 -m 'release'").refusal).toBeNull();
  });

  it("auto-answers a plain merge message", () => {
    expect(guard("git merge feature").autoAnswerMergeMessage).toBe(true);
    expect(guard("git merge feature -m 'x'").autoAnswerMergeMessage).toBe(false);
  });

  it("refuses rebase --exec", () => {
    expect(guard("git rebase --exec 'echo hi' HEAD~1").refusal?.code).toBe("rebase-exec");
  });

  it("refuses a cherry-pick that would open an editor", () => {
    expect(guard("git cherry-pick -e abc123").refusal?.code).toBe("sequencer-edit");
  });
});

describe("interactive rebase todo", () => {
  it("refuses reword", () => {
    const result = guard("git rebase -i HEAD~2", { sequence: "reword abc123 subject" });
    expect(result.refusal?.code).toBe("sequence-reword");
  });

  it("refuses exec", () => {
    const result = guard("git rebase -i HEAD~2", { sequence: "exec rm -rf /" });
    expect(result.refusal?.code).toBe("sequence-exec");
  });

  it("allows pick, squash, fixup, drop and edit", () => {
    const sequence = ["pick abc123 a", "squash def456 b", "fixup 999999 c", "drop 000000 d", "edit 111111 e"].join("\n");
    expect(guard("git rebase -i HEAD~2", { sequence }).refusal).toBeNull();
  });
});
