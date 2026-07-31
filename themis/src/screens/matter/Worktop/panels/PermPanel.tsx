// PERM panel — the audit-defensible work-product surface. Two checks over the
// matter's documents: "Check audit file" grades completeness against the PERM
// required-exhibit checklist (the BALCA-proof gate — no new evidence allowed on
// appeal, so nothing can be missing at filing), and "Check ETA-9089" cross-
// checks the 9089 / PWD / ads for the inconsistencies that drive audit denials.
// Both never claim an exhibit or value they can't cite to a real document.

import { useMutation } from "@tanstack/react-query";
import { api, type PermAuditReport, type PermAuditRow, type Eta9089Report } from "../../../../lib/api";
import { cx } from "../../../../lib/ui";
import { IconVerified, IconCite, IconBinder } from "../../../../icons";
import { PanelHead, PanelAction } from "./PanelHead";

const STATUS: Record<PermAuditRow["status"], { label: string; text: string; dot: string }> = {
  present: { label: "Present", text: "text-verify", dot: "bg-verify" },
  partial: { label: "Partial", text: "text-flag", dot: "bg-flag" },
  missing: { label: "Missing", text: "text-danger", dot: "bg-danger" },
};
const SEV: Record<"high" | "medium" | "low", string> = {
  high: "bg-danger-wash text-danger",
  medium: "bg-flag-wash text-flag",
  low: "bg-surface-sunken text-ink-faint",
};

export function PermPanel({ matterId }: { matterId: string }) {
  const auditFile = useMutation({ mutationFn: () => api.auditFileCheck(matterId) });
  const eta = useMutation({ mutationFn: () => api.eta9089Check(matterId) });
  const report = auditFile.data;
  const etaReport = eta.data;
  const busy = auditFile.isPending || eta.isPending;
  const idle = !report && !etaReport && !busy && !auditFile.error && !eta.error;

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      <PanelHead
        eyebrow="PERM · Labor Certification"
        title="Audit-proof the file"
        sub="No new evidence is allowed on a PERM appeal — so the file must be complete and consistent before filing. Themis grades both, and never claims an exhibit it can't cite."
        actions={
          <>
            <PanelAction onClick={() => eta.mutate()} disabled={busy}>
              <IconCite size={13} /> {eta.isPending ? "Checking…" : "Check ETA-9089"}
            </PanelAction>
            <PanelAction primary onClick={() => auditFile.mutate()} disabled={busy}>
              <IconVerified size={13} /> {auditFile.isPending ? "Checking…" : "Check audit file"}
            </PanelAction>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {idle && (
          <div className="mx-auto mt-12 max-w-md text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brass-wash text-brass-deep">
              <IconBinder size={22} />
            </div>
            <h3 className="mt-3 font-display text-[17px] font-semibold text-ink">Ready when you are</h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
              Upload the PERM exhibits (PWD, Notice of Filing, the Sunday ads, the SWA order, recruitment
              report, ETA-9089…), then run the checks. <span className="font-medium text-ink">Check audit
              file</span> grades completeness; <span className="font-medium text-ink">Check ETA-9089</span>{" "}
              cross-checks the 9089, PWD, and ads for conflicts.
            </p>
          </div>
        )}

        {auditFile.error && <ErrCard title="Audit-file check failed" error={auditFile.error} />}
        {eta.error && <ErrCard title="ETA-9089 check failed" error={eta.error} />}

        {busy && (
          <div className="grid h-32 place-items-center text-[12.5px] text-ink-soft">
            {auditFile.isPending ? "Grading the audit file…" : "Cross-checking the ETA-9089…"}
          </div>
        )}

        {report && <AuditReport report={report} />}
        {etaReport && <EtaReport report={etaReport} />}
      </div>
    </div>
  );
}

