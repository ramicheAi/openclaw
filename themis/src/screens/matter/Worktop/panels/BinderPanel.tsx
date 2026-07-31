// Binder panel — exhibit assembly. Drag/drop reorder, inline-edit labels.
// Wires to the binders backend (GET / POST / PATCH / DELETE).

import { useEffect, useRef, useState } from "react";
import { cx } from "../../../../lib/ui";
import {
  IconAdd,
  IconBinder,
  IconClose,
  IconExport,
} from "../../../../icons";
import {
  useAddBinderItem,
  useBinders,
  useCreateBinder,
  useDeleteBinder,
  useDocuments,
  useRemoveBinderItem,
  useRenameBinder,
  useRenameBinderItem,
  useReorderBinder,
} from "../../../../lib/queries";
import { exportBinderPdf } from "../../../../lib/exports";
import type { Binder, BinderItem, DocItem } from "../../../../types";
import { PanelAction, PanelHead } from "./PanelHead";

export function BinderPanel({ matterId, exportsLocked, lockReason, onJumpDoc }: {
  matterId: string;
  exportsLocked: boolean;
  lockReason?: string;
  onJumpDoc?: (docId: string) => void;
}) {
  const { data: binders } = useBinders(matterId);
  const { data: docs } = useDocuments(matterId);
  const createBinder = useCreateBinder(matterId);
  const deleteBinder = useDeleteBinder(matterId);
  const renameBinder = useRenameBinder(matterId);
  const addItem = useAddBinderItem(matterId);
  const removeItem = useRemoveBinderItem(matterId);
  const renameItem = useRenameBinderItem(matterId);
  const reorder = useReorderBinder(matterId);

  const list = binders ?? [];
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = list.find((b) => b.id === activeId) ?? list[0] ?? null;

  // Default selection to first binder.
  useEffect(() => {
    if (!activeId && list[0]) setActiveId(list[0].id);
  }, [activeId, list]);

  function handleNew() {
    const name = window.prompt("Binder name", "Untitled binder");
    if (!name) return;
    createBinder.mutate(name.trim(), {
      onSuccess: (b) => setActiveId(b.id),
    });
  }

  function handleExport() {
    if (!active || exportsLocked) return;
    exportBinderPdf(active);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      <PanelHead
        eyebrow="Binder · Exhibit assembly"
        title={active ? active.name : "Build the binder"}
        sub="Drop documents into named binders to assemble exhibit sets for depo, motion, or trial."
        actions={
          <>
            <PanelAction onClick={handleNew}>
              <IconAdd size={13} /> New binder
            </PanelAction>
            {active && (
              <PanelAction
                primary
                onClick={handleExport}
                disabled={exportsLocked || active.items.length === 0}
              >
                <IconExport size={13} /> Export binder ({active.items.length})
              </PanelAction>
            )}
          </>
        }
      />
      {list.length === 0 ? (
        <EmptyState onCreate={handleNew} />
      ) : (
        <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: "260px 1fr" }}>
          <aside className="min-h-0 overflow-y-auto border-r border-line bg-surface px-2 py-2">
            <ul className="space-y-1">
              {list.map((b) => (
                <li key={b.id}>
                  <BinderRow
                    binder={b}
                    active={b.id === active?.id}
                    onSelect={() => setActiveId(b.id)}
                    onDelete={() => {
                      if (!window.confirm(`Delete binder "${b.name}"?`)) return;
                      deleteBinder.mutate(b.id, {
                        onSuccess: () => {
                          if (b.id === active?.id) setActiveId(null);
                        },
                      });
                    }}
                  />
                </li>
              ))}
            </ul>
          </aside>
          <section className="min-h-0 overflow-y-auto px-6 py-6">
            {active && (
              <Workarea
                binder={active}
                docs={docs ?? []}
                onRename={(name) => renameBinder.mutate({ binderId: active.id, name })}
                onAdd={(docId) => addItem.mutate({ binderId: active.id, docId })}
                onRemoveItem={(itemId) => removeItem.mutate({ binderId: active.id, itemId })}
                onRelabel={(itemId, label) => renameItem.mutate({ binderId: active.id, itemId, label })}
                onReorder={(order) => reorder.mutate({ binderId: active.id, order })}
                onOpenDoc={onJumpDoc}
                exportsLocked={exportsLocked}
                lockReason={lockReason}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function BinderRow({
  binder,
  active,
  onSelect,
  onDelete,
}: {
  binder: Binder;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={cx(
        "group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition",
        active ? "bg-brass-wash text-brass-deep" : "text-ink-soft hover:bg-surface-sunken hover:text-ink",
      )}
    >
      <IconBinder size={14} className={active ? "text-brass" : "text-ink-faint"} />
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{binder.name}</span>
      <span className="font-mono text-[10px] text-ink-faint">{binder.items.length}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label="Delete binder"
        className="invisible grid h-5 w-5 place-items-center rounded text-ink-faint hover:bg-danger-wash hover:text-danger group-hover:visible"
      >
        <IconClose size={11} />
      </button>
    </div>
  );
}

function Workarea({
  binder,
  docs,
  onRename,
  onAdd,
  onRemoveItem,
  onRelabel,
  onReorder,
  onOpenDoc,
  exportsLocked,
  lockReason,
}: {
  binder: Binder;
  docs: DocItem[];
  onRename: (name: string) => void;
  onAdd: (docId: string) => void;
  onRemoveItem: (itemId: string) => void;
  onRelabel: (itemId: string, label: string) => void;
  onReorder: (order: string[]) => void;
  onOpenDoc?: (docId: string) => void;
  exportsLocked: boolean;
  lockReason?: string;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="mx-auto max-w-3xl">
      <InlineEdit
        value={binder.name}
        onCommit={onRename}
        className="font-display text-[26px] font-semibold leading-tight text-ink"
        placeholder="Binder name"
      />
      <div className="mt-1 text-[11.5px] text-ink-faint">
        Created by {binder.createdBy} · {binder.items.length} exhibit{binder.items.length === 1 ? "" : "s"}
      </div>

      {exportsLocked && (
        <div className="mt-3 rounded-lg border border-flag/30 bg-flag-wash/40 px-3 py-2 text-[11.5px] text-flag">
          {lockReason ?? "Exports locked until ingest completes."}
        </div>
      )}

      <ol className="mt-5 space-y-1.5">
        {binder.items.map((item, i) => (
          <ExhibitRow
            key={item.id}
            item={item}
            index={i}
            onRemove={() => onRemoveItem(item.id)}
            onRelabel={(label) => onRelabel(item.id, label)}
            onOpen={onOpenDoc ? () => onOpenDoc(item.docId) : undefined}
            onDragReorder={(toIdx) => {
              if (toIdx === i) return;
              const ids = binder.items.map((x) => x.id);
              const [moved] = ids.splice(i, 1);
              ids.splice(toIdx, 0, moved);
              onReorder(ids);
            }}
          />
        ))}
        {binder.items.length === 0 && (
          <li
            className="grid h-28 place-items-center rounded-xl border-2 border-dashed border-brass-soft text-[12px] text-ink-soft"
            style={{
              background:
                "repeating-linear-gradient(45deg, var(--color-brass-wash) 0 12px, transparent 12px 24px)",
            }}
          >
            Empty binder. Add a document below.
          </li>
        )}
      </ol>

      <div className="mt-4">
        {adding ? (
          <DocPicker
            docs={docs.filter((d) => !binder.items.some((it) => it.docId === d.id))}
            onPick={(id) => {
              onAdd(id);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-line-strong px-3 py-2 text-[12px] text-ink-soft transition hover:border-brass hover:text-brass-deep"
          >
            <IconAdd size={13} /> Add document
          </button>
        )}
      </div>
    </div>
  );
}

function ExhibitRow({
  item,
  index,
  onRemove,
  onRelabel,
  onOpen,
  onDragReorder,
}: {
  item: BinderItem;
  index: number;
  onRemove: () => void;
  onRelabel: (label: string) => void;
  onOpen?: () => void;
  onDragReorder: (toIdx: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [dragOver, setDragOver] = useState<"none" | "before" | "after">("none");

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("text/plain", String(index));
    e.dataTransfer.effectAllowed = "move";
    setDragging(true);
  }
  function handleDragEnd() {
    setDragging(false);
    setDragOver("none");
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    setDragOver(e.clientY < midpoint ? "before" : "after");
  }
  function handleDragLeave() {
    setDragOver("none");
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData("text/plain"));
    if (Number.isNaN(from)) return;
    const toIdx = dragOver === "after" ? index + 1 : index;
    // Account for the source being removed before the target.
    onDragReorder(from < toIdx ? toIdx - 1 : toIdx);
    setDragOver("none");
  }
  return (
    <li
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cx(
        "group relative flex items-center gap-2 rounded-lg border bg-surface px-3 py-2 transition",
        dragging ? "border-brass opacity-50" : "border-line",
      )}
    >
      {/* Drop indicator — a brass hairline above or below the row depending on
       * which half the cursor is in. Lets the user aim drops precisely. */}
      {dragOver === "before" && (
        <span className="pointer-events-none absolute inset-x-2 top-[-2px] h-[2px] rounded-full bg-brass" />
      )}
      {dragOver === "after" && (
        <span className="pointer-events-none absolute inset-x-2 bottom-[-2px] h-[2px] rounded-full bg-brass" />
      )}
      <span className="cursor-grab font-mono text-[11px] text-ink-faint">⋮⋮</span>
      <span className="font-mono text-[11px] font-semibold text-brass">{String(index + 1).padStart(2, "0")}</span>
      <InlineEdit
        value={item.label}
        onCommit={onRelabel}
        className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink"
      />
      <span className="hidden font-mono text-[10.5px] text-ink-faint md:inline">
        {item.bates} · {item.type} · {item.date}
      </span>
      <button
        onClick={onOpen}
        disabled={!onOpen}
        className="text-[10.5px] text-brass hover:underline disabled:cursor-not-allowed disabled:opacity-40"
        title={onOpen ? "Open in Documents" : ""}
      >
        open ›
      </button>
      <button
        onClick={onRemove}
        aria-label="Remove from binder"
        className="invisible grid h-6 w-6 place-items-center rounded text-ink-faint hover:bg-danger-wash hover:text-danger group-hover:visible"
      >
        <IconClose size={12} />
      </button>
    </li>
  );
}

function InlineEdit({
  value,
  onCommit,
  className,
  placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);
  useEffect(() => setDraft(value), [value]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft.trim() && draft !== value) onCommit(draft.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        placeholder={placeholder}
        className={cx(
          "border-b border-brass bg-transparent outline-none placeholder:text-ink-faint",
          className,
        )}
      />
    );
  }
  return (
    <span onDoubleClick={() => setEditing(true)} className={cx("cursor-text", className)}>
      {value}
    </span>
  );
}

function DocPicker({
  docs,
  onPick,
  onCancel,
}: {
  docs: DocItem[];
  onPick: (docId: string) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = docs
    .filter((d) =>
      [d.title, d.bates, d.summary].some((f) => f.toLowerCase().includes(q.toLowerCase())),
    )
    .slice(0, 10);
  return (
    <div className="rounded-lg border border-line bg-surface p-2">
      <div className="flex items-center gap-2 border-b border-line px-1 pb-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a document to add…"
          className="flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-ink-faint"
        />
        <button onClick={onCancel} aria-label="Cancel" className="text-ink-faint hover:text-ink">
          <IconClose size={14} />
        </button>
      </div>
      <ul className="mt-2 max-h-48 overflow-y-auto">
        {filtered.map((d) => (
          <li key={d.id}>
            <button
              onClick={() => onPick(d.id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12.5px] hover:bg-brass-wash"
            >
              <span className="rounded border border-line bg-surface px-1 py-0.5 font-mono text-[10px] text-ink-soft">
                {d.bates}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink">{d.title}</span>
              <span className="font-mono text-[10px] text-ink-faint">{d.date}</span>
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-2 py-1 text-[12px] text-ink-faint">No documents match.</li>
        )}
      </ul>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center px-6 py-10">
      <div className="max-w-md text-center">
        <div
          className="mx-auto grid h-32 w-full max-w-sm place-items-center rounded-xl border-2 border-dashed border-brass-soft/60 text-brass"
          style={{
            background:
              "repeating-linear-gradient(45deg, var(--color-brass-wash) 0 12px, transparent 12px 24px)",
          }}
        >
          <IconBinder size={36} />
        </div>
        <div className="mt-4 font-display text-[18px] font-semibold text-ink">No binders yet</div>
        <p className="mt-1 text-[12.5px] text-ink-soft">
          Build a binder to assemble exhibit sets for depo, motion, or trial.
        </p>
        <button
          onClick={onCreate}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-brass bg-brass px-3 py-1.5 text-[12px] font-semibold text-paper transition hover:bg-brass-deep"
        >
          <IconAdd size={13} /> New binder
        </button>
      </div>
    </div>
  );
}
