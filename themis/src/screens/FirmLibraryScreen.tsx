// Firm Library — firm-scoped templates. Five kinds: draft (motion shells,
// demand letters), depo (question banks), evidence checklists,
// demand-clause snippets, other. Save any Draft Studio output as a
// reusable template; the use-count drives sort-by-popularity.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { cx } from "../lib/ui";
import { IconAdd, IconClose, IconCopy, IconSearch } from "../icons";
import type { FirmTemplate, TemplateKind } from "../types";

const KINDS: { id: TemplateKind | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts" },
  { id: "depo", label: "Deposition" },
  { id: "evidence", label: "Evidence checklists" },
  { id: "demand-clause", label: "Demand clauses" },
  { id: "other", label: "Other" },
];

const KIND_LABEL: Record<TemplateKind, string> = {
  draft: "Draft",
  depo: "Depo",
  evidence: "Evidence",
  "demand-clause": "Demand clause",
  other: "Other",
};

export function FirmLibraryScreen() {
  const qc = useQueryClient();
  const [activeKind, setActiveKind] = useState<TemplateKind | "all">("all");
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<FirmTemplate | "new" | null>(null);

  const templates = useQuery({
    queryKey: ["templates", activeKind],
    queryFn: () => api.listTemplates(activeKind === "all" ? undefined : activeKind),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });

  const list = templates.data ?? [];
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.body.toLowerCase().includes(q) ||
        t.tags.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    );
  }, [list, filter]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-line bg-surface px-8 py-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
              Firm Library
            </div>
            <h1 className="mt-1 font-display text-[26px] font-semibold leading-tight text-ink">
              Templates + clauses + checklists
            </h1>
            <p className="mt-0.5 max-w-2xl text-[12.5px] text-ink-soft">
              Save any Draft Studio output, deposition outline, or evidence checklist as a reusable template.
              Firm-scoped — every teammate sees the same library. Use-count drives sort-by-popularity.
            </p>
          </div>
          <button
            onClick={() => setEditing("new")}
            className="inline-flex items-center gap-1.5 rounded-md bg-brass px-3 py-2 text-[12.5px] font-semibold text-paper hover:bg-brass-deep"
          >
            <IconAdd size={13} /> New template
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => setActiveKind(k.id)}
              className={cx(
                "rounded-full px-3 py-1 text-[11.5px] font-medium transition",
                activeKind === k.id
                  ? "bg-brass-wash text-brass-deep"
                  : "border border-line bg-paper text-ink-soft hover:border-brass-soft hover:text-brass-deep",
              )}
            >
              {k.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 rounded-md border border-line bg-paper px-2.5 py-1.5">
            <IconSearch size={13} className="text-brass" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search title, body, tags…"
              className="w-64 bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-faint"
            />
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {templates.isLoading ? (
          <div className="text-[12.5px] text-ink-soft">Loading templates…</div>
        ) : filtered.length === 0 ? (
          <div className="mx-auto mt-12 max-w-md rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center text-[12.5px] text-ink-soft">
            {filter ? "Nothing matches that filter." : list.length === 0 ? "No templates yet. Click \"New template\" or save a Draft Studio output." : "No templates in this category."}
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((t) => (
              <TemplateCard
                key={t.id}
                t={t}
                onEdit={() => setEditing(t)}
                onDelete={() => {
                  if (window.confirm(`Delete template "${t.title}"?`)) del.mutate(t.id);
                }}
              />
            ))}
          </ul>
        )}
      </div>

      {editing && <TemplateEditor mode={editing === "new" ? "new" : "edit"} template={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TemplateCard({ t, onEdit, onDelete }: { t: FirmTemplate; onEdit: () => void; onDelete: () => void }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(t.body).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
    api.useTemplate(t.id).catch(() => {});
  }
  const preview = t.body.slice(0, 240) + (t.body.length > 240 ? "…" : "");
  return (
    <li className="group flex h-full flex-col rounded-xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="rounded border border-brass-soft bg-brass-wash px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-brass-deep">
          {KIND_LABEL[t.kind]}
        </span>
        {t.useCount > 0 && (
          <span className="font-mono text-[9.5px] text-ink-faint">used {t.useCount}×</span>
        )}
      </div>
      <h3 className="mt-2 line-clamp-2 font-display text-[15px] font-semibold leading-snug text-ink">{t.title}</h3>
      {t.category && <div className="mt-0.5 truncate text-[11px] text-ink-soft">{t.category}</div>}
      <pre className="mt-2 line-clamp-5 whitespace-pre-wrap font-mono text-[10.5px] leading-relaxed text-ink-soft">
        {preview || "(empty)"}
      </pre>
      <div className="mt-3 flex items-center gap-1.5">
        <button onClick={copy} className="inline-flex items-center gap-1 rounded-md border border-line bg-paper px-2 py-1 text-[11px] font-medium text-ink-soft hover:border-brass-soft hover:text-brass-deep">
          <IconCopy size={11} /> {copied ? "Copied" : "Copy"}
        </button>
        <button onClick={onEdit} className="rounded-md border border-line bg-paper px-2 py-1 text-[11px] font-medium text-ink-soft hover:border-brass-soft hover:text-brass-deep">
          Edit
        </button>
        <button onClick={onDelete} className="ml-auto rounded-md text-[11px] font-medium text-ink-faint opacity-0 transition hover:text-danger group-hover:opacity-100">
          Delete
        </button>
      </div>
    </li>
  );
}

function TemplateEditor({ mode, template, onClose }: { mode: "new" | "edit"; template: FirmTemplate | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<TemplateKind>(template?.kind ?? "draft");
  const [title, setTitle] = useState(template?.title ?? "");
  const [category, setCategory] = useState(template?.category ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [tags, setTags] = useState(template?.tags ?? "");

  const save = useMutation({
    mutationFn: () =>
      mode === "new"
        ? api.createTemplate({ kind, title, category, body, tags })
        : api.updateTemplate(template!.id, { kind, title, category, body, tags }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      onClose();
    },
  });

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-6 py-10">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-[720px] max-w-full flex-col overflow-hidden rounded-[12px] border border-line bg-surface shadow-[0_40px_120px_rgba(0,0,0,0.45)]"
      >
        <header className="flex items-start justify-between border-b border-line bg-surface-sunken px-5 py-4">
          <div>
            <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
              Firm Library
            </div>
            <h3 className="mt-0.5 font-display text-[17px] font-semibold leading-tight text-ink">
              {mode === "new" ? "New template" : "Edit template"}
            </h3>
          </div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-ink-soft hover:bg-surface hover:text-ink">
            <IconClose size={14} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="grid grid-cols-[140px_1fr_180px] gap-3">
            <Field label="Kind">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as TemplateKind)}
                className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
              >
                <option value="draft">Draft</option>
                <option value="depo">Depo</option>
                <option value="evidence">Evidence</option>
                <option value="demand-clause">Demand clause</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Title">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Standard PI demand letter — premises"
                className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
              />
            </Field>
            <Field label="Category (optional)">
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="PI / Employment / …"
                className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
              />
            </Field>
          </div>
          <Field label="Body">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Paste your template, clause, or checklist here. {{placeholders}} are free-form — Themis won't substitute them automatically."
              className="h-[280px] w-full resize-none rounded-md border border-line bg-paper px-3 py-2 font-mono text-[12px] leading-relaxed text-ink outline-none focus:border-brass"
              spellCheck={false}
            />
          </Field>
          <Field label="Tags (comma-separated, optional)">
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="PI, demand, premises, slip-and-fall"
              className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
            />
          </Field>
          {save.error && (
            <div className="rounded-md border border-flag/30 bg-flag-wash p-2 text-[11.5px] text-flag">
              {save.error instanceof Error ? save.error.message : "Could not save template."}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-sunken px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-line bg-paper px-3 py-1.5 text-[12.5px] font-medium text-ink-soft hover:border-line-strong hover:text-ink">
            Cancel
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={!title.trim() || save.isPending}
            className="rounded-md bg-brass px-3 py-1.5 text-[12.5px] font-semibold text-paper hover:bg-brass-deep disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : mode === "new" ? "Create" : "Save changes"}
          </button>
        </footer>
      </div>
    </div>
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
