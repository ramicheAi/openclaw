import { GitBranch, Quote, User } from "lucide-react";
import { entities } from "../../data/mock";
import { Card, SectionLabel } from "../../lib/ui";

export function Entities() {
  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">Cast of characters</h2>
          <span className="text-[12px] text-ink-faint">
            {entities.length} key entities · resolved across aliases
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {entities.map((e) => (
            <Card key={e.id} className="p-5">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-sm font-semibold text-paper">
                  {e.name
                    .split(" ")
                    .map((p) => p[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-[16px] font-semibold text-ink">{e.name}</h3>
                  <div className="text-[13px] text-ink-soft">{e.role}</div>
                  <div className="text-[12px] text-ink-faint">{e.org}</div>
                </div>
                <div className="text-right">
                  <div className="inline-flex items-center gap-1 text-[12px] font-medium text-brass-deep">
                    <Quote size={12} /> {e.mentions.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-ink-faint">mentions</div>
                </div>
              </div>

              {e.aliases.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-ink-faint">Aliases</span>
                  {e.aliases.map((a) => (
                    <span
                      key={a}
                      className="rounded border border-line bg-surface-sunken px-1.5 py-0.5 text-[11px] text-ink-soft"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 border-t border-line pt-3">
                <SectionLabel>Relationships</SectionLabel>
                <ul className="space-y-1.5">
                  {e.relationships.map((r) => (
                    <li key={r.name} className="flex items-center gap-2 text-[13px]">
                      <GitBranch size={13} className="text-ink-faint" />
                      <span className="text-ink-soft">{r.relation}</span>
                      <span className="font-medium text-ink">{r.name}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-faint">
                <User size={12} /> First seen in{" "}
                <span className="font-mono text-ink-soft">{e.firstSeen}</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
