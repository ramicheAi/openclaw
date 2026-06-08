import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Archive, FolderLock, LayoutGrid, ScrollText, Settings } from "lucide-react";
import { BrandMark, Tau } from "./components/BrandMark";
import { cx } from "./lib/ui";
import { useRoute, type GlobalView } from "./lib/router";
import { useTheme } from "./lib/theme";
import { MattersDashboard } from "./screens/MattersDashboard";
import { MatterShell } from "./screens/matter/MatterShell";
import { SharedMatterView } from "./screens/SharedMatterView";
import { LoginScreen } from "./screens/LoginScreen";
import { FirmAuditScreen } from "./screens/FirmAuditScreen";
import { SettingsModal } from "./components/SettingsModal";
import { AuthProvider, useAuth } from "./lib/auth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5_000,
    },
  },
});

// Each nav entry. `view: null` means the item is coming soon — the click
// opens a tooltip-style explanation instead of routing.
interface NavItem {
  id: string;
  label: string;
  icon: typeof LayoutGrid;
  view: GlobalView | null;
  soon?: string;
}
const globalNav: NavItem[] = [
  { id: "matters", label: "Matters", icon: LayoutGrid, view: "matters" },
  {
    id: "firm",
    label: "Firm Library",
    icon: FolderLock,
    view: null,
    soon: "Firm-wide motion + brief templates, shared expert/depo questions, model contracts. Coming in v0.3.",
  },
  { id: "audit", label: "Audit Log", icon: ScrollText, view: "audit" },
  {
    id: "archive",
    label: "Archive",
    icon: Archive,
    view: null,
    soon: "Closed matters live here — hash chain preserved, but excluded from the active dashboard. Coming in v0.3.",
  },
];

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function Shell() {
  const [route, setRoute] = useRoute();
  const auth = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Initialize the theme at the root so even the dashboard (which has no
  // MatterShell) gets the BRAIN READY dark mode by default.
  useTheme();

  // Tokenized read-only view: /share/<token>. Stand-alone — no global nav,
  // no matter selector, no dashboard chrome. The token is the entire auth
  // surface; the server-side resolver enforces revocation + expiry.
  const sharePath = typeof window !== "undefined" ? window.location.pathname.match(/^\/share\/([A-Za-z0-9_-]{8,})/) : null;
  if (sharePath) {
    return <SharedMatterView token={sharePath[1]} />;
  }

  // Auth gate: while we're checking the session, show nothing (avoids a
  // login-flash for users who already have a cookie). Once ready, if we're
  // in multi-tenant mode with no user, show the login screen.
  if (!auth.ready) return null;
  if (auth.mode === "multi-tenant" && !auth.user) {
    return <LoginScreen />;
  }

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
              const active = item.view === route.view;
              const Icon = item.icon;
              const onClick = () => {
                if (item.soon) {
                  window.alert(`${item.label} — ${item.soon}`);
                  return;
                }
                if (item.view) setRoute({ matterId: null, view: item.view });
              };
              return (
                <button
                  key={item.id}
                  onClick={onClick}
                  className={cx(
                    "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors lg:justify-start",
                    "justify-center",
                    active
                      ? "bg-brass-wash text-brass-deep"
                      : item.soon
                        ? "text-ink-faint hover:bg-surface-sunken hover:text-ink-soft"
                        : "text-ink-soft hover:bg-surface-sunken hover:text-ink",
                  )}
                  title={item.soon ? `${item.label} — coming soon` : item.label}
                >
                  <Icon size={18} strokeWidth={2} />
                  <span className="hidden lg:inline">{item.label}</span>
                  {item.soon && (
                    <span className="ml-auto hidden rounded bg-surface-sunken px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-faint lg:inline">
                      Soon
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto hidden lg:block">
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-ink-soft hover:bg-surface-sunken hover:text-ink"
            >
              <Settings size={18} />
              <span>Settings</span>
            </button>
          </div>
        </aside>
      )}

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!route.matterId ? (
          route.view === "audit" ? (
            <FirmAuditScreen
              onOpenMatter={(id) => setRoute({ matterId: id, mode: "worktop", tab: "ask", view: "matters" })}
            />
          ) : (
            <MattersDashboard onOpen={(id) => setRoute({ matterId: id, mode: "worktop", tab: "ask", view: "matters" })} />
          )
        ) : (
          <MatterShell
            matterId={route.matterId}
            mode={route.mode}
            tab={route.tab}
            onMode={(mode) => setRoute({ mode })}
            onTab={(tab) => setRoute({ tab })}
            onBack={() => setRoute({ matterId: null, view: "matters" })}
          />
        )}
      </main>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
