import { useEffect, useState } from "react";
import type { MouseEvent, ReactNode } from "react";

export type Route = "workbench" | "repository" | "guarantees";

export const ROUTE_PATHS: Record<Route, string> = {
  workbench: "/",
  repository: "/repository",
  guarantees: "/guarantees"
};

function parse(pathname: string): Route {
  const path = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (path === ROUTE_PATHS.guarantees) {
    return "guarantees";
  }
  return path === ROUTE_PATHS.repository ? "repository" : "workbench";
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

export function PageLink({
  to,
  current = false,
  className,
  children
}: {
  to: string;
  current?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    navigate(to);
  };

  return (
    <a href={to} className={className} aria-current={current ? "page" : undefined} onClick={onClick}>
      {children}
    </a>
  );
}
