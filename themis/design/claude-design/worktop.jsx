/* global React */
// Worktop — the daily work layout.
// Left rail: compact brain (always alive, no chrome) + entity quick-list
// Center: work panel (Ask / Chronology / Privilege / Binder / Documents)
// Right rail: task queue + scales meter + audit ticker

(function () {
  const { useState, useEffect } = React;
  const T = () => window.THEMIS;

  const TAB_DEFS = [
    { id: "ask",        label: "Ask Themis",   shortcut: "1" },
    { id: "chronology", label: "Chronology",   shortcut: "2" },
    { id: "privilege",  label: "Privilege",    shortcut: "3" },
    { id: "binder",     label: "Binder",       shortcut: "4" },
    { id: "documents",  label: "Documents",    shortcut: "5" },
  ];

  function pendingCount() {
    return T().chronology.filter(c => c.accepted === null).length;
  }
  function privCount() {
    return T().documents.filter(d => d.privilege === "flagged").length;
  }

  window.Worktop = function Worktop({
    activeTab, onTab,
    selectedDoc, onJumpDoc, onJumpId,
    jumpToDoc,  // Bates string to land on in Documents panel
    onAddToBinder,
    onTouchData,
  }) {
    const data = T();

    // Compact brain — uses the same Brain component, just sized small + no labels
    const brainProps = {
      filter: "all",
      onSelectNode: (n) => onJumpId && onJumpId(n.id),
      paused: false,
      layout: "force",
      causalHighlight: false,
      showLabels: false,
    };

    return (
      <div className="worktop">
        {/* LEFT RAIL — compact brain + entities */}
        <aside className="worktop-left">
          <div className="wt-brain-card">
            <div className="wt-brain-h">
              <span className="wt-brain-eyebrow">CASE BRAIN</span>
              <a href="#" className="wt-brain-open" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('themis-mode', { detail: 'brain' })); }}>open ›</a>
            </div>
            <div className="wt-brain-canvas">
              <window.Brain {...brainProps} />
            </div>
            <div className="wt-brain-foot">
              <span className="font-mono">11,920</span> docs · <span className="font-mono">84,213</span> pg · ingest 100%
            </div>
          </div>

          <CaseSnapshot />
          <EntitiesQuickList onJumpId={onJumpId} />
        </aside>

        {/* CENTER — tabs + active panel */}
        <section className="worktop-center">
          <nav className="wt-tabs">
            {TAB_DEFS.map((t) => {
              const badge = t.id === "chronology" ? pendingCount() : t.id === "privilege" ? privCount() : 0;
              return (
                <button
                  key={t.id}
                  className={"wt-tab " + (activeTab === t.id ? "active" : "")}
                  onClick={() => onTab(t.id)}
                >
                  <span className="wt-tab-num font-mono">{t.shortcut}</span>
                  {t.label}
                  {badge > 0 && <span className="wt-tab-badge">{badge}</span>}
                </button>
              );
            })}
            <div className="wt-tabs-spacer"></div>
            <div className="wt-tabs-hint">
              <span className="font-mono">⌘K</span> commands · <span className="font-mono">⌘1-5</span> tabs
            </div>
          </nav>
          <div className="wt-panel-wrap">
            {activeTab === "ask"        && <window.AskPanel onJumpDoc={onJumpDoc} onAddToBinder={onAddToBinder} />}
            {activeTab === "chronology" && <window.ChronologyPanel onJumpDoc={onJumpDoc} onTouch={onTouchData} />}
            {activeTab === "privilege"  && <window.PrivilegePanel  onJumpDoc={onJumpDoc} onTouch={onTouchData} />}
            {activeTab === "binder"     && <window.BinderPanel     onJumpDoc={onJumpDoc} />}
            {activeTab === "documents"  && <window.DocumentsPanel  jumpTo={jumpToDoc} onJumpDoc={onJumpDoc} />}
          </div>
        </section>

        {/* RIGHT RAIL — task queue + scales + audit */}
        <aside className="worktop-right">
          <TaskQueue onTab={onTab} />
          <ScalesMini />
          <AuditTickerMini />
        </aside>
      </div>
    );
  };

  function CaseSnapshot() {
    const data = T();
    return (
      <section className="wt-card">
        <div className="wt-card-h">
          <span className="wt-card-eyebrow">CASE</span>
          <span className="wt-card-meta font-mono">{data.matter.status}</span>
        </div>
        <div className="wt-case-name font-display">{data.matter.name}</div>
        <div className="wt-case-sub">{data.matter.matterType}</div>
        <div className="wt-case-theory">
          <div className="wt-case-h">PLAINTIFF THEORY</div>
          <p>{data.caseTheory.posture}</p>
        </div>
        <div className="wt-case-keys">
          {data.caseTheory.keyDates.slice(1).map((k) => (
            <div key={k.label} className="wt-key">
              <span className="font-mono wt-key-date">{k.date}</span>
              <span className="wt-key-label">{k.label}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function EntitiesQuickList({ onJumpId }) {
    const data = T();
    return (
      <section className="wt-card">
        <div className="wt-card-h">
          <span className="wt-card-eyebrow">CAST</span>
          <span className="wt-card-meta font-mono">{data.entities.length}</span>
        </div>
        <ul className="wt-cast">
          {data.entities.map((e) => (
            <li key={e.id}>
              <button className="wt-cast-row" onClick={() => onJumpId && onJumpId(e.id)}>
                <div className="wt-cast-name">{e.name}</div>
                <div className="wt-cast-meta">
                  <span>{e.role}</span>
                  <span className="font-mono wt-cast-mentions">{e.mentions.toLocaleString()}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  function TaskQueue({ onTab }) {
    const data = T();
    const tasks = [
      ...data.chronology.filter(c => c.accepted === null).slice(0, 3).map(c => ({
        kind: "chron", urgent: false, label: "Review chronology event",
        sub: c.description.slice(0, 60) + "…",
        target: "chronology",
      })),
      ...data.documents.filter(d => d.privilege === "flagged").slice(0, 3).map(d => ({
        kind: "priv", urgent: true, label: "Decide privilege",
        sub: d.bates + " · " + d.title,
        target: "privilege",
      })),
    ];

    return (
      <section className="wt-card">
        <div className="wt-card-h">
          <span className="wt-card-eyebrow brass">YOUR QUEUE</span>
          <span className="wt-card-meta font-mono">{tasks.length} OPEN</span>
        </div>
        <ul className="wt-tasks">
          {tasks.length === 0 && <li className="wt-task-empty">Queue is clear ✓</li>}
          {tasks.map((t, i) => (
            <li key={i}>
              <button className={"wt-task " + (t.urgent ? "urgent" : "")} onClick={() => onTab(t.target)}>
                <div className="wt-task-glyph">{t.urgent ? "🔒" : "✦"}</div>
                <div>
                  <div className="wt-task-label">{t.label}</div>
                  <div className="wt-task-sub">{t.sub}</div>
                </div>
                <span className="wt-task-go">›</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="wt-queue-hint">Press <span className="font-mono">A</span> to accept · <span className="font-mono">R</span> to reject · <span className="font-mono">J/K</span> to step</div>
      </section>
    );
  }

  function ScalesMini() {
    const data = T();
    // Recompute on each render
    const plaintiff = [], defense = [];
    data.graph.edges.filter(e => e.type === "supports").forEach((e) => {
      const t = data.chronology.find(c => c.id === e.b) || data.documents.find(d => d.id === e.b);
      if (!t) return;
      const side = e.a.startsWith("cl") ? plaintiff : defense;
      const accepted = "accepted" in t ? t.accepted === true : true;
      const conf = t.confidence || t.ocrConfidence || "high";
      const w = conf === "high" ? 3 : conf === "medium" ? 2 : 1;
      side.push({ w, accepted });
    });
    const sum = (arr) => arr.filter(t => t.accepted).reduce((s, t) => s + t.w, 0);
    const pw = sum(plaintiff), dw = sum(defense);
    const total = pw + dw + 0.0001;
    const ratio = (pw - dw) / total;
    const angle = Math.max(-14, Math.min(14, ratio * 14));
    const pwPct = Math.round((pw / total) * 100);

    return (
      <section className="wt-card scales-mini-card">
        <div className="wt-card-h">
          <span className="wt-card-eyebrow">SCALES OF THEMIS</span>
          <span className="wt-card-meta font-mono">{angle === 0 ? "EVEN" : (angle < 0 ? "TIPPED" : "TIPPED")} {Math.abs(angle).toFixed(1)}°</span>
        </div>
        <div className="scales-mini-svg-wrap">
          <svg viewBox="0 0 200 100" className="scales-mini-svg">
            <defs>
              <linearGradient id="brassMini" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#e9cf95" />
                <stop offset="1" stopColor="#a67c3a" />
              </linearGradient>
            </defs>
            <rect x="90" y="80" width="20" height="6" rx="1" fill="url(#brassMini)" />
            <rect x="96" y="22" width="8" height="60" fill="url(#brassMini)" />
            <circle cx="100" cy="22" r="5" fill="url(#brassMini)" stroke="#3a2a14" strokeWidth="0.6" />
            <g transform={`rotate(${angle} 100 22)`} style={{ transition: "transform 800ms cubic-bezier(.4,1.6,.4,1)" }}>
              <rect x="20" y="20" width="160" height="4" rx="1.5" fill="url(#brassMini)" />
              <line x1="40" y1="22" x2="40" y2="50" stroke="#caa05c" strokeWidth="0.8" />
              <line x1="160" y1="22" x2="160" y2="50" stroke="#caa05c" strokeWidth="0.8" />
              <ellipse cx="40" cy="56" rx="22" ry="5" fill="#e9cf95" stroke="#7a5c2a" strokeWidth="0.6" />
              <ellipse cx="160" cy="56" rx="22" ry="5" fill="#e9cf95" stroke="#7a5c2a" strokeWidth="0.6" />
            </g>
          </svg>
        </div>
        <div className="scales-mini-readout">
          <div>
            <div className="scales-mini-pill claim">▲ PLAINTIFF</div>
            <div className="scales-mini-num font-display">{pw}</div>
          </div>
          <div className="scales-mini-bar">
            <div className="scales-mini-bar-fill" style={{ width: pwPct + "%" }}></div>
          </div>
          <div>
            <div className="scales-mini-pill defense">▽ DEFENSE</div>
            <div className="scales-mini-num font-display">{dw}</div>
          </div>
        </div>
      </section>
    );
  }

  function AuditTickerMini() {
    const entries = [
      { ts: "12 m", actor: "D.Okafor",   action: "accepted",  detail: "c2 · NW-000847" },
      { ts: "18 m", actor: "system",     action: "flagged",   detail: "NW-002310" },
      { ts: "21 m", actor: "D.Okafor",   action: "asked",     detail: "complaint→termination span" },
      { ts: "1 hr", actor: "system",     action: "ingest",    detail: "11,920 · 84K pg" },
    ];
    return (
      <section className="wt-card">
        <div className="wt-card-h">
          <span className="wt-card-eyebrow">AUDIT TRAIL</span>
          <span className="wt-card-meta font-mono">APPEND-ONLY</span>
        </div>
        <ul className="wt-audit">
          {entries.map((e, i) => (
            <li key={i}>
              <span className="wt-audit-action font-mono">{e.action}</span>
              <span className="wt-audit-detail">{e.detail}</span>
              <span className="wt-audit-foot">
                <span className="wt-audit-actor">{e.actor}</span>
                <span className="wt-audit-ts font-mono">{e.ts}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  }
})();
