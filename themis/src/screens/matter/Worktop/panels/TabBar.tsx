import { cx } from "../../../../lib/ui";
import type { WorktopTab } from "../../../../lib/router";

const TABS: { id: WorktopTab; n: number; label: string }[] = [
  { id: "ask", n: 1, label: "Ask Themis" },
  { id: "chronology", n: 2, label: "Chronology" },
  { id: "privilege", n: 3, label: "Privilege" },
  { id: "binder", n: 4, label: "Binder" },
  { id: "documents", n: 5, label: "Documents" },
  { id: "verify", n: 6, label: "Cite Check" },
  { id: "draft", n: 7, label: "Draft" },
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
    <div className="relative flex h-14 shrink-0 items-center border-b border-line bg-surface px-4">
      <nav className="flex items-center gap-1">
        {TABS.map((t) => {
          const isActive = t.id === active;
          const badge = badges[t.id];
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={cx(
                "group relative flex items-center gap-2 px-3 py-2 text-[13px] font-medium transition",
                isActive ? "text-brass-deep" : "text-ink-soft hover:text-ink",
              )}
            >
              <span className="font-mono text-[10px] text-ink-faint">{t.n}</span>
              <span>{t.label}</span>
              {badge && badge > 0 && (
                <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-flag px-1 font-mono text-[9.5px] font-semibold text-paper">
                  {badge}
                </span>
              )}
              {isActive && (
                <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-t bg-brass" />
              )}
            </button>
          );
        })}
      </nav>
      <div className="ml-auto hidden font-mono text-[10px] uppercase tracking-wider text-ink-faint md:block">
        <kbd className="rounded border border-line bg-surface-sunken px-1.5 py-0.5 text-ink-soft">⌘K</kbd> commands ·{" "}
        <kbd className="rounded border border-line bg-surface-sunken px-1.5 py-0.5 text-ink-soft">⌘1-5</kbd> tabs
      </div>
    </div>
  );
}
