// Collaborate modal — two tabs inside one surface:
//   1. Team — invite teammates with a role (admin/partner/associate/
//      paralegal/readonly). Per-matter access list.
//   2. Share links — tokenized read-only links for co-counsel, clients,
//      experts. Privilege wall stays intact in shared views.
//
// Replaces the old ShareLinksModal so the TopBar doesn't sprout a second
// button for the related access concept.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "../lib/queries";
import { cx } from "../lib/ui";
import { IconClose, IconCopy, IconAdd, IconExport, IconPrivileged, IconEntity } from "../icons";
import type { MatterAccess, MatterRole, ShareLink } from "../types";

interface Props {
  matterId: string;
  onClose: () => void;
}

type Tab = "team" | "share";

const ROLE_OPTIONS: { id: MatterRole; label: string; hint: string }[] = [
  { id: "admin", label: "Admin", hint: "Full control · can invite + revoke" },
  { id: "partner", label: "Partner", hint: "Sign filings, manage matter" },
  { id: "associate", label: "Associate", hint: "Draft + accept events" },
  { id: "paralegal", label: "Paralegal", hint: "Upload + organize, no settlement authority" },
  { id: "readonly", label: "Read-only", hint: "View + comment only" },
];

const ROLE_LABEL: Record<MatterRole, string> = {
  admin: "Admin",
  partner: "Partner",
  associate: "Associate",
  paralegal: "Paralegal",
  readonly: "Read-only",
};

export function CollaborateModal({ matterId, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("team");

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-6 py-10">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-[680px] max-w-full flex-col overflow-hidden rounded-[12px] border border-line bg-surface shadow-[0_40px_120px_rgba(0,0,0,0.45)]"
      >
        <header className="border-b border-line bg-surface-sunken px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
                Collaborate
              </div>
              <h3 className="mt-0.5 font-display text-[17px] font-semibold leading-tight text-ink">
                Team + shared views
              </h3>
              <p className="mt-0.5 text-[12px] text-ink-soft">
                Invite teammates with a role, or send a tokenized read-only link to co-counsel / clients. Privilege wall is inviolable in either flow.
              </p>
            </div>
            <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-ink-soft hover:bg-surface hover:text-ink">
              <IconClose size={14} />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-1">
            <TabButton active={tab === "team"} onClick={() => setTab("team")}>
              <IconEntity size={13} /> Team
            </TabButton>
            <TabButton active={tab === "share"} onClick={() => setTab("share")}>
              <IconExport size={13} /> Share links
            </TabButton>
          </div>
        </header>

        {tab === "team" ? <TeamTab matterId={matterId} /> : <ShareLinksTab matterId={matterId} />}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition",
        active ? "bg-brass-wash text-brass-deep" : "text-ink-soft hover:bg-surface hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

// ── Team tab ────────────────────────────────────────────────────────────

function TeamTab({ matterId }: { matterId: string }) {
  const qc = useQueryClient();
  const access = useQuery({ queryKey: [...qk.matter(matterId), "access"], queryFn: () => api.listMatterAccess(matterId) });
  const grant = useMutation({
    mutationFn: ({ email, role }: { email: string; role: MatterRole }) => api.grantMatterAccess(matterId, email, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...qk.matter(matterId), "access"] }),
  });
  const revoke = useMutation({
    mutationFn: (email: string) => api.revokeMatterAccess(matterId, email),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...qk.matter(matterId), "access"] }),
  });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MatterRole>("paralegal");

  const list = access.data ?? [];

  return (
    <>
      <div className="border-b border-line bg-paper px-5 py-3.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) grant.mutate({ email: email.trim(), role });
          }}
          className="grid grid-cols-[1fr_180px_auto] items-end gap-3"
        >
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="associate@firm.com"
              className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
            />
          </Field>
          <Field label="Role">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as MatterRole)}
              className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </Field>
          <button
            type="submit"
            disabled={grant.isPending || !email.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-brass px-3 py-1.5 text-[12.5px] font-semibold text-paper hover:bg-brass-deep disabled:opacity-50"
          >
            <IconAdd size={13} /> Invite
          </button>
        </form>
        <p className="mt-1.5 text-[10.5px] text-ink-faint">
          {ROLE_OPTIONS.find((r) => r.id === role)?.hint}
        </p>
        {grant.error && (
          <div className="mt-2 rounded-md border border-flag/30 bg-flag-wash p-2 text-[11.5px] text-flag">
            {grant.error instanceof Error ? grant.error.message : "Could not invite."}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {access.isLoading ? (
          <div className="text-[12.5px] text-ink-soft">Loading team…</div>
        ) : list.length === 0 ? (
          <div className="rounded-md border border-dashed border-line bg-surface-sunken/40 px-4 py-6 text-center text-[12.5px] text-ink-soft">
            No teammates yet. The matter owner has full access by default; invite collaborators above to add them.
          </div>
        ) : (
          <ul className="space-y-2">
            {list.map((a) => (
              <TeamRow key={a.email} access={a} onRevoke={() => revoke.mutate(a.email)} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function TeamRow({ access, onRevoke }: { access: MatterAccess; onRevoke: () => void }) {
  return (
    <li className="rounded-md border border-line bg-paper px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-ink">{access.email}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-ink-faint">
            <span className="rounded border border-brass-soft bg-brass-wash px-1 py-px text-[9.5px] uppercase tracking-wider text-brass-deep">
              {ROLE_LABEL[access.role]}
            </span>
            <span>invited {access.invitedAt.slice(0, 10)}</span>
            <span>· by {access.invitedBy}</span>
            {!access.accepted && <span className="text-flag">· pending</span>}
          </div>
        </div>
        <button
          onClick={() => {
            if (window.confirm(`Revoke access for ${access.email}?`)) onRevoke();
          }}
          className="inline-flex items-center gap-1 rounded-md border border-danger/40 bg-danger-wash px-2 py-1 text-[11px] font-medium text-danger hover:border-danger"
        >
          <IconPrivileged size={11} /> Revoke
        </button>
      </div>
    </li>
  );
}

// ── Share links tab ────────────────────────────────────────────────────

function ShareLinksTab({ matterId }: { matterId: string }) {
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
    <>
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
                  {active.map((l) => <LinkRow key={l.token} l={l} onRevoke={() => revoke.mutate(l.token)} />)}
                </ul>
              </section>
            )}
            {revoked.length > 0 && (
              <section className="mt-4">
                <SectionLabel>Revoked</SectionLabel>
                <ul className="mt-1.5 space-y-2">
                  {revoked.map((l) => <LinkRow key={l.token} l={l} onRevoke={() => {}} />)}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </>
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
            {l.expiresAt && <span className={expired ? "text-danger" : ""}>· {expired ? "expired" : "expires"} {l.expiresAt.slice(0, 10)}</span>}
            <span>· viewed {l.viewCount}×</span>
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
