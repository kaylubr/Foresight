import { useEffect, useState } from "react";

export type Route = "workbench" | "guarantees";

export const ROUTE_PATHS: Record<Route, string> = {
  workbench: "#/",
  guarantees: "#/guarantees"
};

function parse(hash: string): Route {
  return hash === ROUTE_PATHS.guarantees ? "guarantees" : "workbench";
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parse(window.location.hash));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  return route;
}
