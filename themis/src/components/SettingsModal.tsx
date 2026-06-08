// Global settings modal — theme, keyboard shortcuts, account info, sign
// out. Reachable from the bottom-left Settings nav item on the dashboard
// and from the user pill in the matter top bar.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { cx } from "../lib/ui";
import { IconClose, IconAdd, IconCopy } from "../icons";

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

          {/* Billing — only meaningful in multi-tenant mode */}
          {auth.mode === "multi-tenant" && auth.user && (
            <Section title="Billing">
              <BillingPanel />
            </Section>
          )}

          {/* Webhooks — outbound audit forwarding for SIEM */}
          {auth.mode === "multi-tenant" && auth.user && (
            <Section title="Audit webhooks">
              <WebhooksPanel />
            </Section>
          )}

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

function BillingPanel() {
  const status = useQuery({ queryKey: ["billing-status"], queryFn: api.billingStatus });
  const portal = useMutation({
    mutationFn: () => api.billingPortal(),
    onSuccess: (r) => { if (r.url) window.location.href = r.url; },
  });
  const planLabel: Record<string, string> = {
    free: "Free",
    solo: "Solo ($99/mo)",
    firm: "Firm ($499/mo)",
    firm_pro: "Firm Pro ($1,499/mo)",
    enterprise: "Enterprise",
  };
  const plan = status.data?.plan ?? "free";
  const usage = status.data?.usage;
  return (
    <div>
      <Row label="Current plan" value={planLabel[plan] ?? plan} />
      {status.data?.planActiveUntil && (
        <Row label="Renews" value={status.data.planActiveUntil.slice(0, 10)} />
      )}
      {usage && (
        <div className="mt-2 space-y-1.5">
          <QuotaBar label="Active matters" used={usage.matters.used} cap={usage.matters.cap} />
          <QuotaBar label="Pages this month" used={usage.pages.used} cap={usage.pages.cap} />
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <a
          href="/pricing"
          className="rounded-md bg-brass px-3 py-1.5 text-[12.5px] font-semibold text-paper hover:bg-brass-deep"
        >
          {plan === "free" ? "Upgrade" : "Change plan"}
        </a>
        {status.data?.hasSubscription && (
          <button
            onClick={() => portal.mutate()}
            disabled={portal.isPending}
            className="rounded-md border border-line bg-paper px-3 py-1.5 text-[12.5px] font-medium text-ink hover:border-brass-soft hover:text-brass-deep disabled:opacity-50"
          >
            {portal.isPending ? "Opening…" : "Manage billing"}
          </button>
        )}
      </div>
      {status.data && !status.data.configured && (
        <div className="mt-2 text-[10.5px] text-flag">
          Stripe isn't configured on this server. Contact support to upgrade.
        </div>
      )}
    </div>
  );
}

function QuotaBar({ label, used, cap }: { label: string; used: number; cap: number }) {
  const unlimited = !Number.isFinite(cap);
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, cap)) * 100));
  const tone = pct >= 90 ? "bg-danger" : pct >= 70 ? "bg-flag" : "bg-brass";
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-ink-soft">{label}</span>
        <span className="font-mono text-ink-faint">
          {used.toLocaleString()} / {unlimited ? "∞" : cap.toLocaleString()}
        </span>
      </div>
      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-surface-sunken">
        <div className={cx("h-full", tone)} style={{ width: unlimited ? "0%" : `${pct}%` }} />
      </div>
    </div>
  );
}

function WebhooksPanel() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["webhooks"], queryFn: api.listWebhooks });
  const create = useMutation({
    mutationFn: ({ url, events }: { url: string; events: string }) => api.createWebhook(url, events),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteWebhook(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState("audit.*");
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const items = list.data ?? [];

  return (
    <div>
      <p className="text-[11.5px] text-ink-soft">
        Forward every audit-trail event (accept, reject, draft, share, certify, etc.) to your SIEM
        or any HTTPS endpoint. Each payload is signed with HMAC-SHA256 in <code className="rounded bg-surface-sunken px-1 font-mono text-[10.5px]">X-Themis-Signature</code>.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) create.mutate({ url: url.trim(), events: events.trim() || "audit.*" });
        }}
        className="mt-3 grid grid-cols-[1fr_140px_auto] items-end gap-2"
      >
        <label className="block">
          <span className="font-mono text-[9px] uppercase tracking-wider text-ink-faint">URL</span>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-siem.example.com/webhook"
            className="mt-0.5 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[12px] text-ink outline-none focus:border-brass"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[9px] uppercase tracking-wider text-ink-faint">Events</span>
          <input
            value={events}
            onChange={(e) => setEvents(e.target.value)}
            placeholder="audit.*"
            className="mt-0.5 w-full rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-[11px] text-ink outline-none focus:border-brass"
          />
        </label>
        <button
          type="submit"
          disabled={!url.trim() || create.isPending}
          className="inline-flex h-[30px] items-center gap-1 rounded-md bg-brass px-3 text-[12px] font-semibold text-paper hover:bg-brass-deep disabled:opacity-50"
        >
          <IconAdd size={12} /> Add
        </button>
      </form>
      {create.error && (
        <div className="mt-2 rounded-md border border-flag/30 bg-flag-wash p-2 text-[11px] text-flag">
          {create.error instanceof Error ? create.error.message : "Could not save webhook."}
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {items.length === 0 ? (
          <li className="rounded-md border border-dashed border-line bg-surface-sunken/40 px-3 py-4 text-center text-[11.5px] text-ink-soft">
            No webhooks configured.
          </li>
        ) : (
          items.map((w) => (
            <li key={w.id} className="rounded-md border border-line bg-paper px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[11.5px] text-ink" title={w.url}>{w.url}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[9.5px] text-ink-faint">
                    <span className="rounded border border-brass-soft bg-brass-wash px-1 py-px text-brass-deep">{w.events}</span>
                    {w.lastOk && <span>· last ok {new Date(w.lastOk).toLocaleString()}</span>}
                    {w.lastError && <span className="text-danger">· last error: {w.lastError}</span>}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    {showSecret[w.id] ? (
                      <code className="break-all rounded border border-line bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] text-ink">
                        {w.secret}
                      </code>
                    ) : (
                      <button
                        onClick={() => setShowSecret({ ...showSecret, [w.id]: true })}
                        className="text-[10.5px] font-medium text-info hover:underline"
                      >
                        Show signing secret
                      </button>
                    )}
                    {showSecret[w.id] && (
                      <button
                        onClick={() => navigator.clipboard?.writeText(w.secret)}
                        className="text-ink-faint hover:text-ink"
                        title="Copy secret"
                      >
                        <IconCopy size={11} />
                      </button>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm("Delete this webhook? It'll stop receiving events immediately.")) del.mutate(w.id);
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-danger/40 bg-danger-wash px-2 py-1 text-[10.5px] font-medium text-danger hover:border-danger"
                >
                  Delete
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
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
