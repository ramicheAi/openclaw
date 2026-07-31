// NewMatterModal — operator-supplied form to create a brand-new matter.
// Posts to POST /api/matters; on success the caller routes into the new
// matter so the user can immediately start uploading documents.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "../lib/queries";
import { IconAdd, IconClose, IconVerified, IconPrivileged } from "../icons";
import { cx } from "../lib/ui";
import type { ConflictHit, ConflictStrength } from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (matterId: string) => void;
}

const MATTER_TYPES = [
  "Employment — Wrongful Termination",
  "Personal Injury",
  "Commercial Litigation",
  "Contract Dispute",
  "Real Estate",
  "Family Law",
  "IP / Patent",
  "Criminal Defense",
  "Bankruptcy",
  "Other",
];

export function NewMatterModal({ open, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [matterType, setMatterType] = useState(MATTER_TYPES[0]);
  const [leadAttorney, setLeadAttorney] = useState("");
  const [posture, setPosture] = useState("");
  const [adverseParties, setAdverseParties] = useState("");
  const [conflictAcknowledged, setConflictAcknowledged] = useState(false);
  const [packId, setPackId] = useState<string>("general");

  // Fetch the vertical-packs catalog so the operator can seed the matter
  // with practice-area defaults (claims/defenses/evidence checklist).
  const packs = useQuery({ queryKey: ["packs"], queryFn: api.listPacks });

  // Live conflicts check — debounced. We check the client + every adverse
  // party (comma- or newline-separated) against the existing entity graph
  // across all matters. The first matter doesn't have any other matters
  // to conflict against; this gracefully returns empty in that case.
  const partyNames = useMemo(() => {
    const all: string[] = [];
    const c = client.trim();
    if (c) all.push(c);
    adverseParties.split(/[,\n]/).map((s) => s.trim()).filter(Boolean).forEach((p) => all.push(p));
    return all;
  }, [client, adverseParties]);

  const [debouncedNames, setDebouncedNames] = useState<string[]>([]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedNames(partyNames), 350);
    return () => clearTimeout(t);
  }, [partyNames]);

  const conflicts = useQuery({
    queryKey: ["conflicts-check", debouncedNames],
    queryFn: () => api.checkConflicts(debouncedNames),
    enabled: open && debouncedNames.length > 0,
  });
  const hits = conflicts.data?.hits ?? [];
  const blocking = hits.some((h) => h.strength === "exact" || h.strength === "fuzzy");
  const create = useMutation({
    mutationFn: () =>
      api.createMatter({ name, client, matterType, leadAttorney, posture, packId: packId === "general" ? undefined : packId }),
    onSuccess: ({ id }) => {
      qc.invalidateQueries({ queryKey: qk.matters });
      // Reset for next time.
      setName("");
      setClient("");
      setLeadAttorney("");
      setPosture("");
      setAdverseParties("");
      setConflictAcknowledged(false);
      onCreated(id);
      onClose();
    },
  });

  if (!open) return null;
  const canSubmit =
    name.trim().length > 0 &&
    client.trim().length > 0 &&
    !create.isPending &&
    (!blocking || conflictAcknowledged);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-6 py-10 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-[640px] max-w-full flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_40px_120px_rgba(0,0,0,0.45)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line bg-surface-sunken px-5 py-4">
          <div>
            <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
              New matter
            </div>
            <h3 className="mt-0.5 font-display text-[18px] font-semibold leading-snug text-ink">
              Create a case brain
            </h3>
            <p className="mt-0.5 text-[12px] text-ink-soft">
              Name the matter. You'll add documents (PDFs, emails, depositions) in the next step.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded-md text-ink-soft hover:bg-surface hover:text-ink"
          >
            <IconClose size={14} />
          </button>
        </header>

        <div className="grid grid-cols-2 gap-3 px-5 py-4">
          <Field label="Matter name *" hint="e.g. Smith v. Acme Corp">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Smith v. Acme Corp"
              className="input"
            />
          </Field>
          <Field label="Client *" hint="The party you represent">
            <input
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="Jane Smith"
              className="input"
            />
          </Field>
          <Field label="Matter type">
            <select value={matterType} onChange={(e) => setMatterType(e.target.value)} className="input">
              {MATTER_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Lead attorney">
            <input
              value={leadAttorney}
              onChange={(e) => setLeadAttorney(e.target.value)}
              placeholder="Lead attorney name"
              className="input"
            />
          </Field>
          <Field label="Practice area pack" hint="Seeds the matter with standard claims, defenses, and an evidence checklist for that vertical." wide>
            <select value={packId} onChange={(e) => setPackId(e.target.value)} className="input">
              {(packs.data ?? [{ id: "general", label: "General litigation", blurb: "" }]).map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <div className="mt-1 text-[10.5px] text-ink-faint">
              {packs.data?.find((p) => p.id === packId)?.blurb ?? "Catch-all defaults."}
            </div>
          </Field>
          <Field label="Adverse parties" hint="Comma- or newline-separated. Used for the conflicts check." wide>
            <textarea
              value={adverseParties}
              onChange={(e) => setAdverseParties(e.target.value)}
              placeholder="Acme Corp, John Q. Defendant"
              rows={2}
              className="input resize-y"
            />
          </Field>
          <Field label="Posture (case theory)" wide>
            <textarea
              value={posture}
              onChange={(e) => setPosture(e.target.value)}
              placeholder="One-paragraph summary of the case and the plaintiff's theory."
              rows={4}
              className="input resize-y"
            />
          </Field>
        </div>

        {/* Live conflicts check — only shown when there's something to check */}
        {debouncedNames.length > 0 && (
          <ConflictsPanel
            hits={hits}
            loading={conflicts.isFetching}
            acknowledged={conflictAcknowledged}
            onAcknowledge={() => setConflictAcknowledged(true)}
          />
        )}

        {create.isError && (
          <div className="mx-5 mb-2 rounded-md border border-danger/30 bg-danger-wash p-2 text-[12px] text-danger">
            Could not create matter — check the name + client and try again.
          </div>
        )}

        <footer className="flex items-center justify-between border-t border-line bg-surface-sunken px-5 py-3">
          <span className="text-[11px] text-ink-soft">* required</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-soft hover:border-line-strong hover:text-ink"
            >
              Cancel
            </button>
            <button
              onClick={() => create.mutate()}
              disabled={!canSubmit}
              className="inline-flex items-center gap-1.5 rounded-md bg-brass px-3 py-1.5 text-[12.5px] font-semibold text-paper hover:bg-brass-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              <IconAdd size={13} /> {create.isPending ? "Creating…" : "Create matter"}
            </button>
          </div>
        </footer>
        <style>{`.input { background: var(--color-paper); border: 1px solid var(--color-line); border-radius: 6px; padding: 8px 10px; font-size: 13px; color: var(--color-ink); width: 100%; outline: none; }
        .input:focus { border-color: var(--color-brass); }`}</style>
      </div>
    </div>
  );
}

