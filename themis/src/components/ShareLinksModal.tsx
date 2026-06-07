// Share a scoped read-only view of this matter with a co-counsel, client, or
// expert. Each share link is a random url-safe token; anyone with the URL
// gets the scoped view. Privilege wall is inviolable — flagged/withheld docs
// never appear in a shared view. Links can be labeled, expired, or revoked.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "../lib/queries";
import { cx } from "../lib/ui";
import { IconClose, IconCopy, IconAdd, IconExport, IconPrivileged } from "../icons";
import type { ShareLink } from "../types";

interface Props {
  matterId: string;
  onClose: () => void;
}

export function ShareLinksModal({ matterId, onClose }: Props) {
  const qc = useQueryClient();
  const links = useQuery({
    queryKey: [...qk.matter(matterId), "share-links"],
    queryFn: () => api.listShareLinks(matterId),
  });
  const create = useMutation({
    mutationFn: (payload: Parameters<typeof api.createShareLink>[1]) => api.createShareLink(matterId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...qk.matter(matterId), "share-links"] }),
  });
  const revoke = useMutation({
    mutationFn: (token: string) => api.revokeShareLink(matterId, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...qk.matter(matterId), "share-links"] }),
  });

  const [label, setLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const list = links.data ?? [];
  const active = list.filter((l) => !l.revoked);
  const revoked = list.filter((l) => l.revoked);

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-6 py-10">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-[640px] max-w-full flex-col overflow-hidden rounded-[12px] border border-line bg-surface shadow-[0_40px_120px_rgba(0,0,0,0.45)]"
      >
        <header className="border-b border-line bg-surface-sunken px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
                Share
              </div>
              <h3 className="mt-0.5 font-display text-[17px] font-semibold leading-tight text-ink">
                Read-only matter view
              </h3>
              <p className="mt-0.5 text-[12px] text-ink-soft">
                Generate a tokenized link for co-counsel, a client, or an expert. The privilege wall stays intact —
                flagged or withheld documents never appear in a shared view. Revoke any link instantly.
              </p>
            </div>
            <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-ink-soft hover:bg-surface hover:text-ink">
              <IconClose size={14} />
            </button>
          </div>
        </header>

        <div className="border-b border-line bg-paper px-5 py-3.5">
          <div className="grid grid-cols-[1fr_180px_auto] items-end gap-3">
            <Field label="Label (who is this for?)">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Co-counsel Jane Smith"
                className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
              />
            </Field>
            <Field label="Expires (optional)">
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
              />
            </Field>
            <button
              onClick={() => create.mutate({ label: label || undefined, expiresAt: expiresAt || undefined })}
              disabled={create.isPending}
              className="inline-flex items-center gap-1 rounded-md bg-brass px-3 py-1.5 text-[12.5px] font-semibold text-paper hover:bg-brass-deep disabled:opacity-50"
            >
              <IconAdd size={13} /> Create
            </button>
          </div>
          {create.error && (
            <div className="mt-2 rounded-md border border-flag/30 bg-flag-wash p-2 text-[11.5px] text-flag">
              {create.error instanceof Error ? create.error.message : "Could not create link."}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {links.isLoading ? (
            <div className="text-[12.5px] text-ink-soft">Loading…</div>
          ) : active.length === 0 && revoked.length === 0 ? (
            <div className="rounded-md border border-dashed border-line bg-surface-sunken/40 px-4 py-6 text-center text-[12.5px] text-ink-soft">
              No links yet. Create one above to share this matter read-only.
            </div>
          ) : (
            <>
              {active.length > 0 && (
                <section>
                  <SectionLabel>Active</SectionLabel>
                  <ul className="mt-1.5 space-y-2">
                    {active.map((l) => (
                      <LinkRow key={l.token} l={l} onRevoke={() => revoke.mutate(l.token)} />
                    ))}
                  </ul>
                </section>
              )}
              {revoked.length > 0 && (
                <section className="mt-4">
                  <SectionLabel>Revoked</SectionLabel>
                  <ul className="mt-1.5 space-y-2">
                    {revoked.map((l) => (
                      <LinkRow key={l.token} l={l} onRevoke={() => {}} />
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-brass-deep">{children}</div>;
}

function LinkRow({ l, onRevoke }: { l: ShareLink; onRevoke: () => void }) {
  const url = `${window.location.origin}/share/${l.token}`;
  const [copied, setCopied] = useState(false);
  const expired = !!l.expiresAt && new Date(l.expiresAt).getTime() < Date.now();

  return (
    <li className={cx("rounded-md border bg-paper px-3 py-2.5", l.revoked || expired ? "border-line opacity-60" : "border-line")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-ink">{l.label || "(no label)"}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-ink-faint">
            <span>created {l.createdAt.slice(0, 10)}</span>
            {l.expiresAt && (
              <span className={expired ? "text-danger" : ""}>· {expired ? "expired" : "expires"} {l.expiresAt.slice(0, 10)}</span>
            )}
            <span>· viewed {l.viewCount}×</span>
            {l.lastViewed && <span>· last {new Date(l.lastViewed).toLocaleString()}</span>}
            {l.revoked && <span className="text-danger">· revoked</span>}
          </div>
          <div className="mt-1.5 truncate rounded-sm border border-line bg-surface-sunken px-2 py-1 font-mono text-[10.5px] text-ink" title={url}>
            {url}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            onClick={() => {
              navigator.clipboard?.writeText(url).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }).catch(() => {});
            }}
            disabled={l.revoked || expired}
            className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink-soft hover:border-brass-soft hover:text-brass-deep disabled:opacity-50"
          >
            <IconCopy size={11} /> {copied ? "Copied" : "Copy"}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className={cx(
              "inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink-soft hover:border-brass-soft hover:text-brass-deep",
              (l.revoked || expired) && "pointer-events-none opacity-50",
            )}
          >
            <IconExport size={11} /> Open
          </a>
          {!l.revoked && (
            <button
              onClick={() => { if (window.confirm("Revoke this share link? Anyone holding it loses access.")) onRevoke(); }}
              className="inline-flex items-center gap-1 rounded-md border border-danger/40 bg-danger-wash px-2 py-1 text-[11px] font-medium text-danger hover:border-danger"
            >
              <IconPrivileged size={11} /> Revoke
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-brass-deep">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
