// Entity dossier — slide-in panel over the Worktop. Reuses the Inspector
// content but rendered in the paper/ink theme to live in the Worktop layer.

import { Card, SectionLabel, cx } from "../../../lib/ui";
import { IconClose, IconEntity } from "../../../icons";
import type { Entity } from "../../../types";

export function EntityDossier({ entity, onClose }: { entity: Entity | null; onClose: () => void }) {
  const open = !!entity;
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
        </div>
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
