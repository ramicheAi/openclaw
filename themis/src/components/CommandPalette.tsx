// Cmd+K command palette. Per design handoff §5.6.

import { Command } from "cmdk";
import { useEffect } from "react";
import {
  IconAdd,
  IconArrow,
  IconAsk,
  IconBinder,
  IconBrain,
  IconChron,
  IconClose,
  IconExport,
  IconPrivileged,
  IconReplay,
} from "../icons";
import type { AppMode, WorktopTab } from "../lib/router";
import type { DocItem, Entity } from "../types";

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  matterId: string | null;
  mode: AppMode;
  documents: DocItem[];
  entities: Entity[];
  onTab: (t: WorktopTab) => void;
  onMode: (m: AppMode) => void;
  onToggleTheme: () => void;
  onOpenDoc: (docId: string) => void;
  onAsk: (q: string) => void;
  onCiteCheck?: () => void;
}

const CANNED_QUESTIONS = [
  "What's the timeline between the wage complaint and termination?",
  "Show our strongest evidence of retaliatory motive.",
  "Who is in-house counsel and what did they advise?",
];

export function CommandPalette({
  open,
  onClose,
  matterId,
  mode,
  documents,
  entities,
  onTab,
  onMode,
  onToggleTheme,
  onOpenDoc,
  onAsk,
  onCiteCheck,
}: CommandPaletteProps) {
  // Auto-close on route change is the caller's job; we close on selection.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function run(fn: () => void) {
    fn();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-start pt-[14vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" />
      <div
        className="relative mx-auto w-[640px] max-w-[92vw] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Command palette" className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <span className="rounded border border-brass-soft bg-brass-wash px-1.5 py-0.5 font-mono text-[10px] font-semibold text-brass-deep">
              ⌘K
            </span>
            <Command.Input
              autoFocus
              placeholder="Jump · run · ask…"
              className="flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
            />
            <kbd className="rounded border border-line bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">
              esc
            </kbd>
          </div>
          <Command.List className="max-h-[58vh] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-[12px] text-ink-faint">
              Nothing matches.
            </Command.Empty>

            {matterId && (
              <>
                <Command.Group heading="Navigate">
                  <Item icon={<IconAsk size={14} />} onSelect={() => run(() => onTab("ask"))} shortcut="⌘1">
                    Ask Themis
                  </Item>
                  <Item icon={<IconChron size={14} />} onSelect={() => run(() => onTab("chronology"))} shortcut="⌘2">
                    Chronology
                  </Item>
                  <Item icon={<IconPrivileged size={14} />} onSelect={() => run(() => onTab("privilege"))} shortcut="⌘3">
                    Privilege
                  </Item>
                  <Item icon={<IconBinder size={14} />} onSelect={() => run(() => onTab("binder"))} shortcut="⌘4">
                    Binder
                  </Item>
                  <Item icon={<IconArrow size={14} />} onSelect={() => run(() => onTab("documents"))} shortcut="⌘5">
                    Documents
                  </Item>
                </Command.Group>

                <Command.Group heading="Mode">
                  <Item
                    icon={<IconBrain size={14} />}
                    onSelect={() => run(() => onMode(mode === "brain" ? "worktop" : "brain"))}
                  >
                    Switch to {mode === "brain" ? "Worktop" : "Case Brain"}
                  </Item>
                  <Item icon={<IconReplay size={14} />} onSelect={() => run(onToggleTheme)} shortcut="⌘D">
                    Toggle theme
                  </Item>
                </Command.Group>

                <Command.Group heading="Actions · output">
                  <Item icon={<IconExport size={14} />} onSelect={() => run(() => onTab("chronology"))}>
                    Generate chronology PDF
                  </Item>
                  <Item icon={<IconExport size={14} />} onSelect={() => run(() => onTab("privilege"))}>
                    Generate privilege log
                  </Item>
                  <Item icon={<IconAdd size={14} />} onSelect={() => run(() => onTab("binder"))}>
                    New binder
                  </Item>
                  {onCiteCheck && (
                    <Item
                      icon={<IconAsk size={14} />}
                      onSelect={() => run(onCiteCheck)}
                      shortcut="⌘⇧V"
                    >
                      Cite-check a draft
                    </Item>
                  )}
                </Command.Group>

                <Command.Group heading="Ask Themis">
                  {CANNED_QUESTIONS.map((q) => (
                    <Item
                      key={q}
                      icon={<IconAsk size={14} />}
                      onSelect={() => run(() => {
                        onTab("ask");
                        onAsk(q);
                      })}
                    >
                      {q}
                    </Item>
                  ))}
                </Command.Group>

                {documents.length > 0 && (
                  <Command.Group heading="Open document">
                    {documents.slice(0, 30).map((d) => (
                      <Item
                        key={d.id}
                        icon={<IconArrow size={14} />}
                        detail={`${d.date} · ${d.author}`}
                        onSelect={() => run(() => onOpenDoc(d.id))}
                      >
                        <span className="font-mono text-[11px] text-brass">{d.bates}</span>
                        <span className="ml-2">{d.title}</span>
                      </Item>
                    ))}
                  </Command.Group>
                )}

                {entities.length > 0 && (
                  <Command.Group heading="Entities">
                    {entities.slice(0, 12).map((e) => (
                      <Item
                        key={e.id}
                        icon={<IconArrow size={14} />}
                        detail={e.role}
                        onSelect={() => run(() => onTab("documents"))}
                      >
                        Show {e.name}'s dossier
                      </Item>
                    ))}
                  </Command.Group>
                )}
              </>
            )}

            {!matterId && (
              <Command.Group heading="Navigate">
                <Item icon={<IconArrow size={14} />} onSelect={() => run(onClose)}>
                  Back to matters dashboard
                </Item>
              </Command.Group>
            )}

            <Command.Group heading="Window">
              <Item icon={<IconClose size={14} />} onSelect={() => run(onClose)} shortcut="esc">
                Close palette
              </Item>
            </Command.Group>
          </Command.List>
          <div className="border-t border-line bg-surface-sunken px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
            <kbd className="rounded border border-line bg-surface px-1.5 py-0.5">↑↓</kbd> navigate ·{" "}
            <kbd className="rounded border border-line bg-surface px-1.5 py-0.5">↵</kbd> run ·{" "}
            <kbd className="rounded border border-line bg-surface px-1.5 py-0.5">esc</kbd> close
          </div>
        </Command>
      </div>
    </div>
  );
}

function Item({
  icon,
  children,
  onSelect,
  shortcut,
  detail,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onSelect: () => void;
  shortcut?: string;
  detail?: string;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-ink-soft aria-selected:bg-brass-wash aria-selected:text-brass-deep"
    >
      <span className="text-brass">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {detail && <span className="font-mono text-[10px] text-ink-faint">{detail}</span>}
      {shortcut && (
        <kbd className="rounded border border-line bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">
          {shortcut}
        </kbd>
      )}
    </Command.Item>
  );
}
