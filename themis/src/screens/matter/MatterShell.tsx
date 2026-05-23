import {
  CalendarClock,
  ChevronLeft,
  FileText,
  LayoutDashboard,
  MessagesSquare,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";
import { cx } from "../../lib/ui";
import type { MatterSummary } from "../../types";
import { Overview } from "./Overview";
import { Documents } from "./Documents";
import { Chat } from "./Chat";
import { Chronology } from "./Chronology";
import { Entities } from "./Entities";
import { Privilege } from "./Privilege";

export type MatterTab =
  | "overview"
  | "documents"
  | "chat"
  | "chronology"
  | "entities"
  | "privilege";

const tabs: { id: MatterTab; label: string; icon: typeof FileText; badge?: (m: MatterSummary) => number }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "chat", label: "Ask Themis", icon: MessagesSquare },
  { id: "chronology", label: "Chronology", icon: CalendarClock },
  { id: "entities", label: "Cast", icon: Users },
  {
    id: "privilege",
    label: "Privilege",
    icon: ShieldAlert,
    badge: (m) => m.privilegeQueue,
  },
];

export function MatterShell({
  matter,
  tab,
  onTab,
  onBack,
}: {
  matter: MatterSummary;
  tab: MatterTab;
  onTab: (t: MatterTab) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-line bg-surface">
        <div className="flex items-center gap-3 px-6 pt-4">
          <button
            onClick={onBack}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink"
            title="Back to matters"
          >
            <ChevronLeft size={19} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-display truncate text-xl font-semibold text-ink">
                {matter.name}
              </h1>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-verify/25 bg-verify-wash px-2 py-0.5 text-[11px] font-medium text-verify">
                <span className="h-1.5 w-1.5 rounded-full bg-verify" />
                Brain ready
              </span>
            </div>
            <div className="truncate text-[12px] text-ink-faint">
              {matter.matterType} · {matter.client} · {matter.docs.toLocaleString()} docs ·
              isolated case brain
            </div>
          </div>

          <div className="ml-auto hidden items-center gap-2 rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink-faint lg:flex">
            <Search size={15} />
            <span>Search this matter</span>
            <kbd className="rounded border border-line-strong bg-surface px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">
              /
            </kbd>
          </div>
        </div>

        <nav className="flex gap-1 px-5 pt-3">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = t.id === tab;
            const badge = t.badge?.(matter) ?? 0;
            return (
              <button
                key={t.id}
                onClick={() => onTab(t.id)}
                className={cx(
                  "relative flex items-center gap-2 rounded-t-lg px-3.5 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "text-ink"
                    : "text-ink-soft hover:text-ink",
                )}
              >
                <Icon size={16} strokeWidth={2} />
                {t.label}
                {badge > 0 && (
                  <span className="rounded-full bg-flag-wash px-1.5 py-0.5 text-[10px] font-semibold text-flag">
                    {badge}
                  </span>
                )}
                {active && (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brass" />
                )}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "overview" && <Overview onTab={onTab} />}
        {tab === "documents" && <Documents />}
        {tab === "chat" && <Chat />}
        {tab === "chronology" && <Chronology />}
        {tab === "entities" && <Entities />}
        {tab === "privilege" && <Privilege />}
      </div>
    </div>
  );
}
