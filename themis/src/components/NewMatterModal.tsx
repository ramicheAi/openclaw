// NewMatterModal — operator-supplied form to create a brand-new matter.
// Posts to POST /api/matters; on success the caller routes into the new
// matter so the user can immediately start uploading documents.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "../lib/queries";
import { IconAdd, IconClose } from "../icons";

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
  const create = useMutation({
    mutationFn: () => api.createMatter({ name, client, matterType, leadAttorney, posture }),
    onSuccess: ({ id }) => {
      qc.invalidateQueries({ queryKey: qk.matters });
      // Reset for next time.
      setName("");
      setClient("");
      setLeadAttorney("");
      setPosture("");
      onCreated(id);
      onClose();
    },
  });

  if (!open) return null;
  const canSubmit = name.trim().length > 0 && client.trim().length > 0 && !create.isPending;

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
              placeholder="D. Okafor"
              className="input"
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
