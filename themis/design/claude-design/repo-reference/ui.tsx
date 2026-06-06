import type { ReactNode } from "react";
import { BadgeCheck, ShieldAlert, TriangleAlert } from "lucide-react";
import type { Citation, Confidence, PrivilegeStatus } from "../types";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

const confMeta: Record<Confidence, { label: string; dot: string; text: string }> = {
  high: { label: "High confidence", dot: "bg-verify", text: "text-verify" },
  medium: { label: "Medium confidence", dot: "bg-flag", text: "text-flag" },
  low: { label: "Low confidence", dot: "bg-danger", text: "text-danger" },
};

export function ConfidenceDot({ level, withLabel }: { level: Confidence; withLabel?: boolean }) {
  const m = confMeta[level];
  return (
    <span className="inline-flex items-center gap-1.5" title={m.label}>
      <span className={cx("h-2 w-2 rounded-full", m.dot)} />
      {withLabel && <span className={cx("text-xs font-medium capitalize", m.text)}>{level}</span>}
    </span>
  );
}

export function CitationChip({ c }: { c: Citation }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 align-middle font-mono text-[11px] leading-none",
        c.verified
          ? "border-verify/30 bg-verify-wash text-verify"
          : "border-line-strong bg-surface-sunken text-ink-soft",
      )}
      title={c.verified ? "Citation verified against source page" : "Citation not yet verified"}
    >
      {c.verified && <BadgeCheck size={12} strokeWidth={2.4} />}
      {c.bates}
    </span>
  );
}

const privMeta: Record<
  PrivilegeStatus,
  { label: string; cls: string; icon?: ReactNode } | null
> = {
  none: null,
  flagged: {
    label: "Privilege — review",
    cls: "border-flag/30 bg-flag-wash text-flag",
    icon: <ShieldAlert size={12} strokeWidth={2.2} />,
  },
  withheld: {
    label: "Withheld",
    cls: "border-danger/30 bg-danger-wash text-danger",
    icon: <ShieldAlert size={12} strokeWidth={2.2} />,
  },
  cleared: {
    label: "Cleared",
    cls: "border-verify/30 bg-verify-wash text-verify",
    icon: <BadgeCheck size={12} strokeWidth={2.2} />,
  },
};

export function PrivilegePill({ status }: { status: PrivilegeStatus }) {
  const m = privMeta[status];
  if (!m) return null;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none",
        m.cls,
      )}
    >
      {m.icon}
      {m.label}
    </span>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "brass" | "info" | "verify";
}) {
  const tones = {
    neutral: "border-line-strong bg-surface-sunken text-ink-soft",
    brass: "border-brass-soft bg-brass-wash text-brass-deep",
    info: "border-info/25 bg-info-wash text-info",
    verify: "border-verify/25 bg-verify-wash text-verify",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function HotTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger-wash px-1.5 py-0.5 text-[11px] font-semibold text-danger">
      <TriangleAlert size={12} strokeWidth={2.4} />
      Hot
    </span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(24,34,46,0.04)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-ink-faint">
      {children}
    </div>
  );
}