function AuditReport({ report }: { report: PermAuditReport }) {
  return (
    <section className="mb-6">
      <div
        className={cx(
          "flex items-center gap-3 rounded-lg border px-4 py-3",
          report.ready ? "border-verify/40 bg-verify-wash" : "border-danger/40 bg-danger-wash",
        )}
      >
        <div
          className={cx(
            "grid h-9 w-9 shrink-0 place-items-center rounded-full text-paper",
            report.ready ? "bg-verify" : "bg-danger",
          )}
        >
          <IconVerified size={18} />
        </div>
        <div className="min-w-0">
          <div
            className={cx(
              "font-display text-[15px] font-semibold",
              report.ready ? "text-verify" : "text-danger",
            )}
          >
            {report.ready
              ? "BALCA-ready — no required exhibit missing"
              : `${report.highMissing} required exhibit${report.highMissing === 1 ? "" : "s"} still missing`}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-ink-soft">
            {report.present} present · {report.partial} partial · {report.missing} missing · {report.total}{" "}
            required · {report.packLabel}
          </div>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border border-line">
        {report.rows.map((row, i) => {
          const s = STATUS[row.status];
          return (
            <div
              key={i}
              className={cx(
                "flex items-start gap-3 px-4 py-2.5 text-[12.5px]",
                i > 0 && "border-t border-line",
                row.status === "missing" && row.severity === "high" && "bg-danger-wash/40",
              )}
            >
              <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", s.dot)} />
              <div className="min-w-0 flex-1">
                <div className="text-ink">{row.label}</div>
                {row.bates && <div className="mt-0.5 font-mono text-[10.5px] text-brass-deep">cite: {row.bates}</div>}
                {row.note && <div className="mt-0.5 text-[11px] text-ink-faint">{row.note}</div>}
              </div>
              <span className={cx("shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase", SEV[row.severity])}>
                {row.severity}
              </span>
              <span className={cx("w-14 shrink-0 text-right text-[11px] font-medium", s.text)}>{s.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EtaReport({ report }: { report: Eta9089Report }) {
  if (report.clean) {
    return (
      <section className="mb-6">
        <div className="flex items-center gap-3 rounded-lg border border-verify/40 bg-verify-wash px-4 py-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-verify text-paper">
            <IconVerified size={18} />
          </div>
          <div>
            <div className="font-display text-[15px] font-semibold text-verify">ETA-9089 consistent</div>
            <div className="mt-0.5 font-mono text-[11px] text-ink-soft">
              No high-severity conflicts across the 9089, PWD, and ads.
            </div>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="mb-6">
      <div className="mb-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
        ETA-9089 consistency · {report.high} high · {report.total} finding{report.total === 1 ? "" : "s"}
      </div>
      <div className="space-y-2.5">
        {report.findings.map((f, i) => (
          <div key={i} className="rounded-lg border border-line bg-surface px-4 py-3">
            <div className="flex items-center gap-2">
              <span className={cx("rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase", SEV[f.severity])}>
                {f.severity}
              </span>
              <span className="font-display text-[13.5px] font-semibold text-ink">{f.field}</span>
              <span className="font-mono text-[10px] text-ink-faint">
                {f.status === "missing_source" ? "missing source" : "inconsistent"}
              </span>
            </div>
            {f.note && <div className="mt-1 text-[12px] text-ink-soft">{f.note}</div>}
            <div className="mt-2 space-y-1">
              {f.values.map((v, j) => (
                <div key={j} className="flex items-baseline gap-2 text-[12px]">
                  <span className="shrink-0 font-medium text-ink-soft">{v.source}:</span>
                  <span className="min-w-0 text-ink">{v.value}</span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-brass-deep">{v.bates}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ErrCard({ title, error }: { title: string; error: unknown }) {
  return (
    <div className="mb-3 rounded-md border border-danger/30 bg-danger-wash px-3.5 py-2.5 text-[12px] text-danger">
      <div className="font-semibold">{title}</div>
      <div className="mt-0.5">{error instanceof Error ? error.message : String(error)}</div>
    </div>
  );
}
