import { useEffect, useRef, useState } from "react";
import { CitationChip, ConfidenceDot, cx } from "../../../../lib/ui";
import { Tau } from "../../../../components/BrandMark";
import { IconAsk, IconCopy, IconAdd, IconExport, IconCmdK } from "../../../../icons";
import { useAskThemis, useChatHistory } from "../../../../lib/queries";
import type { ChatTurn } from "../../../../types";
import { PanelHead } from "./PanelHead";

const SUGGESTIONS = [
  "What's the timeline between the wage complaint and termination?",
  "Show everything Tom Brandt wrote about Reyes.",
  "What's our strongest evidence of retaliatory motive?",
];

export function AskPanel({ matterId, onOpenCmdK }: { matterId: string; onOpenCmdK: () => void }) {
  const history = useChatHistory(matterId);
  const ask = useAskThemis(matterId);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const turns = history.data ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, ask.isPending]);

  function submit(text: string) {
    const q = text.trim();
    if (!q || ask.isPending) return;
    setDraft("");
    ask.mutate(q);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      <PanelHead
        eyebrow="Ask Themis · Grounded chat"
        title="Ask the brain"
        sub="Every answer is grounded in verified citations. Click any Bates chip to open the source."
        actions={
          <button
            onClick={onOpenCmdK}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-soft hover:border-line-strong hover:text-ink"
          >
            <IconCmdK size={12} className="text-brass" /> ⌘K
          </button>
        }
      />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {turns.length === 0 && !ask.isPending && <FirstRun onPick={submit} />}
        <div className="mx-auto max-w-3xl space-y-5">
          {turns.map((t) => (
            <TurnView key={t.id} turn={t} />
          ))}
          {ask.isPending && <ThinkingBubble />}
        </div>
      </div>
      <InputBar
        value={draft}
        onChange={setDraft}
        onSend={() => submit(draft)}
        disabled={ask.isPending}
      />
    </div>
  );
}

function TurnView({ turn }: { turn: ChatTurn }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[680px] rounded-2xl rounded-tr-sm border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink">
          {turn.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-ink">
        <Tau size={20} tone="ink" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="overflow-hidden rounded-2xl rounded-tl-sm border border-line bg-surface">
          <div className="flex items-center gap-2 border-b border-line bg-brass-wash/40 px-3.5 py-1.5">
            <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-brass-deep">
              Themis
            </span>
            {turn.confidence && <ConfidenceDot level={turn.confidence} withLabel />}
          </div>
          <div className="border-l-2 border-brass px-3.5 py-3 text-[13px] leading-relaxed text-ink">
            {turn.text}
          </div>
          {turn.citations && turn.citations.length > 0 && (
            <div className="border-t border-line bg-surface-sunken/60 px-3.5 py-2.5">
              <div className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-brass-deep">
                grounded in
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {turn.citations.map((c) => (
                  <CitationChip key={`${c.bates}-${c.page}`} c={c} />
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1 text-[11px] text-ink-faint">
          <ActionLink icon={<IconCopy size={12} />}>Copy with citations</ActionLink>
          <ActionLink icon={<IconAdd size={12} />}>Add cited docs to binder</ActionLink>
          <ActionLink icon={<IconExport size={12} />}>Save to brief</ActionLink>
        </div>
      </div>
    </div>
  );
}

function ActionLink({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <button className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-surface-sunken hover:text-ink">
      <span className="text-brass">{icon}</span>
      {children}
    </button>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-ink">
        <Tau size={20} tone="ink" />
      </div>
      <div className="overflow-hidden rounded-2xl rounded-tl-sm border border-line bg-surface px-3.5 py-3">
        <div className="flex items-center gap-1.5">
          <Dot delay={0} />
          <Dot delay={120} />
          <Dot delay={240} />
        </div>
        <div className="mt-1 text-[12px] text-ink-soft">Resolving across the corpus…</div>
        <div className="mt-0.5 text-[10.5px] text-ink-faint">verifying citations · checking privilege wall</div>
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="h-1.5 w-1.5 rounded-full bg-brass"
      style={{ animation: "themis-pulse 1.2s ease-out infinite", animationDelay: `${delay}ms` }}
    />
  );
}

function FirstRun({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-xl border border-dashed border-brass-soft bg-brass-wash/40 px-4 py-3 text-[13px] text-ink-soft">
        Themis answers from the verified evidence in this matter. Try one of these to start, or ask anything:
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] text-ink-soft hover:border-brass-soft hover:text-brass-deep"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function InputBar({
  value,
  onChange,
  onSend,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="shrink-0 border-t border-line bg-surface px-6 py-3">
      <div className={cx(
        "mx-auto flex max-w-3xl items-center gap-2 rounded-[7px] border bg-paper px-3 py-2 transition",
        "focus-within:border-brass focus-within:ring-2 focus-within:ring-brass/20",
        disabled ? "border-line opacity-70" : "border-line-strong",
      )}>
        <span className="font-mono text-[13px] text-brass">›</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Ask anything about this matter…"
          disabled={disabled}
          className="flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
        />
        <div className="hidden items-center gap-2 text-[10px] text-ink-faint md:flex">
          <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono">↵</kbd> send
          <span>·</span>
          <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono">/</kbd> commands
        </div>
        <button
          onClick={onSend}
          disabled={disabled || value.trim().length === 0}
          className="inline-flex items-center gap-1 rounded-md bg-brass px-2.5 py-1 text-[12px] font-semibold text-paper transition hover:bg-brass-deep disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconAsk size={13} /> Ask →
        </button>
      </div>
    </div>
  );
}
