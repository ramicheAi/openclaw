import { Card, SectionLabel, cx } from "../../../../lib/ui";
import { IconArrow, IconPending, IconPrivileged } from "../../../../icons";
import type { ChronEvent, DocItem } from "../../../../types";

type Task =
  | { kind: "chron"; id: string; label: string; sub: string; href: string }
  | { kind: "priv"; id: string; label: string; sub: string; href: string };

export function buildTaskQueue(chron: ChronEvent[], priv: DocItem[]): Task[] {
  const chronTasks: Task[] = chron
    .filter((e) => e.accepted === null)
    .map((e) => ({
      kind: "chron",
      id: e.id,
      label: e.description.length > 80 ? e.description.slice(0, 77) + "…" : e.description,
      sub: `${e.date} · ${e.citation.bates}`,
      href: `chronology:${e.id}`,
    }));
  const privTasks: Task[] = priv
    .filter((d) => d.privilege === "flagged")
    .map((d) => ({
      kind: "priv",
      id: d.id,
      label: d.title,
      sub: d.privilegeBasis ?? `Flagged · ${d.bates}`,
      href: `privilege:${d.id}`,
    }));
  return [...privTasks, ...chronTasks];
}

export function TaskQueueCard({
  tasks,
  onGo,
}: {
  tasks: Task[];
  onGo: (kind: "chron" | "priv") => void;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <SectionLabel>Your Queue</SectionLabel>
        <span className="font-mono text-[9.5px] uppercase tracking-wider text-brass-deep">
          {tasks.length} open
        </span>
      </div>
      {tasks.length === 0 ? (
        <EmptyQueue />
      ) : (
        <ul className="-mx-1.5 mt-1 space-y-0.5">
          {tasks.slice(0, 8).map((t) => (
            <li key={`${t.kind}-${t.id}`}>
              <button
                onClick={() => onGo(t.kind)}
                className={cx(
                  "flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left transition",
                  t.kind === "priv" ? "hover:bg-flag-wash" : "hover:bg-brass-wash",
                )}
              >
                <span className={cx("mt-0.5 shrink-0", t.kind === "priv" ? "text-flag" : "text-brass")}>
                  {t.kind === "priv" ? <IconPrivileged size={14} /> : <IconPending size={14} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] leading-tight text-ink">{t.label}</span>
                  <span className="block truncate text-[10.5px] leading-tight text-ink-soft">{t.sub}</span>
                </span>
                <IconArrow size={14} className="mt-0.5 text-ink-faint" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 border-t border-line pt-2 font-mono text-[9.5px] uppercase tracking-wider text-ink-faint">
        A accept · R reject · J/K step
      </div>
    </Card>
  );
}

function EmptyQueue() {
  return (
    <div className="mt-3 flex flex-col items-center gap-2 rounded-lg border border-dashed border-verify/30 bg-verify-wash/40 px-3 py-5 text-center">
      <span className="grid h-9 w-9 place-items-center rounded-full border border-dashed border-verify/40 text-verify">
        ✓
      </span>
      <div className="text-[12.5px] font-medium text-verify">Queue cleared</div>
      <div className="text-[10.5px] text-ink-soft">Every flag has been reviewed.</div>
    </div>
  );
}
