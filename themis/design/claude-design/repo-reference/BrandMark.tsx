import { Scale } from "lucide-react";
import { cx } from "../lib/ui";

export function BrandMark({ size = "md" }: { size?: "sm" | "md" }) {
  const dims = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={cx(
          "grid place-items-center rounded-lg bg-ink text-brass-soft shadow-sm",
          dims,
        )}
      >
        <Scale size={size === "sm" ? 17 : 19} strokeWidth={2} />
      </div>
      <div className="leading-none">
        <div className="font-display text-[19px] font-semibold text-ink">Themis</div>
        <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-ink-faint">
          Evidence Intelligence
        </div>
      </div>
    </div>
  );
}
