import { useCallback, useEffect, useState } from "react";
import type { HealthResult, RepoConnectResult } from "../../shared/types";
import Masthead from "./components/masthead/Masthead";
import { api } from "./lib/api";
import { navigate, ROUTE_PATHS, useRoute } from "./lib/route";
import { sessionStatus } from "./lib/status";
import type { Activity } from "./lib/status";
import AboutPage from "./pages/AboutPage";
import GuaranteesPage from "./pages/GuaranteesPage";
import RehearsalPage from "./pages/RehearsalPage";
import RepositoryPage from "./pages/RepositoryPage";
import { useRehearsalSession } from "./pages/useRehearsalSession";

export default function App() {
  const [repo, setRepo] = useState<RepoConnectResult | null>(null);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [healthChecked, setHealthChecked] = useState(false);
  const [activity, setActivity] = useState<Activity | null>(null);
  const route = useRoute();

  const busy = activity !== null;

  const refreshHealth = useCallback(async (force: boolean) => {
    try {
      setHealth(force ? await api.probe() : await api.health());
    } catch {
      setHealth(null);
    } finally {
      setHealthChecked(true);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      await refreshHealth(false);
    };
    void load();
  }, [refreshHealth]);

  useEffect(() => {
    const recheck = () => {
      void refreshHealth(true);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        recheck();
      }
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshHealth]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  const connectTo = useCallback(async (target: string) => {
    setActivity("connect");
    try {
      const result = await api.connect(target);
      setRepo(result);
      return result;
    } finally {
      setActivity(null);
    }
  }, []);

  const refreshState = useCallback(async () => {
    if (!repo) {
      return;
    }
    setActivity("refresh");
    try {
      setRepo(await api.connect(repo.path));
    } finally {
      setActivity(null);
    }
  }, [repo]);

  const session = useRehearsalSession({
    repo,
    connectTo,
    onActivity: setActivity,
    onRefreshHealth: refreshHealth
  });

  const { clearOutcome } = session;

  const disconnectRepo = useCallback(() => {
    setRepo(null);
    clearOutcome();
    navigate(ROUTE_PATHS.rehearsal);
  }, [clearOutcome]);

  const status = sessionStatus(activity, healthChecked, health);

  return (
    <div className={route === "rehearsal" ? "page rehearsal" : "page"}>
      <Masthead repo={repo} route={route} status={status} />

      {route === "about" ? (
        <AboutPage />
      ) : route === "repository" ? (
        <RepositoryPage
          repo={repo}
          busy={busy}
          onReload={() => void refreshState()}
          onDisconnect={disconnectRepo}
        />
      ) : route === "guarantees" ? (
        <GuaranteesPage />
      ) : (
        <RehearsalPage repo={repo} busy={busy} session={session} onRefresh={refreshState} />
      )}
    </div>
  );
}
