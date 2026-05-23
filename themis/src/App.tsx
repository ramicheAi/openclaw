import { useState } from "react";
import {
  Archive,
  FolderLock,
  LayoutGrid,
  ScrollText,
  Settings,
} from "lucide-react";
import { BrandMark } from "./components/BrandMark";
import { cx } from "./lib/ui";
import { MattersDashboard } from "./screens/MattersDashboard";
import { MatterShell, type MatterTab } from "./screens/matter/MatterShell";
import { matters } from "./data/mock";

type Route =
  | { name: "dashboard" }
  | { name: "matter"; id: string; tab: MatterTab };

const globalNav = [
  { id: "matters", label: "Matters", icon: LayoutGrid },
  { id: "firm", label: "Firm Library", icon: FolderLock, gated: true },
  { id: "audit", label: "Audit Log", icon: ScrollText },
  { id: "archive", label: "Archive", icon: Archive },
];

export function App() {
  const [route, setRoute] = useState<Route>({ name: "dashboard" });
  const matter = route.name === "matter" ? matters.find((m) => m.id === route.id) : undefined;

  return (
    <div className="flex h-full w-full overflow-hidden bg-paper text-ink">
      {/* Global rail */}
      <aside className="flex w-[68px] shrink-0 flex-col items-center border-r border-line bg-surface py-4 lg:w-[232px] lg:items-stretch lg:px-4">
        <div className="mb-6 hidden lg:block">
          <BrandMark />
        </div>
        <div className="mb-6 grid h-9 w-9 place-items-center rounded-lg bg-ink text-brass-soft lg:hidden">
          <ScrollText size={18} />
        </div>

        <nav className="flex flex-col gap-1">
          {globalNav.map((item) => {
            const active = item.id === "matters" && route.name !== "matter" ? true : false;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => item.id === "matters" && setRoute({ name: "dashboard" })}
                className={cx(
                  "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors lg:justify-start",
                  "justify-center",
                  active
                    ? "bg-brass-wash text-brass-deep"
                    : "text-ink-soft hover:bg-surface-sunken hover:text-ink",
                )}
                title={item.label}
              >
                <Icon size={18} strokeWidth={2} />
                <span className="hidden lg:inline">{item.label}</span>
                {item.gated && (
                  <span className="ml-auto hidden rounded bg-surface-sunken px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-faint lg:inline">
                    Walled
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto hidden lg:block">
          <button className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-ink-soft hover:bg-surface-sunken">
            <Settings size={18} />
            <span>Settings</span>
          </button>
          <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-line bg-surface-sunken px-2.5 py-2">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-ink text-xs font-semibold text-paper">
              DO
            </div>
            <div className="leading-tight">
              <div className="text-[13px] font-semibold text-ink">D. Okafor</div>
              <div className="text-[11px] text-ink-faint">Hartwell Litigation</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {route.name === "dashboard" || !matter ? (
          <MattersDashboard onOpen={(id) => setRoute({ name: "matter", id, tab: "overview" })} />
        ) : (
          <MatterShell
            matter={matter}
            tab={route.tab}
            onTab={(tab) => setRoute({ name: "matter", id: matter.id, tab })}
            onBack={() => setRoute({ name: "dashboard" })}
          />
        )}
      </main>
    </div>
  );
}
