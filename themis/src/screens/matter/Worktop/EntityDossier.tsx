// Entity dossier — slide-in panel over the Worktop. Per design brief
// section 5.2c and sprint 3 ("Entity dossier panel"). Shows the entity's
// header, key stats, aliases, relationships, every document they appear
// in (with hot/privilege state), and a one-click "open in Documents" CTA
// that drops the user into the filtered Documents tab.

import { useMemo, useState } from "react";
import { Card, SectionLabel, HotTag, PrivilegePill, cx } from "../../../lib/ui";
import { IconClose, IconEntity, IconChron } from "../../../icons";
import { useDocuments } from "../../../lib/queries";
import { DepositionOutlineModal } from "../../../components/DepositionOutlineModal";
import type { Entity } from "../../../types";

interface Props {
  entity: Entity | null;
  matterId: string;
  onClose: () => void;
  onJumpDocuments?: (entityName: string) => void;
}

export function EntityDossier({ entity, matterId, onClose, onJumpDocuments }: Props) {
  const { data: docs } = useDocuments(matterId);
  const [depoFor, setDepoFor] = useState<string | null>(null);
  const open = !!entity;
  const docsByEntity = useMemo(() => {
    if (!entity || !docs) return [];
    const names = new Set<string>([entity.name, ...entity.aliases]);
    return docs.filter((d) => d.entities.some((e) => names.has(e)));
  }, [docs, entity]);
  return (
    <div
      className={cx(
        "absolute right-0 top-0 z-30 h-full w-[380px] border-l border-line bg-surface shadow-[-12px_0_24px_-12px_rgba(24,34,46,0.18)] transition-transform duration-200",
        open ? "translate-x-0" : "translate-x-full",
      )}
      aria-hidden={!open}
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <IconEntity size={16} className="text-brass" />
          <SectionLabel>Entity dossier</SectionLabel>
        </div>
        <button
          onClick={onClose}
          aria-label="Close dossier"
          className="grid h-7 w-7 place-items-center rounded-md text-ink-soft hover:bg-surface-sunken hover:text-ink"
        >
          <IconClose size={14} />
        </button>
      </header>
      {entity && (
        <div className="h-[calc(100%-49px)] overflow-y-auto px-4 py-4">
          <h3 className="font-display text-[22px] font-semibold leading-tight text-ink">{entity.name}</h3>
          <div className="mt-1 text-[12.5px] text-ink-soft">
            {entity.role}
            {entity.org && entity.org !== "—" ? <> · {entity.org}</> : null}
          </div>
          <button
            onClick={() => setDepoFor(entity.name)}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-brass bg-brass px-3 py-2 text-[12.5px] font-semibold text-paper transition hover:bg-brass-deep"
          >
            <IconChron size={13} /> Build deposition outline
          </button>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="Mentions" value={entity.mentions.toLocaleString()} />
            <Stat label="First seen" value={entity.firstSeen} mono />
          </div>
          {entity.aliases.length > 0 && (
            <Card className="mt-3 p-3">
              <SectionLabel>Aliases</SectionLabel>
              <div className="text-[12.5px] text-ink">{entity.aliases.join(", ")}</div>
            </Card>
          )}
          {entity.relationships.length > 0 && (
            <Card className="mt-3 p-3">
              <SectionLabel>Relationships</SectionLabel>
              <ul className="space-y-1.5">
                {entity.relationships.map((r) => (
                  <li key={r.name} className="text-[12.5px]">
                    <span className="font-medium text-ink">{r.name}</span>
                    <span className="text-ink-soft"> — {r.relation}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Documents this entity appears in — the workhorse view that turns
           * a dossier into a navigation surface. */}
          {docsByEntity.length > 0 && (
            <Card className="mt-3 p-3">
              <div className="flex items-baseline justify-between">
                <SectionLabel>Appears in</SectionLabel>
                <span className="font-mono text-[10px] text-ink-faint">{docsByEntity.length} docs</span>
              </div>
              <ul className="mt-1 max-h-[260px] space-y-1 overflow-y-auto">
                {docsByEntity.slice(0, 16).map((d) => (
                  <li key={d.id}>
                    <div className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[12px] hover:bg-surface-sunken">
                      <span className="rounded border border-line bg-surface px-1 py-0.5 font-mono text-[9.5px] text-ink-soft">
                        {d.bates}
                      </span>
                      {d.hot && <HotTag />}
                      <PrivilegePill status={d.privilege} />
                      <span className="ml-1 min-w-0 flex-1 truncate text-ink" title={d.title}>
                        {d.title}
                      </span>
                      <span className="font-mono text-[9.5px] text-ink-faint">{d.date}</span>
                    </div>
                  </li>
                ))}
              </ul>
              {onJumpDocuments && (
                <button
                  onClick={() => onJumpDocuments(entity.name)}
                  className="mt-2 inline-flex items-center gap-1 rounded-md border border-brass-soft bg-brass-wash px-2 py-1 text-[11px] font-semibold text-brass-deep hover:border-brass"
                >
                  Open Documents filtered to this entity ›
                </button>
              )}
            </Card>
          )}
        </div>
      )}
      {depoFor && (
        <DepositionOutlineModal matterId={matterId} witness={depoFor} onClose={() => setDepoFor(null)} />
      )}
    </div>
  );
}

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <Card className="p-3">
      <SectionLabel>{label}</SectionLabel>
      <div
        className={cx(
          "leading-none text-ink",
          mono ? "mt-1 font-mono text-[13px]" : "mt-1 font-display text-[22px] font-semibold",
        )}
      >
        {value}
      </div>
    </Card>
  );
}
