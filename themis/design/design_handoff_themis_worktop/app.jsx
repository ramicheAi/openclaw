/* global React, ReactDOM, useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle, TweakButton */
(function () {
  const { useState, useEffect, useMemo, useRef, useCallback } = React;
  const T = () => window.THEMIS;

  // ── App-level keyboard handler ───────────────────────────────
  function useShortcuts(handlers) {
    useEffect(() => {
      function onKey(e) {
        const inField = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);
        const cmd = e.metaKey || e.ctrlKey;
        if (cmd && (e.key === "k" || e.key === "K")) {
          e.preventDefault(); handlers.openCmdK && handlers.openCmdK(); return;
        }
        if (cmd && (e.key === "d" || e.key === "D")) {
          e.preventDefault(); handlers.toggleTheme && handlers.toggleTheme(); return;
        }
        if (cmd && /^[1-5]$/.test(e.key)) {
          e.preventDefault();
          const tabs = ["ask", "chronology", "privilege", "binder", "documents"];
          handlers.gotoTab && handlers.gotoTab(tabs[+e.key - 1]); return;
        }
        if (inField) return;
        if (e.key === "?" ) { e.preventDefault(); handlers.openHelp && handlers.openHelp(); return; }
        if (e.key === "a" || e.key === "A") { handlers.acceptNext && handlers.acceptNext(); return; }
        if (e.key === "r" || e.key === "R") { handlers.rejectNext && handlers.rejectNext(); return; }
        if (e.key === "/") { e.preventDefault(); handlers.openCmdK && handlers.openCmdK(); return; }
      }
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [handlers]);
  }

  // ── Top bar (cross-mode) ─────────────────────────────────────
  function TopBar({ matter, mode, onMode, theme, onTheme, onCmdK }) {
    return (
      <header className="topbar">
        <div className="topbar-left">
          <button className="back-glyph" title="All matters">‹</button>
          <div className="brand">
            <div className="brand-glyph">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M12 3v18M5 9l-2 4a4 4 0 0 0 8 0L9 9M19 9l-2 4a4 4 0 0 0 8 0l-2-4M7 21h10"/>
              </svg>
            </div>
            <div className="brand-text">
              <div className="brand-word font-display">Themis</div>
              <div className="brand-tag">EVIDENCE INTELLIGENCE</div>
            </div>
          </div>
          <div className="matter-info">
            <div className="matter-title font-display">{matter.name}</div>
            <div className="matter-sub">
              <span className="status-pip">
                <span className="status-pip-dot"></span> BRAIN READY
              </span>
              <span className="dot-sep">·</span>
              <span>{matter.matterType}</span>
              <span className="dot-sep">·</span>
              <span>Lead {matter.leadAttorney}</span>
            </div>
          </div>
        </div>

        <div className="topbar-mode">
          <button className={"mode-seg " + (mode === "worktop" ? "on" : "")} onClick={() => onMode("worktop")} title="Daily work surface">
            <span className="mode-ico">□</span>
            <span>Worktop</span>
            <span className="mode-sub">daily</span>
          </button>
          <button className={"mode-seg " + (mode === "brain" ? "on" : "")} onClick={() => onMode("brain")} title="Cinematic case brain (demo)">
            <span className="mode-ico">◉</span>
            <span>Case Brain</span>
            <span className="mode-sub">demo</span>
          </button>
        </div>

        <div className="topbar-right">
          <button className="topbar-cmdk" onClick={onCmdK}>
            <span className="search-ico">⌕</span>
            <span>Ask anything · jump · run</span>
            <kbd>⌘K</kbd>
          </button>
          <button className="topbar-icon-btn" title="Toggle light / dark (⌘D)" onClick={onTheme}>
            {theme === "light" ? "◐" : "◑"}
          </button>
        </div>
      </header>
    );
  }

  // ── Brain mode (the cinematic edition — preserved) ───────────
  function BrainHero({
    matter, data, filter, setFilter, layout, setLayout, selected, setSelected, replayKey, setReplayKey,
    paused, setPaused, stage, setStage, progress, setProgress, causalHl, setCausalHl,
    timeAt, setTimeAt, scales, tweaks, setTweak, onAccept, onReject,
  }) {
    return (
      <div className="stage stage-brain">
        <div className="canvas-host">
          <window.Brain
            filter={filter}
            selectedId={selected ? selected.id : null}
            onSelectNode={(n) => setSelected(n)}
            replayKey={replayKey}
            paused={paused}
            onStageChange={setStage}
            onProgress={setProgress}
            layout={layout}
            timeAt={layout === "time" ? timeAt : null}
            causalHighlight={causalHl}
            showLabels={tweaks.showLabels}
          />
        </div>

        {tweaks.showLeftConsole && <LeftConsole data={data} stage={stage} progress={progress} onPickClaim={(id) => {
          const n = data.graph.nodes.find(x => x.id === id);
          if (n) setSelected(n);
        }} />}
        {tweaks.showTelemetry && <TelemetryRibbon progress={progress} />}
        {tweaks.showRightConsole && <RightConsole data={data} onPick={(id) => {
          const n = data.graph.nodes.find(x => x.id === id);
          if (n) setSelected(n);
        }} onAccept={onAccept} scales={scales} />}

        <div className="bottom-strata">
          <CausalChainRibbon active={causalHl}
            onHover={() => setCausalHl(true)} onLeave={() => setCausalHl(false)}
            onScrub={(d) => { setLayout("time"); setTimeAt(d); }} />
          <FilterRibbon filter={filter} onFilter={setFilter} layout={layout} onLayout={setLayout}
            onReplay={() => { setReplayKey(k => k + 1); setSelected(null); setPaused(false); }}
            paused={paused} onPause={() => setPaused(p => !p)} stage={stage}
            causalHl={causalHl} onCausalToggle={() => setCausalHl(v => !v)} />
          {layout === "time" && <TimeScrubber value={timeAt} onChange={setTimeAt} />}
        </div>

        {selected && <window.Inspector node={selected}
          onClose={() => setSelected(null)} onAccept={onAccept} onReject={onReject}
          onJump={() => setSelected(null)} />}

        {causalHl && <CinematicOverlay />}
      </div>
    );
  }

  // ── Brain-mode console + ribbon components (lifted from v2) ──
  function LeftConsole({ data, stage, progress, onPickClaim }) {
    return (
      <div className="hud-module hud-left">
        <section className="hud-section">
          <div className="hud-sec-head">
            <span className="hud-eyebrow">CASE THEORY</span>
            <span className="hud-meta font-mono">context.md</span>
          </div>
          <p className="case-posture">{data.caseTheory.posture}</p>
          <div className="theory-block">
            <div className="theory-h"><span className="theory-h-tri claim">▲</span> Plaintiff claims</div>
            <ul className="theory-list">
              {data.caseTheory.claims.map((c, i) => (
                <li key={i}>
                  <button className="theory-li" onClick={() => onPickClaim("cl" + (i + 1))}>
                    <span className="theory-idx font-mono">{String(i + 1).padStart(2, "0")}</span>{c}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="theory-block">
            <div className="theory-h"><span className="theory-h-tri defense">▽</span> Defenses asserted</div>
            <ul className="theory-list">
              {data.caseTheory.defenses.map((c, i) => (
                <li key={i}>
                  <button className="theory-li defense">
                    <span className="theory-idx font-mono">{String(i + 1).padStart(2, "0")}</span>{c}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className="hud-section">
          <div className="hud-sec-head">
            <span className="hud-eyebrow">INGEST PIPELINE</span>
            <span className="hud-meta font-mono">{Math.floor((progress.pages || 0) / 1000)}K / 84K PG</span>
          </div>
          <div className="pipeline-rail">
            {data.ingestStages.map((s, i) => {
              const live = stage.key === s.key;
              return (
                <div key={s.key} className={"pipe-step " + (s.done ? "done " : "") + (live ? "live" : "")}>
                  <div className="pipe-glyph">{s.done ? "●" : live ? "◌" : "○"}</div>
                  <div className="pipe-meta">
                    <div className="pipe-label">{s.label}</div>
                    <div className="pipe-ts font-mono">{s.ts}</div>
                  </div>
                  {i < data.ingestStages.length - 1 && <div className="pipe-connector"></div>}
                </div>
              );
            })}
          </div>
        </section>
        <section className="hud-section">
          <div className="hud-sec-head">
            <span className="hud-eyebrow">GAPS · 3 FOUND</span>
            <span className="hud-meta">since ingest</span>
          </div>
          <div className="gaps">
            {data.gapFindings.map((g, i) => (
              <div key={i} className={"gap gap-" + g.severity}>
                <div className="gap-sev font-mono">{g.severity}</div>
                <div className="gap-body">{g.text}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function TelemetryRibbon({ progress }) {
    const pages = progress?.pages || 0;
    return (
      <div className="hud-floater telemetry">
        <div className="telem-cell"><div className="telem-eyebrow">PAGES</div><div className="telem-num font-mono">{pages.toLocaleString()}</div><div className="telem-sub font-mono">of 84,213</div></div>
        <div className="telem-cell"><div className="telem-eyebrow">DOCUMENTS</div><div className="telem-num font-mono">11,920</div><div className="telem-sub font-mono">100%</div></div>
        <div className="telem-cell"><div className="telem-eyebrow">ENTITIES</div><div className="telem-num font-mono">3,037</div><div className="telem-sub font-mono">4 hubs</div></div>
        <div className="telem-cell"><div className="telem-eyebrow">HOT</div><div className="telem-num font-mono">23</div><div className="telem-sub font-mono brass">⚡ flagged</div></div>
        <div className="telem-cell"><div className="telem-eyebrow">PRIV. QUEUE</div><div className="telem-num font-mono">14</div><div className="telem-sub font-mono flag">🔒 walled</div></div>
      </div>
    );
  }

  function RightConsole({ data, onPick, onAccept, scales }) {
    const pending = data.chronology.filter(e => e.accepted === null).length;
    return (
      <div className="hud-module hud-right">
        <ScalesMeter scales={scales} />
        <section className="hud-section">
          <div className="hud-sec-head">
            <span className="hud-eyebrow">HOT DOCUMENTS</span>
            <span className="hud-meta font-mono">{data.documents.filter(d => d.hot).length} OF 11.9K</span>
          </div>
          <div className="hot-list">
            {data.documents.filter(d => d.hot).slice(0, 5).map((d, i) => (
              <button key={d.id} className="hot-row" onClick={() => onPick(d.id)}>
                <div className="hot-row-num font-mono">{String(i + 1).padStart(2, "0")}</div>
                <div className="hot-row-body">
                  <div className="hot-row-top">
                    <span className="bates-chip">{d.bates}</span>
                    {d.privilege === "flagged" && <span className="priv-mini">🔒</span>}
                    <span className="hot-row-date font-mono">{d.date}</span>
                  </div>
                  <div className="hot-row-title">{d.title}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
        <section className="hud-section">
          <div className="hud-sec-head">
            <span className="hud-eyebrow">CHRONOLOGY</span>
            <span className="hud-meta"><span className="hud-pending-pip">{pending}</span> pending</span>
          </div>
          <ol className="chron-list">
            {data.chronology.map((e) => {
              const isPending = e.accepted === null;
              return (
                <li key={e.id} className={"chron-row " + (isPending ? "pending" : "accepted")} onClick={() => onPick(e.id)}>
                  <div className="chron-date font-mono">{e.date}</div>
                  <div className="chron-body">
                    <div className="chron-desc">{e.description}</div>
                    <div className="chron-foot">
                      <span className={"cite-chip " + (e.citation.verified ? "v" : "u")}>{e.citation.verified ? "✓" : "⚠"} {e.citation.bates}</span>
                      <span className="conf-dot-mini-wrap"><span className={"conf-dot " + e.confidence}></span>{e.confidence}</span>
                      {isPending && <button className="chron-accept" onClick={(ev) => { ev.stopPropagation(); onAccept(e); }}>ACCEPT</button>}
                      {!isPending && <span className="chron-grounded">grounded</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
        <AuditTickerBig />
      </div>
    );
  }
  function AuditTickerBig() {
    const entries = [
      { ts: "12 m", actor: "D.Okafor", action: "ACCEPTED", detail: "c2 · NW-000847" },
      { ts: "18 m", actor: "system",   action: "FLAGGED",  detail: "NW-002310" },
      { ts: "21 m", actor: "D.Okafor", action: "ASKED",    detail: "complaint→termination span" },
      { ts: "1 hr", actor: "system",   action: "INGEST",   detail: "11,920 · 84,213 pg" },
    ];
    return (
      <section className="hud-section audit-ticker">
        <div className="hud-sec-head"><span className="hud-eyebrow">AUDIT · APPEND-ONLY</span></div>
        <ol className="audit-list">
          {entries.map((e, i) => (
            <li key={i} className="audit-row">
              <span className="audit-action font-mono">{e.action}</span>
              <span className="audit-detail font-mono">{e.detail}</span>
              <span className="audit-actor">{e.actor}</span>
              <span className="audit-ts font-mono">{e.ts}</span>
            </li>
          ))}
        </ol>
      </section>
    );
  }
  function ScalesMeter({ scales }) {
    const { pw, dw, ratio } = scales;
    const angle = Math.max(-14, Math.min(14, ratio * 14));
    const pwPct = Math.round((pw / (pw + dw + 0.0001)) * 100);
    return (
      <section className="hud-section scales-meter">
        <div className="hud-sec-head">
          <span className="hud-eyebrow">SCALES OF THEMIS</span>
          <span className="hud-meta font-mono">{angle === 0 ? "BALANCED" : "TIPPED"} {Math.abs(angle).toFixed(1)}°</span>
        </div>
        <div className="meter-numerics">
          <div className="meter-side">
            <div className="meter-pill claim">▲ PLAINTIFF</div>
            <div className="meter-num font-display">{pw}</div>
            <div className="meter-sub">grounded weight</div>
          </div>
          <div className="meter-scales-wrap">
            <svg viewBox="0 0 180 100" className="meter-svg">
              <defs>
                <linearGradient id="meterBrass" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#e9cf95" /><stop offset="1" stopColor="#a67c3a" />
                </linearGradient>
              </defs>
              <rect x="80" y="80" width="20" height="6" rx="1" fill="url(#meterBrass)" />
              <rect x="86" y="22" width="8" height="60" fill="url(#meterBrass)" />
              <circle cx="90" cy="22" r="5" fill="url(#meterBrass)" stroke="#3a2a14" strokeWidth="0.6" />
              <g transform={`rotate(${angle} 90 22)`} style={{ transition: "transform 800ms cubic-bezier(.4,1.6,.4,1)" }}>
                <rect x="14" y="20" width="152" height="4" rx="1.5" fill="url(#meterBrass)" />
                <line x1="34" y1="22" x2="34" y2="50" stroke="#caa05c" strokeWidth="0.8" />
                <line x1="146" y1="22" x2="146" y2="50" stroke="#caa05c" strokeWidth="0.8" />
                <ellipse cx="34" cy="56" rx="24" ry="5" fill="#e9cf95" stroke="#7a5c2a" strokeWidth="0.6" />
                <ellipse cx="146" cy="56" rx="24" ry="5" fill="#e9cf95" stroke="#7a5c2a" strokeWidth="0.6" />
              </g>
            </svg>
          </div>
          <div className="meter-side meter-side-r">
            <div className="meter-pill defense">▽ DEFENSE</div>
            <div className="meter-num font-display">{dw}</div>
            <div className="meter-sub">grounded weight</div>
          </div>
        </div>
        <div className="meter-bar"><div className="meter-bar-fill claim" style={{ width: pwPct + "%" }}></div></div>
        <div className="meter-foot">Only <em>accepted + verified</em> evidence moves the beam.</div>
      </section>
    );
  }

  function CausalChainRibbon({ active, onHover, onLeave, onScrub }) {
    const chain = [
      { id: "c2", date: "2021-02-11", title: "Wage complaint",   bates: "NW-000847", delta: null,       kind: "trigger" },
      { id: "c3", date: "2021-02-12", title: "HR acknowledges",  bates: "NW-000851", delta: "+1 day",   kind: "knowledge" },
      { id: "c4", date: "2021-02-26", title: "Negative review",  bates: "NW-001120", delta: "+15 days", kind: "pretext" },
      { id: "c5", date: "2021-03-12", title: "Separation memo",  bates: "NW-001498", delta: "+14 days", kind: "motive", privileged: true },
      { id: "c6", date: "2021-03-15", title: "Termination",      bates: "NW-001502", delta: "+3 days",  kind: "adverse" },
    ];
    return (
      <div className={"causal-ribbon " + (active ? "active" : "")} onMouseEnter={onHover} onMouseLeave={onLeave}>
        <div className="causal-head">
          <div>
            <div className="causal-eyebrow">RETALIATION CHAIN · CONTESTED CAUSATION</div>
            <div className="causal-title">
              <span className="causal-num font-display">32</span>
              <span className="causal-num-label">
                <span className="font-display causal-num-unit">days</span>
                <span className="causal-num-sub">from protected activity to adverse action</span>
              </span>
            </div>
          </div>
          <div className="causal-stat">
            <div className="causal-stat-num font-mono">5 / 5</div>
            <div className="causal-stat-sub">links verified</div>
          </div>
        </div>
        <div className="causal-track">
          {chain.map((c, i) => (
            <div key={c.id} className={"causal-node causal-node-" + c.kind + (c.privileged ? " privileged" : "")}
              onClick={() => onScrub(c.date)}>
              <div className="causal-pin"><div className="causal-pin-inner"></div></div>
              <div className="causal-date font-mono">{c.date}</div>
              <div className="causal-titleline">{c.title}</div>
              <div className="causal-meta">
                <span className="bates-chip-mini">{c.bates}</span>
                <span className="cite-v-mini">✓ verified</span>
              </div>
              {c.delta && <div className="causal-delta">{c.delta}</div>}
              {i < chain.length - 1 && <div className="causal-spine"></div>}
            </div>
          ))}
        </div>
      </div>
    );
  }
  function FilterRibbon({ filter, onFilter, layout, onLayout, onReplay, paused, onPause, stage, causalHl, onCausalToggle }) {
    const filters = [
      { id: "all", label: "All" }, { id: "hot", label: "Hot" }, { id: "privileged", label: "Privileged" },
      { id: "unverified", label: "Pending" }, { id: "Retaliatory Motive", label: "Retaliatory motive" }, { id: "Pretext", label: "Pretext" },
    ];
    return (
      <div className="filter-ribbon">
        <div className="filter-left">
          <div className="seg-control">
            <button className={"seg-btn " + (layout === "force" ? "on" : "")} onClick={() => onLayout("force")}><span className="seg-ico">◉</span> Force</button>
            <button className={"seg-btn " + (layout === "orbital" ? "on" : "")} onClick={() => onLayout("orbital")}><span className="seg-ico">◎</span> Orbital</button>
            <button className={"seg-btn " + (layout === "time" ? "on" : "")} onClick={() => onLayout("time")}><span className="seg-ico">⊢</span> Timeline</button>
          </div>
          <button className={"chain-btn " + (causalHl ? "on" : "")} onClick={onCausalToggle}>
            <span className="chain-glyph">⟗</span> HIGHLIGHT CAUSAL CHAIN
          </button>
        </div>
        <div className="filter-mid">
          <span className="filter-eyebrow font-mono">FILTER</span>
          <div className="chips">
            {filters.map((f) => <button key={f.id} className={"chip " + (filter === f.id ? "on" : "")} onClick={() => onFilter(f.id)}>{f.label}</button>)}
          </div>
        </div>
        <div className="filter-right">
          <div className="stage-readout">
            <span className="stage-dot"></span><span className="stage-text">{stage.label}</span>
          </div>
          <button className="ico-btn" onClick={onPause}>{paused ? "▶" : "❚❚"}</button>
          <button className="ico-btn" onClick={onReplay}>↻ Replay</button>
        </div>
      </div>
    );
  }
  function TimeScrubber({ value, onChange }) {
    const min = new Date("2019-01-01").getTime();
    const max = new Date("2021-06-01").getTime();
    const at = new Date(value).getTime();
    const pct = ((at - min) / (max - min)) * 100;
    const sliderRef = useRef(null);
    const onMove = (e) => {
      const r = sliderRef.current.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      onChange(new Date(min + p * (max - min)).toISOString().slice(0, 10));
    };
    const onDown = (e) => {
      onMove(e);
      const up = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", up); };
      window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", up);
    };
    return (
      <div className="time-scrubber">
        <div className="time-scrub-label">
          <span className="time-eyebrow font-mono">TIME</span>
          <span className="time-value font-mono">{value}</span>
        </div>
        <div ref={sliderRef} className="time-track" onMouseDown={onDown}>
          {["2019", "2020", "2021"].map((y) => {
            const t = new Date(y + "-01-01").getTime();
            const p = ((t - min) / (max - min)) * 100;
            return (
              <div key={y} className="time-tick" style={{ left: p + "%" }}>
                <div className="time-tick-line"></div>
                <div className="time-tick-label font-mono">{y}</div>
              </div>
            );
          })}
          <div className="time-fill" style={{ width: pct + "%" }}></div>
          <div className="time-thumb" style={{ left: pct + "%" }}></div>
        </div>
      </div>
    );
  }
  function CinematicOverlay() {
    return (
      <div className="cinematic-overlay">
        <div className="cinematic-content">
          <div className="cinematic-eyebrow font-mono">PROTECTED ACTIVITY → ADVERSE ACTION</div>
          <div className="cinematic-num font-display">32</div>
          <div className="cinematic-unit font-display">days</div>
          <div className="cinematic-arc">
            <span className="cinematic-arc-l">complaint</span>
            <span className="cinematic-arc-line"></span>
            <span className="cinematic-arc-r">termination</span>
          </div>
          <div className="cinematic-meta">5 documents · 5 verified citations · 2 privilege-walled · 6 chronology events</div>
        </div>
      </div>
    );
  }

  // ── Scales computation helper ────────────────────────────────
  function computeScales() {
    const data = T();
    const plaintiff = [], defense = [];
    data.graph.edges.filter(e => e.type === "supports").forEach((e) => {
      const tgt = data.chronology.find(c => c.id === e.b) || data.documents.find(d => d.id === e.b);
      if (!tgt) return;
      const side = e.a.startsWith("cl") ? plaintiff : defense;
      const accepted = "accepted" in tgt ? tgt.accepted === true : true;
      const conf = tgt.confidence || tgt.ocrConfidence || "high";
      const w = conf === "high" ? 3 : conf === "medium" ? 2 : 1;
      side.push({ w, accepted });
    });
    const sum = (arr) => arr.filter(t => t.accepted).reduce((s, t) => s + t.w, 0);
    const pw = sum(plaintiff), dw = sum(defense);
    const total = pw + dw + 0.0001;
    return { pw, dw, ratio: (pw - dw) / total };
  }

  // ── App root ─────────────────────────────────────────────────
  function App() {
    const data = T();
    const [mode, setMode] = useState("worktop");
    const [theme, setTheme] = useState("dark");
    const [activeTab, setActiveTab] = useState("ask");
    const [filter, setFilter] = useState("all");
    const [layout, setLayout] = useState("force");
    const [selected, setSelected] = useState(null);
    const [replayKey, setReplayKey] = useState(0);
    const [paused, setPaused] = useState(false);
    const [stage, setStage] = useState({ key: "upload", label: "Initializing" });
    const [progress, setProgress] = useState({ pages: 0, totalPages: 84213 });
    const [causalHl, setCausalHl] = useState(false);
    const [timeAt, setTimeAt] = useState("2021-03-15");
    const [cmdkOpen, setCmdkOpen] = useState(false);
    const [docJumpBates, setDocJumpBates] = useState(null);
    const [scales, setScales] = useState(() => computeScales());
    const [tick, setTick] = useState(0);

    const [tweaks, setTweak] = useTweaks(/*EDITMODE-BEGIN*/{
      "showLabels": true,
      "showLeftConsole": true,
      "showRightConsole": true,
      "showTelemetry": true,
      "defaultMode": "worktop"
    }/*EDITMODE-END*/);

    useEffect(() => { setMode(tweaks.defaultMode || "worktop"); }, []);

    // External mode change (compact brain "open" link)
    useEffect(() => {
      const onModeEv = (e) => setMode(e.detail);
      window.addEventListener("themis-mode", onModeEv);
      return () => window.removeEventListener("themis-mode", onModeEv);
    }, []);

    const onAccept = (event) => {
      const c = data.chronology.find(x => x.id === event.id);
      if (c) c.accepted = true;
      setScales(computeScales());
      setTick(t => t + 1);
      setSelected(null);
    };
    const onReject = (event) => {
      const c = data.chronology.find(x => x.id === event.id);
      if (c) c.accepted = false;
      setScales(computeScales());
      setTick(t => t + 1);
      setSelected(null);
    };
    const acceptNext = () => {
      const next = data.chronology.find(c => c.accepted === null);
      if (next) onAccept(next);
    };
    const rejectNext = () => {
      const next = data.chronology.find(c => c.accepted === null);
      if (next) onReject(next);
    };

    const onJumpDoc = (bates) => {
      setDocJumpBates(bates);
      setActiveTab("documents");
      if (mode !== "worktop") setMode("worktop");
    };
    const onJumpId = (id) => {
      const n = data.graph.nodes.find(x => x.id === id);
      if (n) {
        if (n.kind === "doc" && n.doc) onJumpDoc(n.doc.bates);
        else { setSelected(n); }
      }
    };

    const onTouchData = () => { setScales(computeScales()); setTick(t => t + 1); };

    const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");

    useShortcuts({
      openCmdK: () => setCmdkOpen(true),
      toggleTheme,
      gotoTab: (id) => { setMode("worktop"); setActiveTab(id); },
      acceptNext,
      rejectNext,
    });

    // Body class for theme
    useEffect(() => {
      document.body.setAttribute("data-theme", theme);
    }, [theme]);

    return (
      <div className={"app cinematic theme-" + theme + " mode-" + mode}>
        <TopBar matter={data.matter} mode={mode} onMode={setMode}
                theme={theme} onTheme={toggleTheme}
                onCmdK={() => setCmdkOpen(true)} />

        {mode === "brain" ? (
          <BrainHero
            matter={data.matter} data={data}
            filter={filter} setFilter={setFilter}
            layout={layout} setLayout={setLayout}
            selected={selected} setSelected={setSelected}
            replayKey={replayKey} setReplayKey={setReplayKey}
            paused={paused} setPaused={setPaused}
            stage={stage} setStage={setStage}
            progress={progress} setProgress={setProgress}
            causalHl={causalHl} setCausalHl={setCausalHl}
            timeAt={timeAt} setTimeAt={setTimeAt}
            scales={scales} tweaks={tweaks} setTweak={setTweak}
            onAccept={onAccept} onReject={onReject}
          />
        ) : (
          <window.Worktop
            activeTab={activeTab} onTab={setActiveTab}
            onJumpDoc={onJumpDoc} onJumpId={onJumpId}
            jumpToDoc={docJumpBates}
            onTouchData={onTouchData}
            onAddToBinder={(cites) => {
              const ids = (cites || []).map(c => data.documents.find(d => d.bates === c.bates)?.id).filter(Boolean);
              if (ids.length && window.binderPush) window.binderPush(window.__binders[0].id, ids);
              setTick(t => t + 1);
            }}
          />
        )}

        <window.CommandPalette
          open={cmdkOpen}
          onClose={() => setCmdkOpen(false)}
          onTab={(id) => { setMode("worktop"); setActiveTab(id); }}
          onJumpDoc={onJumpDoc}
          onSetMode={setMode}
          onLightToggle={toggleTheme}
          onReplay={() => { setMode("brain"); setReplayKey(k => k + 1); setSelected(null); setPaused(false); }}
          onAcceptNext={acceptNext}
          onGenerate={(kind) => {
            if (kind === "chronology") { setMode("worktop"); setActiveTab("chronology"); }
            if (kind === "privilege")  { setMode("worktop"); setActiveTab("privilege"); }
            if (kind === "binder")     { setMode("worktop"); setActiveTab("binder"); }
          }}
        />

        <TweaksPanel title="Tweaks">
          <TweakSection label="Default mode">
            <TweakRadio label="On open"
              value={tweaks.defaultMode || "worktop"}
              options={[
                { value: "worktop", label: "Worktop" },
                { value: "brain", label: "Brain" },
              ]}
              onChange={(v) => { setTweak("defaultMode", v); setMode(v); }}
            />
          </TweakSection>
          <TweakSection label="Brain mode">
            <TweakButton label="↻ Replay ingest" onClick={() => { setMode("brain"); setReplayKey(k => k + 1); }} />
            <TweakToggle label="Node labels" value={tweaks.showLabels} onChange={(v) => setTweak("showLabels", v)} />
            <TweakToggle label="Left console" value={tweaks.showLeftConsole} onChange={(v) => setTweak("showLeftConsole", v)} />
            <TweakToggle label="Right console" value={tweaks.showRightConsole} onChange={(v) => setTweak("showRightConsole", v)} />
            <TweakToggle label="Telemetry ribbon" value={tweaks.showTelemetry} onChange={(v) => setTweak("showTelemetry", v)} />
          </TweakSection>
        </TweaksPanel>
      </div>
    );
  }

  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(<App />);
})();
