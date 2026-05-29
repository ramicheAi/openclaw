// Global keyboard shortcut hook. Per design handoff §6.

import { useEffect } from "react";

export interface ShortcutMap {
  onCmdK?: () => void;
  onSlash?: () => void;
  onCmdD?: () => void;
  onTab?: (n: 1 | 2 | 3 | 4 | 5) => void;
  onAccept?: () => void;
  onReject?: () => void;
  onNextDoc?: () => void;
  onPrevDoc?: () => void;
  onEscape?: () => void;
}

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return false;
}

export function useGlobalShortcuts(map: ShortcutMap) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const cmd = e.metaKey || e.ctrlKey;
      const inField = isTextField(e.target);

      if (cmd && e.key === "k") {
        e.preventDefault();
        map.onCmdK?.();
        return;
      }
      if (!cmd && e.key === "/" && !inField) {
        e.preventDefault();
        map.onSlash?.();
        return;
      }
      if (cmd && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        map.onCmdD?.();
        return;
      }
      if (cmd && /^[1-5]$/.test(e.key)) {
        e.preventDefault();
        map.onTab?.(Number(e.key) as 1 | 2 | 3 | 4 | 5);
        return;
      }
      if (e.key === "Escape") {
        map.onEscape?.();
        return;
      }
      if (inField) return;
      if (e.key === "a" || e.key === "A") {
        map.onAccept?.();
        return;
      }
      if (e.key === "r" || e.key === "R") {
        map.onReject?.();
        return;
      }
      if (e.key === "j" || e.key === "J") {
        map.onNextDoc?.();
        return;
      }
      if (e.key === "k" || e.key === "K") {
        map.onPrevDoc?.();
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [map]);
}
