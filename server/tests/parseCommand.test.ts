import { describe, expect, it } from "vitest";
import { prepareCommand, tokenize } from "../src/command/parseCommand";
import type { ParsedCommand } from "../src/command/parseCommand";

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

  it("accepts any git subcommand, including ones that were previously refused", () => {
    expect(parse("git push origin main").subcommand).toBe("push");
    expect(parse("git fetch").subcommand).toBe("fetch");
    expect(parse("git gc").subcommand).toBe("gc");
    expect(parse("git repack -ad").subcommand).toBe("repack");
    expect(parse("git config user.name x").subcommand).toBe("config");
    expect(parse("git clean -fd").subcommand).toBe("clean");
    expect(parse("git bisect start").subcommand).toBe("bisect");
    expect(parse("git worktree add x").subcommand).toBe("worktree");
    expect(parse("git update-ref refs/heads/x HEAD").subcommand).toBe("update-ref");
    expect(parse("git fsck").subcommand).toBe("fsck");
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

  it("allows any -c key that does not name a program, and records them", () => {
    const command = parse("git -c user.name=Alice -c diff.colorMoved=zebra status");
    expect(command.configOverrides).toEqual([
      { key: "user.name", value: "Alice" },
      { key: "diff.colorMoved", value: "zebra" }
    ]);
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
