// Slide-in inspector — opens when a node in the Brain canvas is clicked.
// Shows the real record (document body, entity dossier, event + citation).

import { CitationChip, ConfidenceDot, HotTag, PrivilegePill, cx } from "../../../lib/ui";
import { IconClose } from "../../../icons";
import type { GraphNode } from "../../../lib/graph";

export function Inspector({ node, onClose }: { node: GraphNode | null; onClose: () => void }) {
  const open = !!node;
  return (
    <div
      className={cx(
        "absolute right-0 top-0 z-20 h-full w-[380px] border-l text-ink transition-transform duration-200",
        "border-[color-mix(in_srgb,var(--color-line)_60%,transparent)]",
        "bg-[color-mix(in_srgb,var(--color-surface)_94%,transparent)]",
        "backdrop-blur-[20px] backdrop-saturate-150",
        open ? "translate-x-0" : "translate-x-full",
      )}
      aria-hidden={!open}
    >
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
        <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-soft">
          Inspector
        </span>
        <button
          onClick={onClose}
          aria-label="Close inspector"
          className="grid h-7 w-7 place-items-center rounded-md text-ink-soft hover:bg-white/5 hover:text-ink"
        >
          <IconClose size={14} />
        </button>
      </div>
      {node && (
        <div className="h-[calc(100%-44px)] overflow-y-auto px-4 py-3">
          {node.kind === "doc" && node.doc && <DocBody node={node} />}
          {node.kind === "event" && node.event && <EventBody node={node} />}
          {node.kind === "entity" && node.entity && <EntityBody node={node} />}
          {(node.kind === "claim" || node.kind === "defense") && (
            <div>
              <Eyebrow>{node.kind === "claim" ? "Plaintiff claim" : "Defense theory"}</Eyebrow>
              <div className="mt-1 font-display text-[16px] font-semibold leading-snug">{node.label}</div>
              <div className="mt-2 text-[12px] text-ink-soft">
                Drag a chronology event into this claim from the Worktop to bind it to the case theory.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-soft">
      {children}
    </div>
  );
}

function DocBody({ node }: { node: GraphNode }) {
  const d = node.doc!;
  return (
    <article>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded border border-brass-soft/40 bg-brass-wash/10 px-1.5 py-0.5 font-mono text-[10px] text-brass-light">
          {d.bates}
        </span>
        {d.hot && <HotTag />}
        <PrivilegePill status={d.privilege} />
        <span className="ml-auto font-mono text-[10px] text-ink-faint">{d.date}</span>
      </div>
      <h3 className="mt-2 font-display text-[16px] font-semibold leading-snug">{d.title}</h3>
      <div className="mt-2 grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 text-[11px]">
        <Field label="From">{d.author}</Field>
        <Field label="To">{d.recipients.join(", ")}</Field>
        <Field label="Type">{d.type}</Field>
        <Field label="OCR">{d.ocrConfidence}</Field>
      </div>
      {d.privilege === "flagged" || d.privilege === "withheld" ? (
        <div
          className="mt-3 rounded border-l-2 border-flag px-3 py-3 text-[11px] italic text-flag"
          style={{ background: "repeating-linear-gradient(45deg, rgba(176,106,18,0.12) 0 8px, transparent 8px 16px)" }}
        >
          Privilege wall — body withheld from non-privileged workspace.
          {d.privilegeBasis && <div className="mt-1 not-italic text-[10.5px]">{d.privilegeBasis}</div>}
        </div>
      ) : (
        <pre className="mt-3 max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded border-l-2 border-brass bg-surface-sunken px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-ink">
          {d.body}
        </pre>
      )}
      <p className="mt-3 text-[11.5px] leading-relaxed text-ink-soft">{d.summary}</p>
    </article>
  );
}

function EventBody({ node }: { node: GraphNode }) {
  const e = node.event!;
  return (
    <article>
      <Eyebrow>Chronology event</Eyebrow>
      <div className="mt-1 font-mono text-[11px] text-brass-light">{e.date}</div>
      <p className="mt-1.5 text-[13px] leading-relaxed">{e.description}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <ConfidenceDot level={e.confidence} withLabel />
        <CitationChip c={e.citation} />
      </div>
      {e.issueTags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {e.issueTags.map((t) => (
            <span
              key={t}
              className="rounded-full border border-brass-soft/40 bg-brass-wash/10 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-brass-light"
            >
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 text-[11px] text-ink-soft">
        Status:{" "}
        <span className={cx(e.accepted === true ? "text-verify" : e.accepted === false ? "text-danger" : "text-flag")}>
          {e.accepted === true ? "On timeline" : e.accepted === false ? "Excluded" : "Draft (review in Chronology tab)"}
        </span>
      </div>
    </article>
  );
}

function EntityBody({ node }: { node: GraphNode }) {
  const e = node.entity!;
  return (
    <article>
      <Eyebrow>Entity</Eyebrow>
      <h3 className="mt-1 font-display text-[18px] font-semibold leading-snug">{e.name}</h3>
      <div className="mt-0.5 text-[11.5px] text-ink-soft">
        {e.role} · {e.org}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3 text-[11px]">
        <div>
          <Eyebrow>Mentions</Eyebrow>
          <div className="mt-0.5 font-display text-[20px] font-semibold text-brass-light">{e.mentions.toLocaleString()}</div>
        </div>
        <div>
          <Eyebrow>First seen</Eyebrow>
          <div className="mt-0.5 font-mono text-[11px] text-brass-light">{e.firstSeen}</div>
        </div>
      </div>
      {e.aliases.length > 0 && (
        <div className="mt-3">
          <Eyebrow>Aliases</Eyebrow>
          <div className="mt-0.5 text-[11.5px] text-ink-soft">{e.aliases.join(", ")}</div>
        </div>
      )}
      {e.relationships.length > 0 && (
        <div className="mt-3">
          <Eyebrow>Relationships</Eyebrow>
          <ul className="mt-1 space-y-1 text-[11.5px]">
            {e.relationships.map((r) => (
              <li key={r.name}>
                <span className="font-medium text-ink">{r.name}</span>
                <span className="text-ink-soft"> — {r.relation}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="font-mono text-[9px] font-semibold uppercase tracking-wider text-ink-faint">{label}</div>
      <div className="text-ink">{children}</div>
    </>
  );
}
