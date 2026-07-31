// Top bar — 56px tall, shared by Worktop and Brain modes.
// Per design handoff §5.1.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Tau } from "../../components/BrandMark";
import { cx } from "../../lib/ui";
import { IconArrow, IconCmdK, IconExport } from "../../icons";
import { useEngineStatus, qk } from "../../lib/queries";
import { useAuth } from "../../lib/auth";
import { api } from "../../lib/api";
import { CollaborateModal } from "../../components/CollaborateModal";
import type { MatterSummary } from "../../types";
import type { AppMode } from "../../lib/router";
import type { Theme } from "../../lib/theme";

interface Props {
  matter: MatterSummary;
  mode: AppMode;
  theme: Theme;
  onMode: (m: AppMode) => void;
  onBack: () => void;
  onOpenCmdK: () => void;
  onToggleTheme: () => void;
}

export function TopBar({ matter, mode, theme, onMode, onBack, onOpenCmdK, onToggleTheme }: Props) {
  const [shareOpen, setShareOpen] = useState(false);
  return (
    <div
      className="relative grid h-14 shrink-0 items-center gap-4 border-b border-line bg-surface px-4"
      style={{ gridTemplateColumns: "minmax(360px, 1fr) auto minmax(260px, 1fr)" }}
    >
      {/* Left: back + brand + matter title */}
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onBack}
          aria-label="Back to matters"
          className="grid h-[30px] w-[30px] place-items-center rounded-md text-ink-soft hover:bg-surface-sunken hover:text-ink"
        >
          <IconArrow direction="left" size={18} />
        </button>
        <Tau size={28} tone={theme === "dark" ? "ink" : "paper"} />
        <div className="hidden flex-col leading-tight md:flex">
          <div className="font-display text-[17px] font-semibold leading-none text-ink">Themis</div>
          <div className="mt-0.5 text-[8.5px] font-medium uppercase tracking-[0.22em] text-brass-deep">
            Evidence Intelligence
          </div>
        </div>
        <div className="mx-2 h-6 w-px bg-line" />
        <div className="min-w-0">
          <div className="truncate font-display text-[17px] font-semibold text-ink">{matter.name}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-soft">
            <StatusPip status={matter.status} />
            <span className="truncate">{matter.matterType}</span>
            <span className="text-ink-faint">·</span>
            <span>Lead {matter.leadAttorney}</span>
          </div>
        </div>
      </div>

      {/* Center: mode toggle */}
      <div className="flex items-center rounded-lg border border-line bg-surface-sunken p-0.5">
        <ModeButton active={mode === "worktop"} onClick={() => onMode("worktop")} glyph="□" label="Worktop" sub="daily" />
        <ModeButton active={mode === "brain"} onClick={() => onMode("brain")} glyph="◉" label="Case Brain" sub="demo" />
      </div>

      {/* Right: cmd-K + theme */}
      <div className="flex items-center justify-end gap-2">
        <EnginePill />
        <MatterMenu matterId={matter.id} onBack={onBack} />
        <button
          onClick={() => setShareOpen(true)}
          title="Invite team or share a scoped read-only view"
          className="inline-flex h-8 items-center gap-1 rounded-md border border-line bg-surface px-2 text-[11.5px] font-medium text-ink-soft hover:border-brass-soft hover:text-brass-deep"
        >
          <IconExport size={12} /> Share
        </button>
        <button
          onClick={onOpenCmdK}
          className="flex h-9 min-w-[260px] items-center gap-2 rounded-full border border-line bg-surface px-3 text-left text-[13px] text-ink-soft transition hover:border-line-strong hover:text-ink"
        >
          <IconCmdK size={14} className="text-brass" />
          <span className="flex-1">Ask anything · jump · run</span>
          <kbd className="rounded border border-line bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">⌘K</kbd>
        </button>
        <button
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          className="grid h-8 w-8 place-items-center rounded-md text-ink-soft hover:bg-surface-sunken hover:text-ink"
        >
          <span className="text-base">{theme === "dark" ? "◑" : "◐"}</span>
        </button>
        <UserPill />
      </div>

      {/* Bottom brass gradient hairline */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-brass-soft/60 to-transparent" />

      {shareOpen && <CollaborateModal matterId={matter.id} onClose={() => setShareOpen(false)} />}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  glyph,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  glyph: string;
  label: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex items-center gap-2 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition",
        active
          ? "bg-brass-wash text-brass-deep shadow-[inset_0_0_0_1px_var(--color-brass-soft)]"
          : "text-ink-soft hover:text-ink",
      )}
    >
      <span className={cx("text-base", active && "text-brass")}>{glyph}</span>
      <span className="flex flex-col items-start leading-none">
        <span>{label}</span>
        <span className="mt-0.5 font-mono text-[8.5px] uppercase tracking-wider text-ink-faint">{sub}</span>
      </span>
    </button>
  );
}

