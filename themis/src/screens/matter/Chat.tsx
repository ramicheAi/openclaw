import { useState } from "react";
import { ArrowUp, BadgeCheck, ScrollText, Sparkles } from "lucide-react";
import { seedChat } from "../../data/mock";
import { CitationChip, ConfidenceDot, cx } from "../../lib/ui";
import type { ChatTurn } from "../../types";

const suggestions = [
  "Build a timeline of the retaliation theory",
  "What did HR know, and when?",
  "Surface inconsistencies in Tom Brandt's statements",
  "Which documents support a pretext argument?",
];

let nextId = 100;

function answerFor(q: string): ChatTurn {
  return {
    id: `a${nextId++}`,
    role: "themis",
    text:
      `Here's what the corpus supports for "${q.trim()}". The strongest documents are the wage complaint, the performance review that followed it 15 days later, and the separation memo referencing "the complaint situation." Every statement below is grounded in a citation-verified source page.`,
    confidence: "medium",
    citations: [
      { bates: "NW-000847", page: 1, verified: true },
      { bates: "NW-001120", page: 1, verified: true },
      { bates: "NW-001498", page: 1, verified: true },
    ],
  };
}

function Turn({ t }: { t: ChatTurn }) {
  if (t.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-ink px-4 py-2.5 text-[14px] text-paper">
          {t.text}
        </div>
      </div>
    );
  }
  return (
    <div className="animate-fade flex gap-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink text-brass-soft">
        <Sparkles size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] leading-relaxed text-ink">{t.text}</p>
        {t.citations && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-ink-faint">Sources</span>
            {t.citations.map((c) => (
              <CitationChip key={c.bates} c={c} />
            ))}
            {t.confidence && (
              <span className="ml-1 inline-flex items-center gap-1.5">
                <ConfidenceDot level={t.confidence} withLabel />
              </span>
            )}
          </div>
        )}
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-verify">
          <BadgeCheck size={13} />
          All {t.citations?.length ?? 0} citations verified against source pages
        </div>
      </div>
    </div>
  );
}

export function Chat() {
  const [turns, setTurns] = useState<ChatTurn[]>(seedChat);
  const [draft, setDraft] = useState("");

  function send(text: string) {
    const q = text.trim();
    if (!q) return;
    setTurns((prev) => [...prev, { id: `u${nextId++}`, role: "user", text: q }, answerFor(q)]);
    setDraft("");
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6">
            {turns.map((t) => (
              <Turn key={t.id} t={t} />
            ))}
          </div>
        </div>

        <div className="border-t border-line bg-surface px-6 py-4">
          <div className="mx-auto max-w-3xl">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-line bg-surface-sunken px-3 py-1 text-[12px] text-ink-soft transition-colors hover:border-brass-soft hover:text-brass-deep"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-surface p-2 focus-within:border-brass">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
                rows={1}
                placeholder="Ask about this matter — answers cite verified Bates pages"
                className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-[14px] text-ink outline-none placeholder:text-ink-faint"
              />
              <button
                onClick={() => send(draft)}
                disabled={!draft.trim()}
                className={cx(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors",
                  draft.trim()
                    ? "bg-ink text-paper hover:bg-ink/90"
                    : "bg-surface-sunken text-ink-faint",
                )}
              >
                <ArrowUp size={18} strokeWidth={2.4} />
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-ink-faint">
              Themis assists; it does not decide. Verify before relying on any output.
            </p>
          </div>
        </div>
      </div>

      {/* Audit sidebar */}
      <aside className="hidden w-72 shrink-0 flex-col border-l border-line bg-surface xl:flex">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <ScrollText size={15} className="text-ink-soft" />
          <span className="text-[12px] font-semibold text-ink">Audit trail</span>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4 text-[12px]">
          {[
            ["10:42", "Query: time between complaint and termination"],
            ["10:42", "Retrieved 6 docs (hybrid + rerank)"],
            ["10:42", "3 citations verified, 0 rejected"],
            ["10:41", "Chronology row NW-001120 accepted by D. Okafor"],
            ["10:38", "Privilege flag added: NW-002310"],
          ].map(([t, e], i) => (
            <div key={i} className="flex gap-2">
              <span className="font-mono text-ink-faint">{t}</span>
              <span className="text-ink-soft">{e}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-line p-3 text-[11px] leading-relaxed text-ink-faint">
          Every query and edit is logged and replayable for this matter.
        </div>
      </aside>
    </div>
  );
}
