import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Archive, FolderLock, LayoutGrid, ScrollText, Settings } from "lucide-react";
import { BrandMark, Tau } from "./components/BrandMark";
import { cx } from "./lib/ui";
import { useRoute } from "./lib/router";
import { useTheme } from "./lib/theme";
import { MattersDashboard } from "./screens/MattersDashboard";
import { MatterShell } from "./screens/matter/MatterShell";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5_000,
    },
  },
});

const globalNav = [
  { id: "matters", label: "Matters", icon: LayoutGrid },
  { id: "firm", label: "Firm Library", icon: FolderLock, gated: true },
  { id: "audit", label: "Audit Log", icon: ScrollText },
  { id: "archive", label: "Archive", icon: Archive },
];

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Shell />
    </QueryClientProvider>
  );
}

function Shell() {
  const [route, setRoute] = useRoute();
  // Initialize the theme at the root so even the dashboard (which has no
  // MatterShell) gets the BRAIN READY dark mode by default.
  useTheme();
  const inMatter = !!route.matterId;

  return (
    <div className="flex h-full w-full overflow-hidden bg-paper text-ink">
      {!inMatter && (
        <aside className="flex w-[68px] shrink-0 flex-col items-center border-r border-line bg-surface py-4 lg:w-[232px] lg:items-stretch lg:px-4">
          <div className="mb-6 hidden lg:block">
            <BrandMark size="md" />
          </div>
          <div className="mb-6 grid h-9 w-9 place-items-center rounded-lg bg-ink lg:hidden">
            <Tau size={20} tone="ink" />
          </div>

          <nav className="flex flex-col gap-1">
            {globalNav.map((item) => {
              const active = item.id === "matters";
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
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
      )}

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!route.matterId ? (
          <MattersDashboard onOpen={(id) => setRoute({ matterId: id, mode: "worktop", tab: "ask" })} />
        ) : (
          <MatterShell
            matterId={route.matterId}
            mode={route.mode}
            tab={route.tab}
            onMode={(mode) => setRoute({ mode })}
            onTab={(tab) => setRoute({ tab })}
            onBack={() => setRoute({ matterId: null })}
          />
        )}
      </main>
    </div>
  );
}
