// MatterShell — per-matter chrome: top bar + mode router + Cmd+K + shortcuts.
// Replaces the original tab-shell. Mode + tab live in the URL so views are
// bookmarkable (?matter=…&mode=brain&tab=chronology).

import { useState } from "react";
import { TopBar } from "./TopBar";
import { Worktop } from "./Worktop/Worktop";
import { CaseBrain } from "./Brain/CaseBrain";
import { CommandPalette } from "../../components/CommandPalette";
import { CiteCheckModal } from "../../components/CiteCheckModal";
import { OnboardingTour, shouldShowTour } from "../../components/OnboardingTour";
import { useGlobalShortcuts } from "../../lib/shortcuts";
import { useTheme } from "../../lib/theme";
import type { AppMode, WorktopTab } from "../../lib/router";
import {
  useAskThemis,
  useChronology,
  useDocuments,
  useEntities,
  useMatter,
  useSetChronologyAccepted,
} from "../../lib/queries";

const TAB_ORDER: WorktopTab[] = ["ask", "chronology", "privilege", "binder", "documents", "verify"];

interface Props {
  matterId: string;
  mode: AppMode;
  tab: WorktopTab;
  onMode: (m: AppMode) => void;
  onTab: (t: WorktopTab) => void;
  onBack: () => void;
}

export function MatterShell({ matterId, mode, tab, onMode, onTab, onBack }: Props) {
  const { data: matter } = useMatter(matterId);
  const { data: documents } = useDocuments(matterId);
  const { data: entities } = useEntities(matterId);
  const { data: chron } = useChronology(matterId);
  const ask = useAskThemis(matterId);
  const setAccepted = useSetChronologyAccepted(matterId);
  const [theme, toggleTheme] = useTheme();
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [citeCheckOpen, setCiteCheckOpen] = useState(false);
  // Onboarding tour: auto-fire on first run (no localStorage flag yet).
  // Cmd+K -> "Replay onboarding tour" re-opens it any time.
  const [tourOpen, setTourOpen] = useState<boolean>(() => shouldShowTour());

  function acceptNext() {
    const next = (chron ?? []).find((e) => e.accepted === null);
    if (next) setAccepted.mutate({ eventId: next.id, accepted: true });
  }
  function rejectNext() {
    const next = (chron ?? []).find((e) => e.accepted === null);
    if (next) setAccepted.mutate({ eventId: next.id, accepted: false });
  }

  useGlobalShortcuts({
    onCmdK: () => setCmdkOpen(true),
    onSlash: () => setCmdkOpen(true),
    onCmdD: toggleTheme,
    onTab: (n) => onTab(TAB_ORDER[n - 1]),
    onAccept: tab === "chronology" ? acceptNext : undefined,
    onReject: tab === "chronology" ? rejectNext : undefined,
    onEscape: () => setCmdkOpen(false),
  });

  if (!matter) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center bg-paper text-[12px] text-ink-faint">
        Loading matter…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-paper">
      <TopBar
        matter={matter}
        mode={mode}
        theme={theme}
        onMode={onMode}
        onBack={onBack}
        onOpenCmdK={() => setCmdkOpen(true)}
        onToggleTheme={toggleTheme}
      />
      {mode === "worktop" ? (
        <Worktop
          matterId={matterId}
          tab={tab}
          onTab={onTab}
          onMode={onMode}
          onOpenCmdK={() => setCmdkOpen(true)}
        />
      ) : (
        <CaseBrain matterId={matterId} />
      )}
      <CommandPalette
        open={cmdkOpen}
        onClose={() => setCmdkOpen(false)}
        matterId={matterId}
        mode={mode}
        documents={documents ?? []}
        entities={entities ?? []}
        onTab={(t) => {
          onMode("worktop");
          onTab(t);
        }}
        onMode={onMode}
        onToggleTheme={toggleTheme}
        onOpenDoc={() => {
          onMode("worktop");
          onTab("documents");
        }}
        onAsk={(q) => ask.mutate(q)}
        onCiteCheck={() => {
          setCmdkOpen(false);
          setCiteCheckOpen(true);
        }}
        onReplayTour={() => {
          setCmdkOpen(false);
          setTourOpen(true);
        }}
      />
      <CiteCheckModal
        open={citeCheckOpen}
        matterId={matterId}
        onClose={() => setCiteCheckOpen(false)}
      />
      <OnboardingTour open={tourOpen} onClose={() => setTourOpen(false)} />
    </div>
  );
}
