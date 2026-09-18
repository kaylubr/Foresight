export const STATUS_WORDS: Record<string, string> = {
  M: "modified",
  A: "added",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "type changed",
  U: "unmerged",
  "?": "untracked",
  ".": "unchanged"
};

export const STATUS_LEGEND =
  "The letter is git's porcelain status for that path. M modified, A added, D deleted, T type changed, U unmerged.";

export function statusWord(code: string): string | null {
  return STATUS_WORDS[code] ?? null;
}
