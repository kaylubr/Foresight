import type { HealthResult } from "../../../shared/types";

export type Activity = "connect" | "refresh" | "rehearse";

export interface SessionStatus {
  tone: "ready" | "busy" | "blocked";
  word: string;
  display: "dot" | "spinner" | "word";
  detail: string | null;
}

export function sessionStatus(
  activity: Activity | null,
  healthChecked: boolean,
  health: HealthResult | null
): SessionStatus {
  if (activity === "connect") {
    return { tone: "busy", word: "Connecting", display: "spinner", detail: null };
  }
  if (activity === "refresh") {
    return { tone: "busy", word: "Refreshing", display: "spinner", detail: null };
  }
  if (activity === "rehearse") {
    return { tone: "busy", word: "Rehearsing", display: "spinner", detail: null };
  }
  if (!healthChecked) {
    return { tone: "busy", word: "Checking", display: "spinner", detail: null };
  }
  if (health === null) {
    return {
      tone: "blocked",
      word: "Blocked",
      display: "word",
      detail:
        "Foresight could not reach its own API, so it cannot confirm whether rehearsals can run."
    };
  }
  if (!health.sandbox.ok) {
    return {
      tone: "blocked",
      word: "Blocked",
      display: "word",
      detail:
        [health.sandbox.reason, health.sandbox.nextStep].filter(Boolean).join(" ") ||
        "The network-isolation sandbox could not be confirmed."
    };
  }
  return { tone: "ready", word: "Ready", display: "dot", detail: null };
}
