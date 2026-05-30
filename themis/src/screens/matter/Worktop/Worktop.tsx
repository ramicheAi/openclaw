// Worktop — the 3-pane daily work surface. Per design handoff §3 + §5.2–5.4.

import { useState } from "react";
import { useMatter, useEntities, useChronology, usePrivilegeQueue, useAudit } from "../../../lib/queries";
import { exportLockForMatter } from "../../../lib/exports";
import { EntityDossier } from "./EntityDossier";
import type { Entity } from "../../../types";
import type { WorktopTab, AppMode } from "../../../lib/router";
import { CaseSnapshotCard } from "./cards/CaseSnapshotCard";
import { CastCard } from "./cards/CastCard";
import { CompactBrainCard } from "./cards/CompactBrainCard";
import { TaskQueueCard, buildTaskQueue } from "./cards/TaskQueueCard";
import { ScalesMini } from "./cards/ScalesMini";
import { AuditTrailCard } from "./cards/AuditTrailCard";
import { TrustPostureCard } from "./cards/TrustPostureCard";
import { TabBar } from "./panels/TabBar";
import { AskPanel } from "./panels/AskPanel";
import { ChronologyPanel } from "./panels/ChronologyPanel";
import { PrivilegePanel } from "./panels/PrivilegePanel";
import { BinderPanel } from "./panels/BinderPanel";
import { DocumentsPanel } from "./panels/DocumentsPanel";

export function Worktop({
  matterId,
  tab,
  onTab,
  onMode,
  onOpenCmdK,
}: {
  matterId: string;
  tab: WorktopTab;
  onTab: (t: WorktopTab) => void;
  onMode: (m: AppMode) => void;
  onOpenCmdK: () => void;
}) {
  const { data: matter } = useMatter(matterId);
  const { data: entities } = useEntities(matterId);
  const { data: chron } = useChronology(matterId);
  const { data: priv } = usePrivilegeQueue(matterId);
  const { data: audit } = useAudit(matterId, 10);

  const [dossier, setDossier] = useState<Entity | null>(null);

  if (!matter) return <LoadingFrame />;

  const tasks = buildTaskQueue(chron ?? [], priv ?? []);
  const pendingChron = (chron ?? []).filter((e) => e.accepted === null).length;
  const flaggedPriv = (priv ?? []).filter((d) => d.privilege === "flagged").length;
  const lock = exportLockForMatter(matter);

  return (
    <div
      className="relative grid min-h-0 flex-1"
      style={{ gridTemplateColumns: "340px minmax(0, 1fr) 320px" }}
    >
      {/* Left rail */}
      <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto border-r border-line bg-paper px-3 py-3">
        <CompactBrainCard matter={matter} onOpen={() => onMode("brain")} />
        <CaseSnapshotCard matter={matter} />
        <CastCard entities={entities ?? []} onSelect={setDossier} />
      </aside>

      {/* Center column */}
      <div className="flex min-h-0 min-w-0 flex-col bg-paper">
        <TabBar
          active={tab}
          onChange={onTab}
          badges={{ chronology: pendingChron, privilege: flaggedPriv }}
        />
        <div className="min-h-0 flex-1">
          {tab === "ask" && <AskPanel matterId={matterId} onOpenCmdK={onOpenCmdK} />}
          {tab === "chronology" && (
            <ChronologyPanel
              matterId={matterId}
              exportsLocked={!!lock}
              lockReason={lock?.reason}
            />
          )}
          {tab === "privilege" && (
            <PrivilegePanel
              matterId={matterId}
              exportsLocked={!!lock}
              lockReason={lock?.reason}
            />
          )}
          {tab === "binder" && (
            <BinderPanel
              matterId={matterId}
              exportsLocked={!!lock}
              lockReason={lock?.reason}
            />
          )}
          {tab === "documents" && <DocumentsPanel matterId={matterId} />}
        </div>
      </div>

      {/* Right rail */}
      <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto border-l border-line bg-paper px-3 py-3">
        <TaskQueueCard
          tasks={tasks}
          onGo={(kind) => onTab(kind === "priv" ? "privilege" : "chronology")}
        />
        <ScalesMini events={chron ?? []} />
        <TrustPostureCard matterId={matterId} />
        <AuditTrailCard entries={audit ?? []} />
      </aside>

      <EntityDossier entity={dossier} onClose={() => setDossier(null)} />
    </div>
  );
}

function LoadingFrame() {
  return (
    <div className="grid min-h-0 flex-1 place-items-center bg-paper">
      <div className="text-[12px] text-ink-faint">Loading matter…</div>
    </div>
  );
}
