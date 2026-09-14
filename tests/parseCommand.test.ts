import { describe, expect, it } from "vitest";
import { prepareCommand, tokenize } from "../src/server/parseCommand";
import type { ParsedCommand } from "../src/server/parseCommand";

const noAliases = new Map();

function parse(input: string): ParsedCommand {
  const result = prepareCommand(input, noAliases);
  if (!result.ok) {
    throw new Error(`expected a parsed command, got refusal ${result.code}`);
  }
  return result.command;
}

function refusalCode(input: string): string {
  const result = prepareCommand(input, noAliases);
  if (result.ok) {
    throw new Error("expected a refusal");
  }
  return result.code;
}

describe("tokenize", () => {
  it("splits on whitespace", () => {
    expect(tokenize("git log --oneline").tokens).toEqual(["git", "log", "--oneline"]);
  });

  it("keeps quoted arguments together", () => {
    expect(tokenize('git commit -m "a b"').tokens).toEqual(["git", "commit", "-m", "a b"]);
  });

  it("rejects unquoted shell operators", () => {
    const result = tokenize("git log; rm -rf /");
    expect(result.tokens).toBeNull();
    expect(result.code).toBe("shell-syntax");
  });

  it("rejects an attached shell operator", () => {
    expect(tokenize("git commit; rm -rf /").code).toBe("shell-syntax");
  });

  it("allows shell operators inside quotes", () => {
    expect(tokenize('git commit -m "a; b > c"').tokens).toEqual(["git", "commit", "-m", "a; b > c"]);
  });

  it("rejects command substitution", () => {
    expect(tokenize("git log $(whoami)").code).toBe("shell-substitution");
  });

  it("rejects an unbalanced quote", () => {
    expect(tokenize('git commit -m "oops').code).toBe("tokenize");
  });
});

describe("prepareCommand", () => {
  it("requires a git command", () => {
    expect(refusalCode("ls -la")).toBe("not-git");
  });

  it("refuses remote-touching commands", () => {
    expect(refusalCode("git push origin main")).toBe("refused-push");
    expect(refusalCode("git fetch")).toBe("refused-fetch");
  });

  it("refuses object-store maintenance", () => {
    expect(refusalCode("git gc")).toBe("refused-gc");
    expect(refusalCode("git repack -ad")).toBe("refused-repack");
    expect(refusalCode("git config user.name x")).toBe("refused-config");
  });

  it("refuses commands outside the allowlist", () => {
    expect(refusalCode("git clean -fd")).toBe("refused-clean");
    expect(refusalCode("git bisect start")).toBe("refused-bisect");
    expect(refusalCode("git worktree add x")).toBe("refused-worktree");
  });

  it("allows read-only and porcelain commands", () => {
    expect(parse("git log --oneline -5").subcommand).toBe("log");
    expect(parse("git commit -m 'x'").subcommand).toBe("commit");
    expect(parse("git status").kind).toBe("read-only");
  });

  it("refuses -c keys that name a program", () => {
    expect(refusalCode("git -c core.editor=vim status")).toBe("config-key");
    expect(refusalCode("git -c core.hooksPath=/tmp status")).toBe("config-key");
    expect(refusalCode("git -c filter.x.clean=rm status")).toBe("config-key");
  });

  it("allows data-only -c keys and records them", () => {
    const command = parse("git -c user.name=Alice status");
    expect(command.configOverrides).toEqual([{ key: "user.name", value: "Alice" }]);
  });

  it("refuses global options that would escape the mirror", () => {
    expect(refusalCode("git -C /elsewhere status")).toBe("global-option");
    expect(refusalCode("git --git-dir=/tmp/other status")).toBe("global-option");
  });

  it("refuses unknown global options", () => {
    expect(refusalCode("git --frobnicate status")).toBe("unknown-global");
  });

  it("expands a plain alias", () => {
    const aliases = new Map([["st", { name: "st", value: "status --short" }]]);
    const result = prepareCommand("git st", aliases);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.subcommand).toBe("status");
      expect(result.command.argv).toEqual(["status", "--short"]);
    }
  });

  it("refuses a shell alias", () => {
    const aliases = new Map([["boom", { name: "boom", value: "!rm -rf /" }]]);
    const result = prepareCommand("git boom", aliases);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("shell-alias");
    }
  });
});