function MatterMenu({ matterId, onBack }: { matterId: string; onBack: () => void }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const archive = useMutation({
    mutationFn: () => api.setMatterArchived(matterId, true),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.matters });
      qc.invalidateQueries({ queryKey: ["archived-matters"] });
      onBack();
    },
  });
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Matter actions"
        className="inline-flex h-8 items-center gap-1 rounded-md border border-line bg-surface px-2 text-[12px] font-medium text-ink-soft hover:border-brass-soft hover:text-brass-deep"
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-56 rounded-lg border border-line bg-surface p-1.5 shadow-[0_24px_64px_-20px_rgba(31,26,20,0.25)]">
            <button
              onClick={() => {
                if (window.confirm("Archive this matter? It'll move to the Archive view; the audit chain + docs stay intact.")) {
                  archive.mutate();
                }
              }}
              disabled={archive.isPending}
              className="block w-full rounded px-2 py-1.5 text-left text-[12.5px] text-ink-soft hover:bg-surface-sunken hover:text-ink disabled:opacity-50"
            >
              {archive.isPending ? "Archiving…" : "Archive matter"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function UserPill() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  if (auth.mode !== "multi-tenant" || !auth.user) return null;
  const initials = auth.user.email.slice(0, 2).toUpperCase();
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={auth.user.email}
        className="grid h-8 w-8 place-items-center rounded-full bg-ink text-[11px] font-semibold text-paper transition hover:bg-ink/85"
      >
        {initials}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-56 rounded-lg border border-line bg-surface p-2 shadow-[0_24px_64px_-20px_rgba(31,26,20,0.25)]">
            <div className="px-2 py-1.5">
              <div className="truncate text-[12.5px] font-medium text-ink">{auth.user.email}</div>
              <div className="mt-0.5 font-mono text-[9.5px] uppercase tracking-wider text-ink-faint">Signed in</div>
            </div>
            <div className="my-1 border-t border-line" />
            <button
              onClick={async () => {
                await api.logout().catch(() => {});
                await auth.refresh();
                setOpen(false);
              }}
              className="block w-full rounded px-2 py-1.5 text-left text-[12.5px] text-ink-soft hover:bg-surface-sunken hover:text-ink"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function StatusPip({ status }: { status: MatterSummary["status"] }) {
  const tone =
    status === "In Review"
      ? "border-verify/30 bg-verify-wash text-verify"
      : status === "Ready"
        ? "border-info/30 bg-info-wash text-info"
        : "border-flag/30 bg-flag-wash text-flag";
  const dot =
    status === "In Review" ? "bg-verify animate-pulse-verify" : status === "Ready" ? "bg-info" : "bg-flag";
  const label = status === "In Review" ? "BRAIN READY" : status === "Ready" ? "READY" : "INGESTING";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em]",
        tone,
      )}
    >
      <span className={cx("h-1.5 w-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

// EnginePill — transparent indicator of whether the chat engine is the
// real Claude API or the deterministic fallback. Reads /api/engine.
// Verify-green when LLM is ready (with the model name as a tooltip);
// flag-amber for deterministic. Reinforces the trust thesis: the user
// always knows which engine answered their question.
function EnginePill() {
  const { data } = useEngineStatus();
  if (!data) return null;
  const isLLM = data.llm;
  // Three states: LLM working, LLM configured but erroring, deterministic.
  // The "LLM err" state is the new one — the key is set, so engine=llm, but
  // every actual call is failing. Show amber so the operator knows something
  // is wrong; tooltip carries the exact error message.
  const hasErr = isLLM && !!data.lastError;
  const cls = hasErr
    ? "border-danger/30 bg-danger-wash text-danger"
    : isLLM
      ? "border-verify/30 bg-verify-wash text-verify"
      : "border-flag/30 bg-flag-wash text-flag";
  const dot = hasErr ? "bg-danger" : isLLM ? "bg-verify" : "bg-flag";
  const label = hasErr ? "ENGINE · LLM ERR" : isLLM ? "ENGINE · LLM" : "ENGINE · LOCAL";
  const title = hasErr
    ? `Chat synthesis failing — falling back to deterministic.\n\nLast error: ${data.lastError}\n\nVisit /api/engine/test for a one-shot probe.`
    : isLLM
      ? `Chat synthesis runs through ${data.model}. Citation entailment uses LLM-as-judge.`
      : "ANTHROPIC_API_KEY not set. Chat runs the deterministic token-overlap engine. Set the key and restart to enable Claude.";
  return (
    <span
      title={title}
      className={cx(
        "hidden items-center gap-1.5 rounded-full border px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] xl:inline-flex",
        cls,
      )}
    >
      <span className={cx("h-1.5 w-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}
