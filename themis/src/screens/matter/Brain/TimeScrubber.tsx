// TimeScrubber — visible only when Brain mode is in Timeline layout. Drag
// the brass thumb across the 2019–2021 span; canvas nodes appear/disappear
// by date. Per design brief section 5.5: "drag thumb across 2019–2021;
// canvas nodes appear/disappear by date."
//
// Computes its span from the actual dates present in chronology + documents
// so each matter scrubs across its own timeline (Reyes ~2019-2021,
// Mata 2019-2023).

import { useCallback, useMemo, useRef, useState } from "react";
import type { ChronEvent, DocItem } from "../../../types";

interface Props {
  documents: DocItem[];
  chronology: ChronEvent[];
  value: string | null;
  onChange: (date: string) => void;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function pretty(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function TimeScrubber({ documents, chronology, value, onChange }: Props) {
  const { minDate, maxDate, marks } = useMemo(() => {
    const times: number[] = [];
    for (const d of documents) {
      const t = new Date(d.date).getTime();
      if (!Number.isNaN(t)) times.push(t);
    }
    for (const e of chronology) {
      const t = new Date(e.date).getTime();
      if (!Number.isNaN(t)) times.push(t);
    }
    if (times.length === 0) {
      return { minDate: new Date("2019-01-01"), maxDate: new Date("2021-06-01"), marks: [] as { x: number; label: string }[] };
    }
    const min = new Date(Math.min(...times) - 30 * 86400000); // ~1 month pad
    const max = new Date(Math.max(...times) + 30 * 86400000);
    // Year tick marks
    const marks: { x: number; label: string }[] = [];
    for (let y = min.getFullYear(); y <= max.getFullYear(); y++) {
      const t = new Date(`${y}-01-01`).getTime();
      const x = (t - min.getTime()) / (max.getTime() - min.getTime());
      if (x >= 0 && x <= 1) marks.push({ x, label: String(y) });
    }
    return { minDate: min, maxDate: max, marks };
  }, [documents, chronology]);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const cursorMs = value ? new Date(value).getTime() : maxDate.getTime();
  const pct = ((cursorMs - minDate.getTime()) / Math.max(1, maxDate.getTime() - minDate.getTime())) * 100;
  const clampedPct = Math.max(0, Math.min(100, pct));

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const t = minDate.getTime() + p * (maxDate.getTime() - minDate.getTime());
      onChange(fmt(new Date(t)));
    },
    [minDate, maxDate, onChange],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    setFromClientX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setFromClientX(e.clientX);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    setDragging(false);
  };

  return (
    <div className="flex items-center gap-3 border-l border-white/10 pl-3">
      <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-soft">scrub</span>
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="group relative h-6 w-[240px] cursor-ew-resize select-none"
      >
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brass-soft to-brass-light"
            style={{ width: `${clampedPct}%` }}
          />
        </div>
        {marks.map((m, i) => (
          <span
            key={i}
            className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-white/15"
            style={{ left: `${m.x * 100}%` }}
            aria-hidden
          />
        ))}
        {marks.map((m, i) => (
          <span
            key={`l-${i}`}
            className="pointer-events-none absolute bottom-[-12px] -translate-x-1/2 font-mono text-[8.5px] uppercase tracking-wider text-ink-faint"
            style={{ left: `${m.x * 100}%` }}
          >
            {m.label}
          </span>
        ))}
        {/* Thumb */}
        <span
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full border border-brass-deep bg-brass-light shadow-[0_2px_8px_rgba(208,164,90,0.45)]"
          style={{ left: `${clampedPct}%`, width: 12, height: 12 }}
          aria-hidden
        />
      </div>
      <span className="font-mono text-[10px] text-brass-light tabular-nums" title={value ?? ""}>
        {pretty(new Date(cursorMs))}
      </span>
    </div>
  );
}
