import type { AliasEntry } from "./config";
import {
  ALLOWED_GLOBAL_FLAGS,
  READ_ONLY_SUBCOMMANDS,
  REFUSED_GLOBAL_OPTIONS,
  configKeyIsAllowed,
  configKeyRefusal
} from "./allowlist";

export interface ParsedCommand {
  argv: string[];
  subcommand: string;
  kind: "read-only" | "mutator";
  subArgs: string[];
  configOverrides: Array<{ key: string; value: string }>;
}

export interface ParseRefusal {
  ok: false;
  code: string;
  reason: string;
  alternative: string | null;
}

export type ParseOutcome = { ok: true; command: ParsedCommand } | ParseRefusal;

function refusal(code: string, reason: string, alternative: string | null): ParseRefusal {
  return { ok: false, code, reason, alternative };
}

const UNQUOTED_METACHARACTERS = new Set([";", "|", "&", ">", "<", "`"]);

export interface TokenizeResult {
  tokens: string[] | null;
  error: string | null;
  code: string;
}

export function tokenize(input: string): TokenizeResult {
  const tokens: string[] = [];
  let current = "";
  let quote: string | null = null;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index] ?? "";
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (UNQUOTED_METACHARACTERS.has(char)) {
      return {
        tokens: null,
        error: `\`${char}\` is shell syntax, and Foresight runs a single git command rather than a shell line`,
        code: "shell-syntax"
      };
    }
    if (char === "$" && (input[index + 1] === "(" || input[index + 1] === "{")) {
      return {
        tokens: null,
        error: "`$(` and `${` are shell substitutions",
        code: "shell-substitution"
      };
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (quote) {
    return { tokens: null, error: "unbalanced quote", code: "tokenize" };
  }
  if (escaped) {
    current += "\\";
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return { tokens, error: null, code: "ok" };
}

function expandAliases(
  tokens: string[],
  aliases: Map<string, AliasEntry>
): { tokens: string[] } | ParseRefusal {
  let current = tokens;
  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = current[1];
    if (!candidate) {
      return { tokens: current };
    }
    const alias = aliases.get(candidate);
    if (!alias) {
      return { tokens: current };
    }
    if (alias.value.trimStart().startsWith("!")) {
      return refusal(
        "shell-alias",
        `\`${candidate}\` is a shell alias, and its expansion runs a command rather than git`,
        null
      );
    }
    const expansion = tokenize(alias.value);
    if (!expansion.tokens) {
      return refusal("alias-unparsable", `alias \`${candidate}\` could not be parsed`, null);
    }
    current = ["git", ...expansion.tokens, ...current.slice(2)];
  }
  return { tokens: current };
}

function readConfigPair(
  pair: string
): { ok: true; key: string; value: string } | ParseRefusal {
  const boundary = pair.indexOf("=");
  if (boundary === -1) {
    return refusal("config-pair", `\`-c ${pair}\` is not a key=value pair`, null);
  }
  const key = pair.slice(0, boundary);
  const value = pair.slice(boundary + 1);
  if (!configKeyIsAllowed(key)) {
    return refusal("config-key", configKeyRefusal(key), "drop the override, or keep it outside Foresight");
  }
  return { ok: true, key, value };
}

export function parseGitArgv(args: string[]): ParseOutcome {
  const configOverrides: Array<{ key: string; value: string }> = [];
  let index = 0;

  while (index < args.length) {
    const token = args[index];
    if (token === undefined) {
      break;
    }
    if (token === "--") {
      index += 1;
      break;
    }
    if (!token.startsWith("-") || token === "-") {
      break;
    }
    if (token === "-c") {
      const pair = args[index + 1];
      if (pair === undefined) {
        return refusal("config-pair", "`-c` needs a key=value pair", null);
      }
      const parsed = readConfigPair(pair);
      if ("ok" in parsed && parsed.ok === false) {
        return parsed;
      }
      if ("key" in parsed) {
        configOverrides.push({ key: parsed.key, value: parsed.value });
      }
      index += 2;
      continue;
    }
    if (token.startsWith("-c") && token.length > 2) {
      const parsed = readConfigPair(token.slice(2));
      if ("ok" in parsed && parsed.ok === false) {
        return parsed;
      }
      if ("key" in parsed) {
        configOverrides.push({ key: parsed.key, value: parsed.value });
      }
      index += 1;
      continue;
    }
    const optionName = token.includes("=") ? token.slice(0, token.indexOf("=")) : token;
    const refusedGlobal = REFUSED_GLOBAL_OPTIONS[optionName];
    if (refusedGlobal) {
      return refusal("global-option", `\`${optionName}\`: ${refusedGlobal}`, null);
    }
    if (ALLOWED_GLOBAL_FLAGS.has(token)) {
      index += 1;
      continue;
    }
    return refusal(
      "unknown-global",
      `\`${token}\` is a global git option Foresight does not support`,
      "drop it and paste the subcommand directly"
    );
  }

  const subcommand = args[index];
  if (subcommand === undefined) {
    return refusal("missing-subcommand", "no git subcommand was given", "for example `git status`");
  }

  return {
    ok: true,
    command: {
      argv: args,
      subcommand,
      kind: READ_ONLY_SUBCOMMANDS.has(subcommand) ? "read-only" : "mutator",
      subArgs: args.slice(index + 1),
      configOverrides
    }
  };
}

export function prepareCommand(input: string, aliases: Map<string, AliasEntry>): ParseOutcome {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return refusal("empty", "no command was given", null);
  }

  const tokenized = tokenize(trimmed);
  if (!tokenized.tokens) {
    return refusal(tokenized.code, tokenized.error ?? "the command could not be parsed", null);
  }

  if (tokenized.tokens[0] !== "git") {
    return refusal(
      "not-git",
      "Foresight only rehearses git commands",
      `start the input with \`git \``
    );
  }

  const expanded = expandAliases(tokenized.tokens, aliases);
  if ("ok" in expanded && expanded.ok === false) {
    return expanded;
  }
  if (!("tokens" in expanded)) {
    return refusal("alias", "the command could not be expanded", null);
  }

  return parseGitArgv(expanded.tokens.slice(1));
}
