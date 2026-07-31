// Tokenized read-only matter view. Standalone — no global nav, no chat, no
// privilege panel. The token is the credential; the server resolves it,
// enforces revocation/expiry, and never exposes flagged/withheld documents.
//
// Three panes:
//   1. Header: matter name, posture, prepared-by attribution, watermark.
//   2. Chronology + entities (left + right columns).
//   3. Documents list (Bates + title + author + date; click expands summary).

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { cx } from "../lib/ui";
import { Tau } from "../components/BrandMark";
import type { SharedView } from "../types";

export function SharedMatterView({ token }: { token: string }) {
  const view = useQuery({
    queryKey: ["shared", token],
    queryFn: () => api.getSharedView(token),
    retry: false,
  });

  if (view.isLoading) {
    return <Center>Loading shared view…</Center>;
  }
  if (view.error || !view.data) {
    return (
      <Center>
        <div className="mx-auto max-w-md rounded-lg border border-flag/30 bg-flag-wash p-4 text-center text-[13px] text-flag">
          <div className="font-semibold">This share link is invalid, expired, or revoked.</div>
          <div className="mt-1 text-[11.5px]">Ask the matter owner for a fresh link.</div>
        </div>
      </Center>
    );
  }

  return <Render data={view.data} />;
}

function Render({ data }: { data: SharedView }) {
  const { matter, events, documents, entities, link } = data;
  const expired = !!link.expiresAt && new Date(link.expiresAt).getTime() < Date.now();
  const sortedEvents = [...events].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="min-h-full bg-paper text-ink">
      <header className="border-b border-line bg-surface px-8 py-6">
        <div className="mx-auto flex max-w-5xl items-start gap-4">
          <Tau size={36} tone="paper" />
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
              Themis · Read-only view
            </div>
            <h1 className="mt-0.5 font-display text-[28px] font-semibold leading-tight text-ink">{matter.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-soft">
              <span>{matter.client}</span>
              <span>·</span>
              <span>{matter.matterType}</span>
              <span>·</span>
              <span>Lead {matter.leadAttorney}</span>
              <span>·</span>
              <span>{matter.docs.toLocaleString()} documents</span>
            </div>
            {link.label && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-brass-soft bg-brass-wash px-2 py-0.5 text-[11px] text-brass-deep">
                Shared with: <span className="font-medium">{link.label}</span>
              </div>
            )}
            {link.expiresAt && (
              <div className={cx("mt-1 text-[10.5px]", expired ? "text-danger" : "text-ink-faint")}>
                {expired ? "Expired " : "Expires "}{link.expiresAt.slice(0, 10)}
              </div>
            )}
          </div>
        </div>
        {matter.posture && (
          <div className="mx-auto mt-4 max-w-5xl rounded-lg border border-line bg-paper px-4 py-3 text-[13px] leading-relaxed text-ink">
            <div className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-brass-deep">Posture</div>
            <p className="mt-1">{matter.posture}</p>
            {matter.claims.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[12.5px]">
                {matter.claims.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            )}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-5xl px-8 py-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          {/* Chronology */}
          <section>
            <SectionLabel>Chronology · {sortedEvents.length} events</SectionLabel>
            {sortedEvents.length === 0 ? (
              <div className="mt-2 text-[12.5px] text-ink-faint">No accepted chronology events to share yet.</div>
            ) : (
              <ol className="mt-3 space-y-2.5">
                {sortedEvents.map((e, i) => (
                  <li key={i} className="rounded-lg border border-line bg-surface px-3.5 py-2.5">
                    <div className="flex items-center gap-2 font-mono text-[11px] text-brass-deep">
                      <span>{e.date}</span>
                      <span className="rounded border border-brass-soft bg-brass-wash px-1 py-px text-[10px] text-brass-deep">{e.citation.bates}, p.{e.citation.page}</span>
                    </div>
                    <div className="mt-1 text-[13px] leading-snug text-ink">{e.description}</div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Cast */}
          <aside>
            <SectionLabel>Cast · {entities.length}</SectionLabel>
            <ul className="mt-3 space-y-1.5">
              {entities.map((e, i) => (
                <li key={i} className="rounded-md border border-line bg-surface px-2.5 py-1.5">
                  <div className="text-[12.5px] font-medium text-ink">{e.name}</div>
                  <div className="mt-0.5 text-[10.5px] text-ink-soft">
                    {e.role}
                    {e.org && e.org !== "—" ? ` · ${e.org}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>

        {/* Documents */}
        <section className="mt-8">
          <SectionLabel>Documents · {documents.length}</SectionLabel>
          <div className="mt-2 rounded-lg border border-line bg-surface text-[12.5px]">
            <table className="w-full">
              <thead className="border-b border-line bg-surface-sunken text-[10px] uppercase tracking-wider text-ink-soft">
                <tr>
                  <th className="px-3 py-2 text-left font-mono">Bates</th>
                  <th className="px-3 py-2 text-left font-mono">Date</th>
                  <th className="px-3 py-2 text-left font-mono">Type</th>
                  <th className="px-3 py-2 text-left font-mono">Title</th>
                  <th className="px-3 py-2 text-left font-mono">Author</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => (
                  <DocRow key={d.bates} d={d} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-[10.5px] italic text-ink-faint">
            Documents flagged for privilege review or withheld are not included in this shared view.
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface px-8 py-4 text-center text-[10.5px] text-ink-faint">
        Generated by Themis · {new Date(link.createdAt).toLocaleString()} · Read-only view
      </footer>
    </div>
  );
}

function DocRow({ d }: { d: SharedView["documents"][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr
        onClick={() => setOpen((v) => !v)}
        className={cx("cursor-pointer border-b border-line transition", open ? "bg-brass-wash/50" : "hover:bg-surface-sunken")}
      >
        <td className="px-3 py-2 font-mono text-[11px] text-ink">{d.bates}</td>
        <td className="px-3 py-2 font-mono text-[11px] text-ink-soft">{d.date}</td>
        <td className="px-3 py-2 text-ink-soft">{d.type}</td>
        <td className="px-3 py-2 text-ink">
          {d.hot && <span className="mr-1.5 rounded border border-danger/30 bg-danger-wash px-1 py-px font-mono text-[9px] uppercase tracking-wider text-danger">Hot</span>}
          {d.title}
        </td>
        <td className="px-3 py-2 text-ink-soft">{d.author}</td>
      </tr>
      {open && d.summary && (
        <tr>
          <td colSpan={5} className="border-b border-line bg-paper px-4 py-3 text-[12px] leading-relaxed text-ink">
            <div className="font-mono text-[9.5px] uppercase tracking-wider text-brass-deep">Summary</div>
            <p className="mt-1">{d.summary}</p>
            {d.recipients.length > 0 && (
              <div className="mt-2 text-[11px] text-ink-soft">
                To: {d.recipients.join(", ")}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-brass-deep">{children}</div>;
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid h-screen w-full place-items-center bg-paper text-[13px] text-ink-soft">{children}</div>;
}