function ConflictsPanel({
  hits,
  loading,
  acknowledged,
  onAcknowledge,
}: {
  hits: ConflictHit[];
  loading: boolean;
  acknowledged: boolean;
  onAcknowledge: () => void;
}) {
  const blocking = hits.some((h) => h.strength === "exact" || h.strength === "fuzzy");
  if (hits.length === 0) {
    return (
      <div className="mx-5 mb-3 flex items-center gap-2 rounded-md border border-verify/40 bg-verify-wash px-3 py-2 text-[11.5px] text-verify">
        <IconVerified size={13} />
        <span className="font-medium">No conflicts found across {loading ? "…" : "the firm's matters"}.</span>
      </div>
    );
  }
  return (
    <div className={cx("mx-5 mb-3 rounded-md border p-3", blocking ? "border-danger/40 bg-danger-wash" : "border-flag/40 bg-flag-wash")}>
      <div className={cx("flex items-center gap-2 text-[12px] font-semibold", blocking ? "text-danger" : "text-flag")}>
        <IconPrivileged size={13} />
        {hits.length} potential conflict{hits.length === 1 ? "" : "s"} across the firm's matters.
      </div>
      <ul className="mt-2 space-y-1.5">
        {hits.slice(0, 6).map((h, i) => (
          <ConflictRow key={i} h={h} />
        ))}
      </ul>
      {hits.length > 6 && (
        <div className="mt-1 text-[10.5px] text-ink-faint">+ {hits.length - 6} more</div>
      )}
      {blocking && (
        <label className="mt-2 flex items-start gap-2 text-[11.5px] text-ink">
          <input type="checkbox" checked={acknowledged} onChange={onAcknowledge} className="mt-0.5 accent-brass" />
          <span>
            I have reviewed the conflicts above and resolved them (waiver, withdrawal, or different party).
            Proceeding to create the matter.
          </span>
        </label>
      )}
    </div>
  );
}

function ConflictRow({ h }: { h: ConflictHit }) {
  const v: Record<ConflictStrength, { label: string; cls: string }> = {
    exact: { label: "EXACT", cls: "border-danger/40 bg-danger-wash text-danger" },
    fuzzy: { label: "FUZZY", cls: "border-flag/40 bg-flag-wash text-flag" },
    "last-name": { label: "LAST NAME", cls: "border-line bg-surface-sunken text-ink-soft" },
  };
  const s = v[h.strength];
  return (
    <li className="rounded border border-line bg-paper px-2 py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[12px] text-ink">
            <span className="font-semibold">{h.matched}</span>
            <span className="text-ink-soft"> — matched “{h.query}”</span>
          </div>
          <div className="mt-0.5 truncate font-mono text-[9.5px] text-ink-faint">
            in {h.matterName} ({h.matterClient}) · {h.role || "—"}
          </div>
        </div>
        <span className={cx("shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider", s.cls)}>
          {s.label}
        </span>
      </div>
    </li>
  );
}

function Field({
  label,
  hint,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <label className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {hint && <div className="mt-1 text-[10.5px] text-ink-faint">{hint}</div>}
    </div>
  );
}
