// Public status page — Themis API uptime + dependency checks at a
// glance. Linked from the footer of the marketing surfaces (/cite-check,
// /pricing) and accessible at /status.

import { useQuery } from "@tanstack/react-query";
import { Tau } from "../components/BrandMark";
import { cx } from "../lib/ui";

interface StatusPayload {
  service: string;
  ok: boolean;
  uptime: number;
  checkedAt: string;
  dependencies: { name: string; ok: boolean }[];
}

function uptimeLabel(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = seconds / 60;
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}h`;
  const d = h / 24;
  return `${Math.round(d * 10) / 10}d`;
}

export function StatusScreen() {
  const status = useQuery<StatusPayload>({
    queryKey: ["public-status"],
    queryFn: async () => {
      const res = await fetch(`/api/public/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<StatusPayload>;
    },
    refetchInterval: 30_000,
    retry: false,
  });

  const allGreen = status.data?.ok && status.data.dependencies.every((d) => d.ok);
  const someDown = !!status.data && status.data.dependencies.some((d) => !d.ok);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <a href="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-ink"><Tau size={18} tone="ink" /></div>
            <span className="font-display text-[18px] font-semibold leading-none text-ink">Themis</span>
          </a>
          <nav className="flex items-center gap-4 text-[13px]">
            <a href="/cite-check" className="text-ink-soft hover:text-ink">Cite Check</a>
            <a href="/pricing" className="text-ink-soft hover:text-ink">Pricing</a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="text-center">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-brass-deep">Themis · Status</div>
          <h1 className="mt-2 font-display text-[28px] font-semibold leading-tight text-ink">
            {status.isLoading ? "Checking…" : allGreen ? "All systems operational" : someDown ? "Degraded performance" : "Status unavailable"}
          </h1>
          {status.data && (
            <p className="mt-2 text-[12.5px] text-ink-soft">
              Last checked {new Date(status.data.checkedAt).toLocaleString()} · Uptime {uptimeLabel(status.data.uptime)}
            </p>
          )}
        </div>

        <div className="mt-8 overflow-hidden rounded-xl border border-line bg-surface">
          <div className="border-b border-line bg-surface-sunken px-5 py-3 text-[11px] font-mono uppercase tracking-wider text-ink-soft">
            Services
          </div>
          {status.isLoading ? (
            <div className="px-5 py-6 text-center text-[12.5px] text-ink-soft">Probing…</div>
          ) : status.error || !status.data ? (
            <div className="px-5 py-6 text-center text-[12.5px] text-flag">
              Could not reach the Themis API. The status check page itself is unreachable — Themis is likely down.
            </div>
          ) : (
            <ul className="divide-y divide-line">
              <ServiceRow name="Themis API" ok={status.data.ok} />
              {status.data.dependencies.map((d) => (
                <ServiceRow key={d.name} name={d.name} ok={d.ok} />
              ))}
            </ul>
          )}
        </div>

        <div className="mt-8 rounded-lg border border-line bg-surface px-5 py-4 text-[12.5px] leading-relaxed text-ink-soft">
          <div className="font-display text-[15px] font-semibold text-ink">Maintenance windows</div>
          <p className="mt-1.5">
            We deploy continuously. Most updates take effect within seconds with no downtime. For larger changes we
            announce ahead of time via email to subscribed customers.
          </p>
        </div>
      </main>

      <footer className="mt-12 border-t border-line bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-6 text-center text-[11px] text-ink-faint">
          Themis · Evidence Intelligence ·{" "}
          <a href="/cite-check" className="text-ink-soft hover:text-ink">Try free</a> ·{" "}
          <a href="/pricing" className="text-ink-soft hover:text-ink">Pricing</a>
        </div>
      </footer>
    </div>
  );
}

function ServiceRow({ name, ok }: { name: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between px-5 py-3">
      <span className="text-[13px] text-ink">{name}</span>
      <span className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
        ok ? "border-verify/30 bg-verify-wash text-verify" : "border-danger/30 bg-danger-wash text-danger",
      )}>
        <span className={cx("h-1.5 w-1.5 rounded-full", ok ? "bg-verify" : "bg-danger")} />
        {ok ? "Operational" : "Down"}
      </span>
    </li>
  );
}
