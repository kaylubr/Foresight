import { describe, expect, it } from "vitest";
import { evaluateGuards } from "../src/command/guards";
import { prepareCommand } from "../src/command/parseCommand";
import type { GuardContext, GuardResult } from "../src/command/guards";

const noAliases = new Map();

function guard(input: string, context: Partial<GuardContext> = {}): GuardResult {
  const parsed = prepareCommand(input, noAliases);
  if (!parsed.ok) {
    throw new Error(`parse failed: ${parsed.reason}`);
  }
  return evaluateGuards(parsed.command, { sequence: null, ...context });
}

describe("every git command is attempted", () => {
  it("no longer refuses object-store maintenance", () => {
    expect(guard("git gc").refusal).toBeNull();
    expect(guard("git repack -ad").refusal).toBeNull();
    expect(guard("git prune").refusal).toBeNull();
  });

  it("no longer refuses remote commands", () => {
    expect(guard("git push origin main").refusal).toBeNull();
    expect(guard("git fetch --all").refusal).toBeNull();
    expect(guard("git pull").refusal).toBeNull();
  });

  it("no longer refuses commands that act on untracked files", () => {
    expect(guard("git add -A").refusal).toBeNull();
    expect(guard("git add .").refusal).toBeNull();
    expect(guard("git add -f local.env").refusal).toBeNull();
    expect(guard("git stash -u").refusal).toBeNull();
    expect(guard("git stash -a").refusal).toBeNull();
    expect(guard("git clean -fd").refusal).toBeNull();
  });

  it("no longer refuses branch switches against untracked or ignored files", () => {
    expect(guard("git checkout feature").refusal).toBeNull();
    expect(guard("git checkout -f feature").refusal).toBeNull();
    expect(guard("git switch -f feature").refusal).toBeNull();
  });

  it("no longer refuses plumbing whose effect lands in Modelled state", () => {
    expect(guard("git update-ref refs/heads/x HEAD").refusal).toBeNull();
    expect(guard("git symbolic-ref HEAD refs/heads/other").refusal).toBeNull();
    expect(guard("git read-tree HEAD").refusal).toBeNull();
    expect(guard("git ls-files").refusal).toBeNull();
    expect(guard("git rev-list --all").refusal).toBeNull();
    expect(guard("git notes add -m hi").refusal).toBeNull();
  });

  it("no longer refuses merge, reset or revert", () => {
    expect(guard("git merge feature").refusal).toBeNull();
    expect(guard("git reset --hard HEAD~1").refusal).toBeNull();
    expect(guard("git revert HEAD").refusal).toBeNull();
  });
});

describe("commands with no unattended result are explained", () => {
  it("refuses add -p and add -i", () => {
    expect(guard("git add -p").refusal?.code).toBe("interactive-add");
    expect(guard("git add -i").refusal?.code).toBe("interactive-add");
  });

  it("refuses add -e because the edit is the command", () => {
    expect(guard("git add -e a.txt").refusal?.code).toBe("interactive-add-edit");
  });

  it("refuses stash -p", () => {
    expect(guard("git stash -p").refusal?.code).toBe("interactive-stash");
  });

  it("refuses patch modes on checkout and reset", () => {
    expect(guard("git checkout -p").refusal?.code).toBe("interactive-patch");
    expect(guard("git reset -p").refusal?.code).toBe("interactive-patch");
  });

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
});

describe("arbitrary execution is refused", () => {
  it("refuses rebase --exec", () => {
    expect(guard("git rebase --exec 'echo hi' HEAD~1").refusal?.code).toBe("rebase-exec");
  });

  it("refuses a cherry-pick that would open an editor", () => {
    expect(guard("git cherry-pick -e abc123").refusal?.code).toBe("sequencer-edit");
  });

  it("refuses rebase --patch", () => {
    expect(guard("git rebase --patch HEAD~2").refusal?.code).toBe("rebase-patch");
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

  it("refuses break", () => {
    const result = guard("git rebase -i HEAD~2", { sequence: "break" });
    expect(result.refusal?.code).toBe("sequence-break");
  });

  it("allows pick, squash, fixup, drop and edit", () => {
    const sequence = ["pick abc123 a", "squash def456 b", "fixup 999999 c", "drop 000000 d", "edit 111111 e"].join("\n");
    expect(guard("git rebase -i HEAD~2", { sequence }).refusal).toBeNull();
  });
});
