// Damages — itemized line items grouped by category, each anchored to a
// Bates id when possible. Subtotals per category, a multiplier on pain &
// suffering so the operator can model "3× medicals" without hardcoding, and
// a grand total. The same numbers feed the settlement-statement draft.

import { useMemo, useState } from "react";
import { useDamages, useCreateDamages, useUpdateDamages, useDeleteDamages, useDocuments, useMatter } from "../../../../lib/queries";
import { cx } from "../../../../lib/ui";
import { IconAdd, IconClose, IconExport } from "../../../../icons";
import { exportDamagesPdf } from "../../../../lib/exports";
import type { DamagesCategory, DamagesItem } from "../../../../types";
import { PanelAction, PanelHead } from "./PanelHead";

const CATEGORY_LABEL: Record<DamagesCategory, string> = {
  medical: "Medical",
  lost_wages: "Lost wages",
  property: "Property",
  pain_suffering: "Pain & suffering",
  future_care: "Future care",
  other: "Other",
};
const CATEGORY_ORDER: DamagesCategory[] = [
  "medical",
  "lost_wages",
  "property",
  "future_care",
  "pain_suffering",
  "other",
];

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function effectiveCents(it: DamagesItem) {
  return Math.round(it.amountCents * (it.multiplier || 1));
}

