// Global settings modal — theme, keyboard shortcuts, account info, sign
// out. Reachable from the bottom-left Settings nav item on the dashboard
// and from the user pill in the matter top bar.

import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { cx } from "../lib/ui";
import { IconClose } from "../icons";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const auth = useAuth();
  const [theme, toggleTheme] = useTheme();
  const [signing, setSigning] = useState(false);

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-6 py-10">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-[560px] max-w-full flex-col overflow-hidden rounded-[12px] border border-line bg-surface shadow-[0_40px_120px_rgba(0,0,0,0.45)]"
      >
        <header className="flex items-start justify-between border-b border-line bg-surface-sunken px-5 py-4">
          <div>
            <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
              Settings
            </div>
            <h3 className="mt-0.5 font-display text-[17px] font-semibold leading-tight text-ink">Preferences</h3>
          </div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-ink-soft hover:bg-surface hover:text-ink">
            <IconClose size={14} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Account */}
          <Section title="Account">
            {auth.mode === "single-user" ? (
              <div className="text-[12.5px] text-ink-soft">
                This Themis instance is in <strong className="font-semibold text-ink">single-user mode</strong>. No login required;
                every request is treated as the operator. Set <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[11px]">THEMIS_AUTH_REQUIRED=1</code> on
                the server to enable per-user accounts.
              </div>
            ) : auth.user ? (
              <div>
                <Row label="Signed in as" value={auth.user.email} />
                {auth.user.name && <Row label="Name" value={auth.user.name} />}
                <button
                  onClick={async () => {
                    setSigning(true);
                    await api.logout().catch(() => {});
                    await auth.refresh();
                    onClose();
                  }}
                  disabled={signing}
                  className="mt-3 rounded-md border border-flag/30 bg-flag-wash px-3 py-1.5 text-[12.5px] font-semibold text-flag hover:border-flag disabled:opacity-50"
                >
                  {signing ? "Signing out…" : "Sign out"}
                </button>
              </div>
            ) : (
              <div className="text-[12.5px] text-ink-soft">Not signed in.</div>
            )}
          </Section>

          {/* Appearance */}
          <Section title="Appearance">
            <Row label="Theme" value={theme === "dark" ? "Dark (cinematic)" : "Light (paper)"} />
            <button
              onClick={toggleTheme}
              className="mt-2 rounded-md border border-line bg-paper px-3 py-1.5 text-[12.5px] font-medium text-ink hover:border-brass-soft hover:text-brass-deep"
            >
              Switch to {theme === "dark" ? "light" : "dark"} mode
            </button>
          </Section>

          {/* Keyboard shortcuts */}
          <Section title="Keyboard shortcuts">
            <Shortcuts />
          </Section>

          {/* About */}
          <Section title="About">
            <Row label="Build" value="Themis · evidence intelligence" />
            <Row label="Mode" value={auth.mode === "multi-tenant" ? "Multi-tenant (auth required)" : "Single-user"} />
            <div className="mt-2 text-[10.5px] text-ink-faint">
              Audit chain is hash-linked, append-only. Verify a matter's chain integrity from its overview.
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-brass-deep">{title}</div>
      <div className="mt-2 rounded-md border border-line bg-paper p-3">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-baseline gap-3 py-1">
      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">{label}</span>
      <span className="text-[12.5px] text-ink">{value}</span>
    </div>
  );
}

function Shortcuts() {
  const items: { keys: string; label: string }[] = [
    { keys: "⌘K", label: "Command palette" },
    { keys: "⌘1–8", label: "Switch tabs (Ask / Chronology / Privilege / Binder / Docs / Cite Check / Draft / Damages)" },
    { keys: "⌘D", label: "Toggle theme" },
    { keys: "A / R", label: "Accept / reject the next chronology event (when in Chronology)" },
    { keys: "J / K", label: "Step through queue items" },
    { keys: "Esc", label: "Close any modal or panel" },
  ];
  return (
    <ul className="space-y-1">
      {items.map((it) => (
        <li key={it.keys} className="grid grid-cols-[100px_1fr] items-baseline gap-3 text-[12px]">
          <kbd className={cx("rounded border border-line bg-surface-sunken px-1.5 py-0.5 text-center font-mono text-[10.5px] text-ink-soft")}>{it.keys}</kbd>
          <span className="text-ink">{it.label}</span>
        </li>
      ))}
    </ul>
  );
}
