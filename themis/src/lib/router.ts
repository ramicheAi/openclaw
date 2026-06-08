// Tiny URL-state hooks. Browser back/forward + bookmarks work for free.
// Replaces the previous useState route in App.tsx.

import { useCallback, useEffect, useState } from "react";

export type AppMode = "worktop" | "brain";
export type WorktopTab = "ask" | "chronology" | "privilege" | "binder" | "documents" | "verify" | "draft" | "damages";
export type GlobalView = "matters" | "audit" | "firm" | "archive";

export interface RouteState {
  matterId: string | null;
  mode: AppMode;
  tab: WorktopTab;
  /** Which global surface is active when no matter is open. */
  view: GlobalView;
}

const DEFAULT_TAB: WorktopTab = "ask";
const DEFAULT_VIEW: GlobalView = "matters";

function parse(): RouteState {
  if (typeof window === "undefined") return { matterId: null, mode: "worktop", tab: DEFAULT_TAB, view: DEFAULT_VIEW };
  const params = new URLSearchParams(window.location.search);
  const matterId = params.get("matter");
  const mode = (params.get("mode") as AppMode) === "brain" ? "brain" : "worktop";
  const tab = (params.get("tab") as WorktopTab) ?? DEFAULT_TAB;
  const viewParam = params.get("view") as GlobalView | null;
  const view: GlobalView = viewParam === "audit" || viewParam === "firm" || viewParam === "archive" ? viewParam : DEFAULT_VIEW;
  return { matterId, mode, tab, view };
}

function write(next: RouteState) {
  const params = new URLSearchParams();
  if (next.matterId) params.set("matter", next.matterId);
  if (next.mode !== "worktop") params.set("mode", next.mode);
  if (next.tab !== DEFAULT_TAB) params.set("tab", next.tab);
  if (!next.matterId && next.view !== DEFAULT_VIEW) params.set("view", next.view);
  const search = params.toString();
  const url = `${window.location.pathname}${search ? "?" + search : ""}`;
  window.history.pushState(null, "", url);
}

export function useRoute(): [RouteState, (patch: Partial<RouteState>) => void] {
  const [state, setState] = useState<RouteState>(parse);

  useEffect(() => {
    const onPop = () => setState(parse());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const update = useCallback(
    (patch: Partial<RouteState>) =>
      setState((prev) => {
        const next = { ...prev, ...patch };
        write(next);
        return next;
      }),
    [],
  );

  return [state, update];
}
