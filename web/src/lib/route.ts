import { useEffect, useState } from "react";

export type Route = "workbench" | "repository" | "guarantees" | "about";

export const ROUTE_PATHS: Record<Route, string> = {
  workbench: "/",
  repository: "/repository",
  guarantees: "/guarantees",
  about: "/about"
};

function parse(pathname: string): Route {
  const path = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (path === ROUTE_PATHS.guarantees) {
    return "guarantees";
  }
  if (path === ROUTE_PATHS.repository) {
    return "repository";
  }
  return path === ROUTE_PATHS.about ? "about" : "workbench";
}

export function navigate(path: string): void {
  if (window.location.pathname === path) {
    return;
  }
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.pathname));

  useEffect(() => {
    const onPopState = () => {
      setRoute(parse(window.location.pathname));
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  return route;
}
