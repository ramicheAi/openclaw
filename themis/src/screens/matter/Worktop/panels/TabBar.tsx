import { cx } from "../../../../lib/ui";
import { IconAsk, IconChron, IconPrivileged, IconBinder, IconDoc, IconCite, IconExport, IconScales, IconVerified, IconCmdK } from "../../../../icons";
import type { WorktopTab } from "../../../../lib/router";
import type { JSX } from "react";

// Tabs use short labels + a leading glyph so 8 of them fit on a 14-inch screen
// without wrapping. Glyph is the same icon that appears in the command palette
// and entity dossier surfaces, so visual identity stays consistent.
const TABS: { id: WorktopTab; n: number; label: string; icon: (p: { size?: number; className?: string }) => JSX.Element }[] = [
  { id: "ask", n: 1, label: "Ask", icon: IconAsk },
  { id: "chronology", n: 2, label: "Chronology", icon: IconChron },
  { id: "privilege", n: 3, label: "Privilege", icon: IconPrivileged },
  { id: "binder", n: 4, label: "Binder", icon: IconBinder },
  { id: "documents", n: 5, label: "Docs", icon: IconDoc },
  { id: "verify", n: 6, label: "Cite Check", icon: IconCite },
  { id: "draft", n: 7, label: "Draft", icon: IconExport },
  { id: "damages", n: 8, label: "Damages", icon: IconScales },
  { id: "perm", n: 9, label: "PERM", icon: IconVerified },
];

export function TabBar({
  active,
  onChange,
  badges = {},
}: {
  active: WorktopTab;
  onChange: (t: WorktopTab) => void;
  badges?: Partial<Record<WorktopTab, number>>;
}) {
  return (
    <div className="relative flex h-12 shrink-0 items-center border-b border-line bg-surface px-3">
      <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {TABS.map((t) => {
          const isActive = t.id === active;
          const badge = badges[t.id];
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={cx(
                "group relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition",
                isActive
                  ? "bg-brass-wash text-brass-deep"
                  : "text-ink-soft hover:bg-surface-sunken hover:text-ink",
              )}
              title={`${t.label} (⌘${t.n})`}
            >
              <Icon size={13} className={isActive ? "text-brass" : "text-ink-faint group-hover:text-brass-deep"} />
              <span>{t.label}</span>
              <span className={cx("font-mono text-[9.5px]", isActive ? "text-brass-deep/70" : "text-ink-faint")}>
                ⌘{t.n}
              </span>
              {badge && badge > 0 && (
                <span className="ml-0.5 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-flag px-1 font-mono text-[9px] font-semibold text-paper">
                  {badge}
                </span>
              )}
              {isActive && (
                <span className="absolute inset-x-2 -bottom-[5px] h-0.5 rounded-t bg-brass" />
              )}
            </button>
          );
        })}
      </nav>
      <div className="ml-3 hidden shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-ink-faint lg:flex">
        <IconCmdK size={11} className="text-brass" />
        <kbd className="rounded border border-line bg-surface-sunken px-1 py-0.5 text-ink-soft">⌘K</kbd>
        <span>commands</span>
      </div>
    </div>
  );
}
