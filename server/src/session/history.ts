import { randomUUID } from "node:crypto";
import type { HistoryEntry, RehearsalOutcome } from "../../../shared/types";

const HISTORY_LIMIT = 100;
const entries: HistoryEntry[] = [];

export function recordOutcome(outcome: RehearsalOutcome): void {
  entries.push({
    id: randomUUID(),
    at: Date.now(),
    display: outcome.display,
    kind: outcome.kind
  });
  if (entries.length > HISTORY_LIMIT) {
    entries.splice(0, entries.length - HISTORY_LIMIT);
  }
}

export function listHistory(): HistoryEntry[] {
  return entries;
}
