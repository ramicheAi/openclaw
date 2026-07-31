import type { ReactNode } from "react";
import { cx } from "../../../../lib/ui";

export function PanelHead({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-4 border-b border-line bg-surface px-6 pb-3 pt-5">
      <div className="min-w-0">
        <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
          {eyebrow}
        </div>
        <h2 className="mt-1 font-display text-[22px] font-semibold leading-tight text-ink">{title}</h2>
        {sub && <p className="mt-1 max-w-2xl text-[12.5px] text-ink-soft">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function PanelAction({
  children,
  onClick,
  primary = false,
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        primary
          ? "border-brass bg-brass text-paper hover:bg-brass-deep"
          : "border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
