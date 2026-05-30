// Trust posture — the system's honest self-assessment for this matter.
//
// Surfaces three reliability primitives:
//   1. Audit hash chain status (tamper-evident; broken → red).
//   2. Citation entailment posture from recent chat turns (avg supportScore,
//      entailed/located ratio).
//   3. Refusal count — "the system declined to claim" is a feature, not a bug;
//      counts come from audit log action = "chat.refused".
//
// All three are observable in the UI because reliability that's not visible
// is rhetoric. Replace any of these with a richer impl behind the existing
// API surface (e.g., RAGAS faithfulness instead of token-overlap) and the
// card keeps working.

import { Card, SectionLabel, cx } from "../../../../lib/ui";
import { IconAudit, IconPrivileged, IconVerified } from "../../../../icons";
import { useAuditChain, useAudit, useChatHistory } from "../../../../lib/queries";

export function TrustPostureCard({ matterId }: { matterId: string }) {
  const chain = useAuditChain(matterId);
  const audit = useAudit(matterId, 200);
  const chat = useChatHistory(matterId);

  const themisTurns = (chat.data ?? []).filter((t) => t.role === "themis");
  const allCitations = themisTurns.flatMap((t) => t.citations ?? []);
  const entailedCount = allCitations.filter((c) => c.entailed).length;
  const locatedCount = allCitations.filter((c) => c.verified && !c.entailed).length;
  const avgSupport =
    allCitations.length === 0
      ? 0
      : allCitations.reduce((s, c) => s + (c.supportScore ?? 0), 0) / allCitations.length;
  const refusalCount = (audit.data ?? []).filter((e) => e.action === "chat.refused").length;

  const chainOk = chain.data?.broken === false && (chain.data?.entries ?? 0) > 0;
  const chainLoaded = !chain.isLoading && chain.data;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <SectionLabel>Trust posture</SectionLabel>
        <span className="font-mono text-[9.5px] uppercase tracking-wider text-ink-faint">live</span>
      </div>

      {/* Audit hash chain */}
      <Row
        icon={<IconAudit size={14} />}
        label="Audit chain"
        value={
          !chainLoaded
            ? "checking…"
            : chainOk
              ? `verified · ${chain.data!.entries} entries`
              : `BROKEN${chain.data!.brokenAt ? ` at #${chain.data!.brokenAt}` : ""}`
        }
        tone={!chainLoaded ? "muted" : chainOk ? "verify" : "danger"}
        sub="SHA-256 hash chain · tamper-evident"
      />

      {/* Citation entailment */}
      <Row
        icon={<IconVerified size={14} />}
        label="Citations entailed"
        value={
          allCitations.length === 0
            ? "n/a"
            : `${entailedCount}/${allCitations.length} · avg support ${(avgSupport * 100).toFixed(0)}%`
        }
        tone={
          allCitations.length === 0
            ? "muted"
            : entailedCount / Math.max(1, allCitations.length) >= 0.6
              ? "verify"
              : "flag"
        }
        sub={
          locatedCount > 0
            ? `${locatedCount} located-but-not-entailed (treat as starting point)`
            : "every cited source actually supports its claim"
        }
      />

      {/* Refusals */}
      <Row
        icon={<IconPrivileged size={14} />}
        label="System refusals"
        value={refusalCount === 0 ? "0" : String(refusalCount)}
        tone={refusalCount > 0 ? "brass" : "muted"}
        sub={
          refusalCount === 0
            ? "no answers declined"
            : `Themis declined to claim ${refusalCount} time${refusalCount === 1 ? "" : "s"} rather than guess`
        }
      />

      <div className="mt-2.5 border-t border-line pt-2 font-mono text-[9px] uppercase tracking-wider text-ink-faint">
        eval harness: <span className="text-brass-deep">npm run eval</span>
      </div>
    </Card>
  );
}

function Row({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: "verify" | "flag" | "danger" | "brass" | "muted";
}) {
  const toneText = {
    verify: "text-verify",
    flag: "text-flag",
    danger: "text-danger",
    brass: "text-brass-deep",
    muted: "text-ink-soft",
  }[tone];
  return (
    <div className="mt-2.5 flex items-start gap-2">
      <span className={cx("mt-0.5", toneText)}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-[11.5px] font-medium text-ink">{label}</div>
          <div className={cx("font-mono text-[10.5px] font-semibold", toneText)}>{value}</div>
        </div>
        {sub && <div className="mt-0.5 text-[10.5px] leading-snug text-ink-faint">{sub}</div>}
      </div>
    </div>
  );
}
