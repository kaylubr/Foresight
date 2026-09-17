import type {
  HealthResult,
  ModelledState,
  RehearsalOutcome,
  RepoConnectResult,
  StalenessResult,
  ToolErrorCause
} from "../../shared/types";

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message = (payload as { error?: string }).error ?? "request failed";
    throw new Error(message);
  }
  return payload as T;
}

export const api = {
  health: async (): Promise<HealthResult> => {
    const response = await fetch("/api/health");
    return (await response.json()) as HealthResult;
  },
  probe: (): Promise<HealthResult> => post<HealthResult>("/api/probe", {}),
  connect: (path: string): Promise<RepoConnectResult> => post<RepoConnectResult>("/api/connect", { path }),
  preview: (path: string, command: string, sequence: string | null): Promise<RehearsalOutcome> =>
    post<RehearsalOutcome>("/api/preview", { path, command, sequence }),
  staleness: (path: string, snapshot: ModelledState): Promise<StalenessResult> =>
    post<StalenessResult>("/api/staleness", { path, snapshot })
};

export const TOOL_ERROR_LABELS: Record<ToolErrorCause, string> = {
  "clone-failed": "The rehearsal clone could not be created",
  "mirror-failed": "Mirroring your repository's state failed",
  "sandbox-unavailable": "The network-isolation sandbox is unavailable",
  "network-reachable": "The network is reachable from inside the sandbox",
  timeout: "The command ran past the time limit",
  "output-capped": "The command produced more output than Foresight buffers"
};