export function DamagesPanel({ matterId }: { matterId: string }) {
  const { data: items } = useDamages(matterId);
  const { data: docs } = useDocuments(matterId);
  const { data: matter } = useMatter(matterId);
  const create = useCreateDamages(matterId);
  const update = useUpdateDamages(matterId);
  const del = useDeleteDamages(matterId);
  const [adding, setAdding] = useState<null | DamagesCategory>(null);

  const list = items ?? [];
  const byCategory = useMemo(() => {
    const m = new Map<DamagesCategory, DamagesItem[]>();
    for (const c of CATEGORY_ORDER) m.set(c, []);
    for (const it of list) m.get(it.category)?.push(it);
    return m;
  }, [list]);

  const total = list.reduce((s, it) => s + effectiveCents(it), 0);
  const economic = list
    .filter((it) => it.category !== "pain_suffering")
    .reduce((s, it) => s + effectiveCents(it), 0);
  const noneconomic = list
    .filter((it) => it.category === "pain_suffering")
    .reduce((s, it) => s + effectiveCents(it), 0);

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      <PanelHead
        eyebrow="Damages model"
        title="Itemized line items"
        sub="Group by category. Anchor each line to a Bates document where possible. Pain & suffering carries a multiplier so you can model alternative theories without hardcoding."
        actions={
          <>
            <PanelAction
              disabled={!matter || list.length === 0}
              onClick={() => matter && exportDamagesPdf(matter, list)}
            >
              <IconExport size={13} /> Export PDF
            </PanelAction>
            <PanelAction primary onClick={() => setAdding("medical")}>
              <IconAdd size={13} /> Add line item
            </PanelAction>
          </>
        }
      />

      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: "1fr 280px" }}>
        <section className="min-h-0 overflow-y-auto px-6 py-5">
          {list.length === 0 ? (
            <Empty onAdd={() => setAdding("medical")} />
          ) : (
            <div className="space-y-5">
              {CATEGORY_ORDER.map((cat) => {
                const rows = byCategory.get(cat) ?? [];
                if (rows.length === 0) return null;
                const sub = rows.reduce((s, it) => s + effectiveCents(it), 0);
                return (
                  <section key={cat}>
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <div className="flex items-baseline gap-2">
                        <h3 className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
                          {CATEGORY_LABEL[cat]}
                        </h3>
                        <span className="rounded-full bg-surface-sunken px-1.5 py-0.5 font-mono text-[9.5px] text-ink-soft">
                          {rows.length}
                        </span>
                      </div>
                      <div className="font-display text-[14px] font-semibold text-ink">{dollars(sub)}</div>
                    </div>
                    <ul className="space-y-1.5">
                      {rows.map((it) => (
                        <Row
                          key={it.id}
                          item={it}
                          docs={docs ?? []}
                          onSave={(patch) => update.mutate({ itemId: it.id, patch })}
                          onDelete={() => del.mutate(it.id)}
                        />
                      ))}
                      <li>
                        <button
                          onClick={() => setAdding(cat)}
                          className="inline-flex items-center gap-1 rounded-md border border-dashed border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink-soft hover:border-brass-soft hover:text-brass-deep"
                        >
                          <IconAdd size={11} /> Add {CATEGORY_LABEL[cat].toLowerCase()} item
                        </button>
                      </li>
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </section>

        <aside className="min-h-0 overflow-y-auto border-l border-line bg-surface px-4 py-5">
          <div className="text-center">
            <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">Total damages</div>
            <div className="mt-2 font-display text-[36px] font-semibold leading-none text-ink">{dollars(total)}</div>
          </div>
          <div className="mt-5 space-y-2.5">
            <Tally label="Economic" amount={dollars(economic)} />
            <Tally label="Non-economic" amount={dollars(noneconomic)} muted />
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">By category</div>
            <ul className="mt-2 space-y-1.5">
              {CATEGORY_ORDER.map((c) => {
                const sub = (byCategory.get(c) ?? []).reduce((s, it) => s + effectiveCents(it), 0);
                if (sub === 0) return null;
                const pct = total > 0 ? Math.round((sub / total) * 100) : 0;
                return (
                  <li key={c}>
                    <div className="flex items-baseline justify-between text-[11.5px]">
                      <span className="text-ink-soft">{CATEGORY_LABEL[c]}</span>
                      <span className="font-medium text-ink">{dollars(sub)}</span>
                    </div>
                    <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-surface-sunken">
                      <div className="h-full bg-brass" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="mt-5 text-[10.5px] text-ink-faint">
            Tip: the Draft tab's <strong>settlement statement</strong> uses these numbers automatically.
          </div>
        </aside>
      </div>

      {adding && (
        <AddItemModal
          matterId={matterId}
          initialCategory={adding}
          docs={docs ?? []}
          onClose={() => setAdding(null)}
          onSave={(p) => {
            create.mutate(p, { onSuccess: () => setAdding(null) });
          }}
          pending={create.isPending}
        />
      )}
    </div>
  );
}

function Empty({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mx-auto mt-10 max-w-md text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brass-wash text-brass-deep">
        <IconExport size={22} />
      </div>
      <h3 className="mt-3 font-display text-[16px] font-semibold text-ink">No line items yet</h3>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
        Add medical bills, lost wage stubs, property loss, future care, and pain & suffering as line items.
        Each one can anchor to a Bates document for proof at trial.
      </p>
      <button
        onClick={onAdd}
        className="mt-3 inline-flex items-center gap-1 rounded-md bg-brass px-3 py-1.5 text-[12.5px] font-semibold text-paper hover:bg-brass-deep"
      >
        <IconAdd size={13} /> Add first item
      </button>
    </div>
  );
}

function Tally({ label, amount, muted = false }: { label: string; amount: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={cx("font-mono text-[10.5px] uppercase tracking-wider", muted ? "text-ink-faint" : "text-ink-soft")}>{label}</span>
      <span className={cx("font-display text-[16px] font-semibold", muted ? "text-ink-soft" : "text-ink")}>{amount}</span>
    </div>
  );
}

function Row({
  item,
  docs,
  onSave,
  onDelete,
}: {
  item: DamagesItem;
  docs: { bates: string; title: string }[];
  onSave: (patch: Parameters<ReturnType<typeof useUpdateDamages>["mutate"]>[0]["patch"]) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(item.description);
  const [amount, setAmount] = useState((item.amountCents / 100).toFixed(2));
  const [multiplier, setMultiplier] = useState(String(item.multiplier));
  const [dateIncurred, setDateIncurred] = useState(item.dateIncurred ?? "");
  const [citationBates, setCitationBates] = useState(item.citationBates ?? "");

  function save() {
    onSave({
      description: description.trim(),
      amountCents: Math.round(Number(amount) * 100) || 0,
      multiplier: Number(multiplier) || 1,
      dateIncurred: dateIncurred || undefined,
      citationBates: citationBates || undefined,
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="rounded-md border border-brass bg-brass-wash px-2.5 py-2">
        <div className="grid grid-cols-[1fr_120px_70px_120px_120px_auto] gap-2 text-[11.5px]">
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="input-row" />
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" className="input-row font-mono text-right" />
          <input value={multiplier} onChange={(e) => setMultiplier(e.target.value)} placeholder="1.0" inputMode="decimal" className="input-row font-mono text-right" title="Multiplier (e.g. 3 for 3× medicals)" />
          <input type="date" value={dateIncurred} onChange={(e) => setDateIncurred(e.target.value)} className="input-row font-mono" />
          <select value={citationBates} onChange={(e) => setCitationBates(e.target.value)} className="input-row font-mono">
            <option value="">No anchor</option>
            {docs.map((d) => (
              <option key={d.bates} value={d.bates}>{d.bates}</option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <button onClick={save} className="rounded bg-brass px-2 py-1 text-[11px] font-semibold text-paper hover:bg-brass-deep">Save</button>
            <button onClick={() => setEditing(false)} className="rounded border border-line bg-surface px-2 py-1 text-[11px] text-ink-soft">Cancel</button>
          </div>
        </div>
        <style>{`.input-row { background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 4px; padding: 4px 6px; outline: none; }
        .input-row:focus { border-color: var(--color-brass); }`}</style>
      </li>
    );
  }

  return (
    <li className="group flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] text-ink" title={item.description}>{item.description}</span>
          {item.citationBates && (
            <span className="rounded border border-brass-soft bg-brass-wash px-1 py-px font-mono text-[9.5px] text-brass-deep" title="Bates anchor">
              {item.citationBates}
            </span>
          )}
        </div>
        {(item.dateIncurred || item.notes) && (
          <div className="mt-0.5 text-[10px] text-ink-faint">
            {item.dateIncurred && <span className="font-mono">{item.dateIncurred}</span>}
            {item.dateIncurred && item.notes && " · "}
            {item.notes && <span>{item.notes}</span>}
          </div>
        )}
      </div>
      <div className="text-right">
        <div className="font-mono text-[12px] text-ink">{dollars(item.amountCents)}</div>
        {item.multiplier !== 1 && (
          <div className="font-mono text-[9.5px] text-brass-deep">×{item.multiplier} = {dollars(effectiveCents(item))}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
        <button onClick={() => setEditing(true)} className="rounded border border-line bg-paper px-1.5 py-0.5 text-[10px] text-ink-soft hover:text-ink">Edit</button>
        <button
          onClick={() => { if (window.confirm("Delete this line item?")) onDelete(); }}
          aria-label="Delete"
        >
          <IconClose size={11} className="text-ink-faint hover:text-danger" />
        </button>
      </div>
    </li>
  );
}

function AddItemModal({
  matterId: _matterId,
  initialCategory,
  docs,
  onClose,
  onSave,
  pending,
}: {
  matterId: string;
  initialCategory: DamagesCategory;
  docs: { bates: string; title: string }[];
  onClose: () => void;
  onSave: (p: {
    category: DamagesCategory;
    description: string;
    amountCents: number;
    multiplier?: number;
    dateIncurred?: string;
    citationBates?: string;
    notes?: string;
  }) => void;
  pending: boolean;
}) {
  const [category, setCategory] = useState<DamagesCategory>(initialCategory);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [multiplier, setMultiplier] = useState(category === "pain_suffering" ? "2.5" : "1");
  const [dateIncurred, setDateIncurred] = useState("");
  const [citationBates, setCitationBates] = useState("");
  const [notes, setNotes] = useState("");

  const ready = description.trim() && Number(amount) > 0;

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-6 py-10">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] max-w-full overflow-hidden rounded-[12px] border border-line bg-surface shadow-[0_40px_120px_rgba(0,0,0,0.45)]"
      >
        <header className="border-b border-line bg-surface-sunken px-5 py-4">
          <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">Damages</div>
          <h3 className="mt-0.5 font-display text-[17px] font-semibold leading-tight text-ink">Add line item</h3>
        </header>
        <div className="space-y-3 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select
                value={category}
                onChange={(e) => {
                  const v = e.target.value as DamagesCategory;
                  setCategory(v);
                  if (v === "pain_suffering" && multiplier === "1") setMultiplier("2.5");
                }}
                className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
              >
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                ))}
              </select>
            </Field>
            <Field label="Date incurred (optional)">
              <input
                type="date"
                value={dateIncurred}
                onChange={(e) => setDateIncurred(e.target.value)}
                className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
              />
            </Field>
          </div>
          <Field label="Description">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Palm Beach Memorial — ER visit + casting"
              className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (USD)">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="3500.00"
                inputMode="decimal"
                className="w-full rounded-md border border-line bg-paper px-2 py-1.5 font-mono text-[12.5px] text-ink outline-none focus:border-brass"
              />
            </Field>
            <Field label="Multiplier (×)">
              <input
                value={multiplier}
                onChange={(e) => setMultiplier(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="1.0"
                inputMode="decimal"
                className="w-full rounded-md border border-line bg-paper px-2 py-1.5 font-mono text-[12.5px] text-ink outline-none focus:border-brass"
                title="Multiplier — e.g. 3 for 3× medicals as P&S"
              />
            </Field>
          </div>
          <Field label="Bates anchor (optional)">
            <select
              value={citationBates}
              onChange={(e) => setCitationBates(e.target.value)}
              className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
            >
              <option value="">No anchor</option>
              {docs.map((d) => (
                <option key={d.bates} value={d.bates}>{d.bates} — {d.title}</option>
              ))}
            </select>
          </Field>
          <Field label="Notes (optional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-16 w-full resize-none rounded-md border border-line bg-paper px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
            />
          </Field>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-sunken px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-soft hover:border-line-strong hover:text-ink">
            Cancel
          </button>
          <button
            onClick={() =>
              onSave({
                category,
                description: description.trim(),
                amountCents: Math.round(Number(amount) * 100),
                multiplier: Number(multiplier) || 1,
                dateIncurred: dateIncurred || undefined,
                citationBates: citationBates || undefined,
                notes: notes || undefined,
              })
            }
            disabled={!ready || pending}
            className="rounded-md bg-brass px-3 py-1.5 text-[12.5px] font-semibold text-paper hover:bg-brass-deep disabled:opacity-50"
          >
            {pending ? "Saving…" : "Add"}
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
