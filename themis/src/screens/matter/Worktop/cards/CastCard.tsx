import { Card, SectionLabel, cx } from "../../../../lib/ui";
import type { Entity } from "../../../../types";

export function CastCard({ entities, onSelect }: { entities: Entity[]; onSelect?: (e: Entity) => void }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <SectionLabel>Cast</SectionLabel>
        <span className="font-mono text-[9.5px] uppercase tracking-wider text-ink-faint">
          {entities.length} {entities.length === 1 ? "person" : "people"}
        </span>
      </div>
      <ul className="-mx-1.5 mt-1 space-y-0.5">
        {entities.map((e) => (
          <li key={e.id}>
            <button
              onClick={() => onSelect?.(e)}
              className={cx(
                "block w-full rounded-md px-1.5 py-1.5 text-left transition hover:bg-brass-wash",
              )}
            >
              <div className="text-[12.5px] font-medium leading-tight text-ink">{e.name}</div>
              <div className="mt-0.5 text-[10.5px] leading-tight text-ink-soft">
                {e.role}
                <span className="ml-1 text-brass">· {e.mentions.toLocaleString()} mentions</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
