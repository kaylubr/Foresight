import { useCallback, useEffect, useRef, useState } from "react";
import type { RehearsalOutcome, RepoConnectResult, StalenessResult } from "../../../shared/types";
import { api } from "../lib/api";
import { errorMessage } from "../lib/errors";
import type { Activity } from "../lib/status";

export interface RehearsalSession {
  repoPath: string;
  command: string;
  sequence: string;
  outcome: RehearsalOutcome | null;
  staleness: StalenessResult | null;
  browsing: boolean;
  error: string | null;
  copyStatus: "idle" | "copied" | "failed";
  needsSequence: boolean;
  setRepoPath: (path: string) => void;
  setCommand: (command: string) => void;
  setSequence: (sequence: string) => void;
  toggleBrowsing: () => void;
  connect: (path: string) => Promise<void>;
  runPreview: () => Promise<void>;
  copyCommand: () => Promise<void>;
  clearOutcome: () => void;
}

export function useRehearsalSession({
  repo,
  connectTo,
  onActivity,
  onRefreshHealth
}: {
  repo: RepoConnectResult | null;
  connectTo: (path: string) => Promise<RepoConnectResult>;
  onActivity: (activity: Activity | null) => void;
  onRefreshHealth: (force: boolean) => void;
}): RehearsalSession {
  const [repoPath, setRepoPath] = useState("");
  const [command, setCommand] = useState("");
  const [sequence, setSequence] = useState("");
  const [outcome, setOutcome] = useState<RehearsalOutcome | null>(null);
  const [staleness, setStaleness] = useState<StalenessResult | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const copyTimer = useRef<number | null>(null);

  const needsSequence =
    /^\s*git\s+rebase\b/.test(command) && /\s(-i|--interactive)\b/.test(command);

  const toggleBrowsing = useCallback(() => {
    setBrowsing((open) => !open);
  }, []);

  const clearOutcome = useCallback(() => {
    setOutcome(null);
    setStaleness(null);
  }, []);

  const connect = useCallback(
    async (target: string) => {
      setError(null);
      try {
        const result = await connectTo(target);
        setRepoPath(result.path);
        clearOutcome();
        setBrowsing(false);
      } catch (caught) {
        setError(errorMessage(caught));
      }
    },
    [connectTo, clearOutcome]
  );

  const runPreview = useCallback(async () => {
    if (!repo) {
      setError("Connect a repository before rehearsing a command against it.");
      return;
    }
    onActivity("rehearse");
    setError(null);
    setStaleness(null);
    try {
      const result = await api.preview(
        repo.path,
        command,
        needsSequence && sequence.trim().length > 0 ? sequence : null
      );
      setOutcome(result);
      if (
        result.kind === "tool-error" &&
        (result.cause === "sandbox-unavailable" || result.cause === "network-reachable")
      ) {
        onRefreshHealth(true);
      }
      if (result.originSnapshot) {
        setStaleness(await api.staleness(repo.path, result.originSnapshot.state));
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      onActivity(null);
    }
  }, [repo, command, needsSequence, sequence, onActivity, onRefreshHealth]);

  const copyCommand = useCallback(async () => {
    if (!outcome) {
      return;
    }
    try {
      await navigator.clipboard.writeText(outcome.display);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
      return;
    }
    if (copyTimer.current !== null) {
      window.clearTimeout(copyTimer.current);
    }
    copyTimer.current = window.setTimeout(() => setCopyStatus("idle"), 2400);
    if (repo && outcome.originSnapshot) {
      setStaleness(await api.staleness(repo.path, outcome.originSnapshot.state));
    }
  }, [outcome, repo]);

  useEffect(() => {
    setCopyStatus("idle");
  }, [outcome]);

  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) {
        window.clearTimeout(copyTimer.current);
      }
    };
  }, []);

  return {
    repoPath,
    command,
    sequence,
    outcome,
    staleness,
    browsing,
    error,
    copyStatus,
    needsSequence,
    setRepoPath,
    setCommand,
    setSequence,
    toggleBrowsing,
    connect,
    runPreview,
    copyCommand,
    clearOutcome
  };
}
