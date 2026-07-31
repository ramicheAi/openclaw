/* global React */
// Themis work panels — the actual surfaces a paralegal lives in.
// Each panel is a self-contained workflow:
//   • AskPanel           — grounded chat (POST /chat) with citation chips
//   • ChronologyPanel    — draft → accept → export (Word/PDF) court chronology
//   • PrivilegePanel     — queue + clear/withhold + generate privilege log
//   • BinderPanel        — exhibit binder builder; drag/reorder/label/export
//   • DocumentsPanel     — list + split viewer + side-by-side compare

(function () {
  const { useState, useMemo, useRef, useEffect } = React;
  const T = () => window.THEMIS;

  // ── shared atoms ────────────────────────────────────────────
  function BatesChip({ b, page, verified, onJump }) {
    return (
      <button
        className={"bates-chip-btn " + (verified ? "v" : "u")}
        title={verified ? "Citation verified against source" : "Citation not yet verified"}
        onClick={(e) => { e.stopPropagation(); onJump && onJump(b); }}
      >
        {verified ? "✓ " : "⚠ "}{b}{page ? " · p" + page : ""}
      </button>
    );
  }

  function Kbd({ k }) { return <kbd className="kbd-hint">{k}</kbd>; }

  function PanelHead({ eyebrow, title, sub, actions }) {
    return (
      <header className="panel-head">
        <div className="panel-head-text">
          <div className="panel-eyebrow">{eyebrow}</div>
          <h2 className="panel-title font-display">{title}</h2>
          {sub && <div className="panel-sub">{sub}</div>}
        </div>
        {actions && <div className="panel-head-actions">{actions}</div>}
      </header>
    );
  }

  // ╔═══════════════════════════════════════════════════════════╗
  // ║ Ask Themis — grounded chat                                 ║
  // ╚═══════════════════════════════════════════════════════════╝
  window.AskPanel = function AskPanel({ onJumpDoc, onAddToBinder }) {
    const data = T();
    const [msgs, setMsgs] = useState([
      {
        id: "q0",
        role: "user",
        text: "How much time passed between Reyes's wage complaint and her termination? What's our best evidence for retaliation?",
      },
      {
        id: "a0",
        role: "themis",
        text: "32 days passed between the documented wage complaint (NW-000847, 2021-02-11) and the termination letter (NW-001502, 2021-03-15). The strongest evidence for retaliation is the temporal sequence plus the Brandt memo to file (NW-001498) which references 'the complaint situation' while discussing separation — 14 days before the termination. The first negative review of Reyes (NW-001120) lands exactly 15 days after the complaint, with no prior negative documentation in her file. Every citation below is verified against its source page.",
        confidence: "high",
        citations: [
          { bates: "NW-000847", page: 1, verified: true },
          { bates: "NW-001120", page: 1, verified: true },
          { bates: "NW-001498", page: 1, verified: true },
          { bates: "NW-001502", page: 1, verified: true },
        ],
      },
    ]);
    const [draft, setDraft] = useState("");
    const [thinking, setThinking] = useState(false);
    const scrollRef = useRef(null);

    useEffect(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [msgs, thinking]);

    function ask(text) {
      if (!text.trim()) return;
      const q = { id: "u" + Date.now(), role: "user", text };
      setMsgs((m) => [...m, q]);
      setDraft("");
      setThinking(true);
      // Simulated grounded response — Claude Code will swap this for POST /chat
      setTimeout(() => {
        const lower = text.toLowerCase();
        let reply, cites = [];
        if (lower.includes("privileg") || lower.includes("stein")) {
          reply = "Two documents are flagged for privilege review. NW-001498 (Brandt memo to file, 2021-03-12) loops in Linda Stein (in-house counsel) on the separation wording — potential attorney-client. NW-002310 (Stein, 2021-03-13) is direct legal advice and a stronger privilege candidate; recommend withhold pending senior review.";
          cites = [
            { bates: "NW-001498", page: 1, verified: true },
            { bates: "NW-002310", page: 1, verified: true },
          ];
        } else if (lower.includes("brandt") || lower.includes("supervisor")) {
          reply = "Tom Brandt (Operations Manager) supervised Reyes. He authored the negative performance review (NW-001120) and the memo to file (NW-001498) discussing separation. There is a documentary gap between 2021-02-12 and 2021-02-26 in Brandt's email production — the period bracketing the review's origin.";
          cites = [
            { bates: "NW-001120", page: 1, verified: true },
            { bates: "NW-001498", page: 1, verified: true },
          ];
        } else if (lower.includes("damage") || lower.includes("lost wage")) {
          reply = "Reyes's last paystub (NW-002104) reflects an annualized rate of $58,200. Backpay running from 2021-03-15 through trial date (est. Q4 2024) is approximately $204,000 before mitigation. Mitigation evidence (subsequent employment) has not been produced.";
          cites = [{ bates: "NW-002104", page: 1, verified: true }];
        } else {
          reply = "Based on the corpus, the most probative documents are the wage complaint thread (NW-000847 → NW-000851), the timing-anomalous performance review (NW-001120), and the memo referencing 'the complaint situation' (NW-001498). Every citation is verified.";
          cites = [
            { bates: "NW-000847", page: 1, verified: true },
            { bates: "NW-001120", page: 1, verified: true },
            { bates: "NW-001498", page: 1, verified: true },
          ];
        }
        setMsgs((m) => [...m, {
          id: "t" + Date.now(),
          role: "themis", text: reply,
          confidence: "high", citations: cites,
        }]);
        setThinking(false);
      }, 900);
    }

    const suggestions = [
      "Show me everything about the privilege flags",
      "What did Tom Brandt write about Reyes?",
      "Compare NW-000847 and NW-000851",
      "What's the damages exposure?",
    ];

    return (
      <div className="panel ask-panel">
        <PanelHead
          eyebrow="ASK THEMIS · GROUNDED CHAT"
          title="Ask the brain"
          sub="Every answer is grounded in verified citations. Click any Bates chip to open the source."
          actions={<div className="kbd-row"><Kbd k="⌘K"/> command palette</div>}
        />
        <div ref={scrollRef} className="ask-scroll">
          {msgs.map((m) => (
            <div key={m.id} className={"ask-msg ask-" + m.role}>
              {m.role === "themis" && (
                <div className="ask-bubble-icon">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M3 6h18M12 3v18M5 9l-2 4a4 4 0 0 0 8 0L9 9M19 9l-2 4a4 4 0 0 0 8 0l-2-4M7 21h10"/>
                  </svg>
                </div>
              )}
              <div className="ask-bubble">
                {m.role === "themis" && (
                  <div className="ask-bubble-head">
                    <span className="ask-name">Themis</span>
                    {m.confidence && (
                      <span className="ask-conf">
                        <span className={"conf-dot " + m.confidence}></span>
                        {m.confidence} confidence
                      </span>
                    )}
                  </div>
                )}
                <div className="ask-bubble-body">{m.text}</div>
                {m.citations && m.citations.length > 0 && (
                  <div className="ask-cites">
                    <div className="ask-cites-h">grounded in</div>
                    <div className="ask-cites-chips">
                      {m.citations.map((c, i) => (
                        <BatesChip key={i} b={c.bates} page={c.page} verified={c.verified} onJump={onJumpDoc} />
                      ))}
                    </div>
                  </div>
                )}
                {m.role === "themis" && (
                  <div className="ask-bubble-actions">
                    <button className="micro-btn" onClick={() => copyAnswer(m)}>⎘ Copy with citations</button>
                    <button className="micro-btn" onClick={() => onAddToBinder && onAddToBinder(m.citations)}>＋ Add cited docs to binder</button>
                    <button className="micro-btn">⤓ Save to brief</button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {thinking && (
            <div className="ask-msg ask-themis">
              <div className="ask-bubble-icon">…</div>
              <div className="ask-bubble">
                <div className="ask-thinking">
                  <span className="thinking-dot"></span>
                  <span className="thinking-dot"></span>
                  <span className="thinking-dot"></span>
                  <span>Resolving across 11,920 documents…</span>
                </div>
              </div>
            </div>
          )}
        </div>
        {msgs.length <= 2 && !thinking && (
          <div className="ask-sugg">
            <div className="ask-sugg-h">try</div>
            {suggestions.map((s) => (
              <button key={s} className="ask-sugg-chip" onClick={() => ask(s)}>{s}</button>
            ))}
          </div>
        )}
        <form className="ask-input" onSubmit={(e) => { e.preventDefault(); ask(draft); }}>
          <span className="ask-prompt">›</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask anything — start with / for commands"
            spellCheck={false}
          />
          <div className="ask-input-hints">
            <span className="hint-pill"><Kbd k="↵"/> send</span>
            <span className="hint-pill"><Kbd k="/"/> commands</span>
          </div>
          <button type="submit" className="ask-send" disabled={!draft.trim()}>Ask →</button>
        </form>
      </div>
    );
  };

  function copyAnswer(m) {
    if (!navigator.clipboard) return;
    const cites = (m.citations || []).map(c => `${c.bates} p.${c.page}`).join("; ");
    const text = m.text + (cites ? `\n\n(${cites})` : "");
    navigator.clipboard.writeText(text);
  }

  // ╔═══════════════════════════════════════════════════════════╗
  // ║ Chronology panel — draft → accept → export                ║
  // ╚═══════════════════════════════════════════════════════════╝
  window.ChronologyPanel = function ChronologyPanel({ onJumpDoc, onTouch }) {
    const data = T();
    const [tick, setTick] = useState(0);   // re-render trigger
    const [exportOpen, setExportOpen] = useState(null); // 'word' | 'pdf' | null
    const accepted = data.chronology.filter(e => e.accepted === true);
    const pending  = data.chronology.filter(e => e.accepted === null);
    const rejected = data.chronology.filter(e => e.accepted === false);

    function decide(ev, val) {
      ev.accepted = val;
      onTouch && onTouch();
      setTick(t => t + 1);
    }

    return (
      <div className="panel chron-panel">
        <PanelHead
          eyebrow="CHRONOLOGY · COURT-READY"
          title={`${accepted.length} of ${data.chronology.length} events on the timeline`}
          sub="Accept drafts to lock them onto the timeline. Each accepted event tips the Scales."
          actions={
            <div className="panel-actions">
              <button className="btn-secondary" onClick={() => setExportOpen("word")}>⤓ Word</button>
              <button className="btn-primary" onClick={() => setExportOpen("pdf")}>⤓ Court PDF</button>
            </div>
          }
        />
        <div className="chron-summary">
          <div className="chron-summary-cell">
            <div className="cs-num font-display">{accepted.length}</div>
            <div className="cs-lbl">accepted</div>
          </div>
          <div className="chron-summary-cell warn">
            <div className="cs-num font-display">{pending.length}</div>
            <div className="cs-lbl">pending review</div>
          </div>
          <div className="chron-summary-cell">
            <div className="cs-num font-display">{rejected.length}</div>
            <div className="cs-lbl">rejected</div>
          </div>
          <div className="chron-summary-cell brass">
            <div className="cs-num font-display">100%</div>
            <div className="cs-lbl">citations verified</div>
          </div>
        </div>

        <div className="chron-list-wrap">
          <div className="chron-h">PROTECTED ACTIVITY → ADVERSE ACTION TIMELINE</div>
          <ol className="chron-stack">
            {data.chronology.map((e, i) => {
              const prev = i > 0 ? data.chronology[i - 1] : null;
              const days = prev ? Math.round((new Date(e.date) - new Date(prev.date)) / 86400000) : null;
              const status = e.accepted === true ? "accepted" : e.accepted === false ? "rejected" : "pending";
              return (
                <li key={e.id} className={"chron-stack-row chron-" + status}>
                  {days != null && days > 0 && (
                    <div className="chron-delta">+ {days} day{days === 1 ? "" : "s"}</div>
                  )}
                  <div className="chron-stack-card">
                    <div className="chron-stack-left">
                      <div className="chron-stack-date font-mono">{e.date}</div>
                      <div className="chron-stack-status">
                        {status === "accepted" && <span className="status-chip status-accepted">✓ on timeline</span>}
                        {status === "pending"  && <span className="status-chip status-pending">draft</span>}
                        {status === "rejected" && <span className="status-chip status-rejected">excluded</span>}
                      </div>
                    </div>
                    <div className="chron-stack-body">
                      <div className="chron-stack-desc">{e.description}</div>
                      <div className="chron-stack-meta">
                        {e.issueTags.map((t) => <span key={t} className="issue-pill">{t}</span>)}
                        <BatesChip b={e.citation.bates} page={e.citation.page} verified={e.citation.verified} onJump={onJumpDoc} />
                        <span className="meta-conf">
                          <span className={"conf-dot " + e.confidence}></span> {e.confidence}
                        </span>
                      </div>
                    </div>
                    <div className="chron-stack-actions">
                      {status !== "accepted" && (
                        <button className="btn-accept" onClick={() => decide(e, true)} title="Accept (A)">
                          ✓ Accept
                        </button>
                      )}
                      {status === "accepted" && (
                        <button className="btn-secondary small" onClick={() => decide(e, null)}>↺ Reopen</button>
                      )}
                      {status === "pending" && (
                        <button className="btn-reject" onClick={() => decide(e, false)} title="Reject (R)">✕</button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {exportOpen && <ExportPreview kind={exportOpen} chronology={data.chronology.filter(e => e.accepted === true)} matter={data.matter} onClose={() => setExportOpen(null)} />}
      </div>
    );
  };

  function ExportPreview({ kind, chronology, matter, onClose }) {
    return (
      <div className="modal-shroud" onClick={onClose}>
        <div className="modal export-modal" onClick={(e) => e.stopPropagation()}>
          <header className="modal-head">
            <div>
              <div className="modal-eyebrow">{kind === "pdf" ? "COURT PDF · PREVIEW" : "WORD DOC · PREVIEW"}</div>
              <h3 className="modal-title font-display">Chronology of events — {matter.name}</h3>
            </div>
            <button className="modal-close" onClick={onClose}>×</button>
          </header>
          <div className="modal-body export-doc">
            <div className="export-doc-head">
              <div className="font-display export-doc-title">Chronology of Events</div>
              <div className="export-doc-sub">
                {matter.name} · {matter.matterType}<br/>
                Prepared {new Date().toISOString().slice(0,10)} · Lead {matter.leadAttorney}
              </div>
            </div>
            <table className="export-doc-table">
              <thead>
                <tr><th>Date</th><th>Event</th><th>Source</th></tr>
              </thead>
              <tbody>
                {chronology.map((e) => (
                  <tr key={e.id}>
                    <td className="font-mono">{e.date}</td>
                    <td>{e.description}</td>
                    <td className="font-mono">{e.citation.bates}, p. {e.citation.page}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="export-doc-foot">
              Every citation in this chronology has been verified against its source page.
              Confidence and acceptance status are recorded in the matter audit trail.
            </div>
          </div>
          <footer className="modal-foot">
            <button className="btn-secondary" onClick={onClose}>Close</button>
            <button className="btn-primary">⤓ Download {kind === "pdf" ? "PDF" : ".docx"}</button>
          </footer>
        </div>
      </div>
    );
  }

  // ╔═══════════════════════════════════════════════════════════╗
  // ║ Privilege queue + log generator                            ║
  // ╚═══════════════════════════════════════════════════════════╝
  window.PrivilegePanel = function PrivilegePanel({ onJumpDoc, onTouch }) {
    const data = T();
    const queueAll = data.documents.filter(d => d.privilege === "flagged");
    const [tick, setTick] = useState(0);
    const [selectedId, setSelectedId] = useState(queueAll[0]?.id || null);
    const [logOpen, setLogOpen] = useState(false);

    function decide(doc, action) {
      doc.privilege = action === "clear" ? "cleared" : "withheld";
      onTouch && onTouch();
      setTick(t => t + 1);
    }
    const queue = data.documents.filter(d => d.privilege === "flagged");
    const decided = data.documents.filter(d => d.privilege === "cleared" || d.privilege === "withheld");
    const selected = data.documents.find(d => d.id === selectedId) || queue[0];

    return (
      <div className="panel priv-panel">
        <PanelHead
          eyebrow="PRIVILEGE REVIEW · HUMAN-IN-THE-LOOP"
          title={`${queue.length} flagged · ${decided.length} decided`}
          sub="The system flags; a human decides. Every decision is logged and dated."
          actions={
            <div className="panel-actions">
              <button className="btn-secondary" onClick={() => setLogOpen(true)}>⤓ Generate privilege log</button>
            </div>
          }
        />

        <div className="priv-split">
          <aside className="priv-queue">
            <div className="priv-queue-h">REVIEW QUEUE</div>
            {queue.length === 0 && <div className="priv-empty">Queue clear ✓</div>}
            {queue.map((d) => (
              <button key={d.id} className={"priv-queue-row " + (d.id === selected?.id ? "active" : "")} onClick={() => setSelectedId(d.id)}>
                <div className="priv-queue-top">
                  <span className="bates-chip">{d.bates}</span>
                  <span className="priv-queue-date font-mono">{d.date}</span>
                </div>
                <div className="priv-queue-title">{d.title}</div>
                <div className="priv-queue-basis">{d.privilegeBasis}</div>
              </button>
            ))}
            <div className="priv-queue-h" style={{ marginTop: 12 }}>DECIDED · APPEND-ONLY</div>
            {decided.map((d) => (
              <div key={d.id} className="priv-decided-row">
                <span className="bates-chip">{d.bates}</span>
                <span className={"priv-decision priv-decision-" + d.privilege}>
                  {d.privilege === "cleared" ? "✓ cleared" : "🔒 withheld"}
                </span>
              </div>
            ))}
          </aside>

          <main className="priv-reviewer">
            {selected ? (
              <>
                <div className="priv-rev-head">
                  <div>
                    <div className="priv-rev-bates">
                      <span className="bates-chip">{selected.bates}</span>
                      <span className="priv-flag">🔒 PRIVILEGE FLAG</span>
                      <span className="priv-rev-date font-mono">{selected.date}</span>
                    </div>
                    <h3 className="priv-rev-title font-display">{selected.title}</h3>
                  </div>
                </div>
                <div className="priv-rev-meta">
                  <div><span className="meta-k">FROM</span><span className="meta-v">{selected.author}</span></div>
                  <div><span className="meta-k">TO</span><span className="meta-v">{selected.recipients.join(", ")}</span></div>
                  <div><span className="meta-k">TYPE</span><span className="meta-v">{selected.type}</span></div>
                  <div><span className="meta-k">BASIS</span><span className="meta-v">{selected.privilegeBasis}</span></div>
                </div>
                <div className="priv-rev-source">
                  <div className="priv-source-h">SOURCE · WITHHELD UNTIL DECIDED</div>
                  <pre className="priv-source-body">{selected.body}</pre>
                </div>
                <div className="priv-rev-actions">
                  <button className="btn-decision btn-clear" onClick={() => decide(selected, "clear")}>
                    ✓ Clear — not privileged
                  </button>
                  <button className="btn-decision btn-withhold" onClick={() => decide(selected, "withhold")}>
                    🔒 Withhold — log as privileged
                  </button>
                  <div className="priv-rev-actor">decided by <strong>D. Okafor</strong> · logged to audit</div>
                </div>
              </>
            ) : (
              <div className="priv-empty-big">Queue is clear. Generate the privilege log when ready.</div>
            )}
          </main>
        </div>

        {logOpen && <PrivilegeLogPreview decided={decided} matter={data.matter} onClose={() => setLogOpen(false)} />}
      </div>
    );
  };

  function PrivilegeLogPreview({ decided, matter, onClose }) {
    const withheld = decided.filter(d => d.privilege === "withheld");
    return (
      <div className="modal-shroud" onClick={onClose}>
        <div className="modal export-modal" onClick={(e) => e.stopPropagation()}>
          <header className="modal-head">
            <div>
              <div className="modal-eyebrow">PRIVILEGE LOG · COURT FORMAT</div>
              <h3 className="modal-title font-display">Privilege Log — {matter.name}</h3>
            </div>
            <button className="modal-close" onClick={onClose}>×</button>
          </header>
          <div className="modal-body export-doc">
            <table className="export-doc-table priv-log-table">
              <thead>
                <tr>
                  <th>#</th><th>Bates</th><th>Date</th><th>Type</th>
                  <th>Author</th><th>Recipients</th><th>Basis</th><th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {withheld.map((d, i) => (
                  <tr key={d.id}>
                    <td className="font-mono">{i + 1}</td>
                    <td className="font-mono">{d.bates}</td>
                    <td className="font-mono">{d.date}</td>
                    <td>{d.type}</td>
                    <td>{d.author}</td>
                    <td>{d.recipients.join("; ")}</td>
                    <td>{d.privilegeBasis}</td>
                    <td>Withheld</td>
                  </tr>
                ))}
                {withheld.length === 0 && (
                  <tr><td colSpan="8" style={{ textAlign: "center", padding: 20, color: "var(--ink-faint)" }}>No documents withheld yet.</td></tr>
                )}
              </tbody>
            </table>
            <div className="export-doc-foot">
              Generated {new Date().toISOString().slice(0,10)} · {matter.name} · Lead {matter.leadAttorney}.
              All decisions audited; basis stated per FRCP 26(b)(5)(A).
            </div>
          </div>
          <footer className="modal-foot">
            <button className="btn-secondary" onClick={onClose}>Close</button>
            <button className="btn-secondary">⤓ .xlsx</button>
            <button className="btn-primary">⤓ PDF (court-ready)</button>
          </footer>
        </div>
      </div>
    );
  }

  // ╔═══════════════════════════════════════════════════════════╗
  // ║ Exhibit binder — build, label, export                      ║
  // ╚═══════════════════════════════════════════════════════════╝
  // Stored in window.__binders so cmd-palette + chat can push into it
  if (!window.__binders) {
    window.__binders = [
      { id: "b1", name: "MSJ exhibits — Reyes opposition", items: [
        { docId: "d1", label: "Ex. A — Wage complaint, 2021-02-11" },
        { docId: "d3", label: "Ex. B — Negative review, 2021-02-26 (15 days later)" },
        { docId: "d4", label: "Ex. C — Brandt memo, 2021-03-12" },
        { docId: "d5", label: "Ex. D — Termination letter, 2021-03-15" },
      ] },
      { id: "b2", name: "Brandt deposition prep", items: [
        { docId: "d3", label: "Ex. 1 — Performance review (authored)" },
        { docId: "d4", label: "Ex. 2 — Memo to file (authored)" },
      ] },
    ];
  }
  window.binderPush = function binderPush(binderId, docIds) {
    const b = window.__binders.find(x => x.id === binderId);
    if (!b) return;
    docIds.forEach((id) => {
      if (!b.items.find(i => i.docId === id)) {
        const doc = T().documents.find(d => d.id === id);
        if (doc) b.items.push({ docId: id, label: `${doc.bates} — ${doc.title}` });
      }
    });
  };

  window.BinderPanel = function BinderPanel({ onJumpDoc }) {
    const data = T();
    const [activeId, setActiveId] = useState(window.__binders[0]?.id);
    const [tick, setTick] = useState(0);
    const dragRef = useRef(null);
    const active = window.__binders.find(b => b.id === activeId);

    function setLabel(itemId, label) {
      active.items = active.items.map(it => it.docId === itemId ? { ...it, label } : it);
      setTick(t => t + 1);
    }
    function remove(itemId) {
      active.items = active.items.filter(it => it.docId !== itemId);
      setTick(t => t + 1);
    }
    function reorder(from, to) {
      const items = active.items.slice();
      const [m] = items.splice(from, 1);
      items.splice(to, 0, m);
      active.items = items;
      setTick(t => t + 1);
    }
    function addBinder() {
      const id = "b" + Date.now();
      window.__binders.push({ id, name: "Untitled binder", items: [] });
      setActiveId(id);
      setTick(t => t + 1);
    }

    return (
      <div className="panel binder-panel">
        <PanelHead
          eyebrow="EXHIBIT BINDER · BUILD FOR PRODUCTION"
          title="Binders"
          sub="Pin docs to a binder, label them as exhibits, reorder, export."
          actions={
            <div className="panel-actions">
              <button className="btn-secondary" onClick={addBinder}>＋ New binder</button>
              {active && <button className="btn-primary">⤓ Export binder ({active.items.length})</button>}
            </div>
          }
        />
        <div className="binder-split">
          <aside className="binder-list">
            {window.__binders.map((b) => (
              <button key={b.id} className={"binder-list-row " + (b.id === activeId ? "active" : "")} onClick={() => setActiveId(b.id)}>
                <div className="binder-list-name">{b.name}</div>
                <div className="binder-list-count">{b.items.length} ex.</div>
              </button>
            ))}
          </aside>
          <main className="binder-work">
            {active && (
              <>
                <div className="binder-title-row">
                  <input className="binder-title-input font-display" value={active.name}
                         onChange={(e) => { active.name = e.target.value; setTick(t=>t+1); }} />
                  <span className="binder-stat">{active.items.length} exhibits · ordered</span>
                </div>
                <ol className="binder-items">
                  {active.items.map((it, i) => {
                    const doc = data.documents.find(d => d.id === it.docId);
                    if (!doc) return null;
                    return (
                      <li key={it.docId}
                          draggable
                          onDragStart={() => { dragRef.current = i; }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => { if (dragRef.current != null) reorder(dragRef.current, i); }}
                          className="binder-item">
                        <div className="binder-drag" title="Drag to reorder">⋮⋮</div>
                        <div className="binder-num font-mono">{String(i + 1).padStart(2, "0")}</div>
                        <div className="binder-body">
                          <input className="binder-label" value={it.label} onChange={(e) => setLabel(it.docId, e.target.value)} />
                          <div className="binder-meta">
                            <span className="bates-chip">{doc.bates}</span>
                            <span className="binder-meta-sep">·</span>
                            <span>{doc.type}</span>
                            <span className="binder-meta-sep">·</span>
                            <span className="font-mono">{doc.date}</span>
                            <button className="micro-btn" onClick={() => onJumpDoc && onJumpDoc(doc.bates)}>open ›</button>
                          </div>
                        </div>
                        <button className="binder-rm" onClick={() => remove(it.docId)} title="Remove">×</button>
                      </li>
                    );
                  })}
                  {active.items.length === 0 && (
                    <li className="binder-empty">
                      Empty binder. Drag documents here from the Documents tab, or use Cmd+K → "add to binder".
                    </li>
                  )}
                </ol>
              </>
            )}
          </main>
        </div>
      </div>
    );
  };

  // ╔═══════════════════════════════════════════════════════════╗
  // ║ Documents — list + split viewer + side-by-side compare    ║
  // ╚═══════════════════════════════════════════════════════════╝
  window.DocumentsPanel = function DocumentsPanel({ jumpTo, onJumpDoc }) {
    const data = T();
    // Pad demo doc set with a few ambient stand-ins so the list looks real
    const docs = data.documents;
    const [selA, setSelA] = useState(jumpTo ? data.documents.find(d => d.bates === jumpTo)?.id : "d1");
    const [selB, setSelB] = useState(null); // for compare
    const [filter, setFilter] = useState("");

    useEffect(() => {
      if (jumpTo) {
        const d = data.documents.find(x => x.bates === jumpTo);
        if (d) setSelA(d.id);
      }
    }, [jumpTo]);

    const filtered = docs.filter(d =>
      !filter ||
      d.title.toLowerCase().includes(filter.toLowerCase()) ||
      d.bates.toLowerCase().includes(filter.toLowerCase()) ||
      d.author.toLowerCase().includes(filter.toLowerCase())
    );
    const a = docs.find(d => d.id === selA);
    const b = selB ? docs.find(d => d.id === selB) : null;

    return (
      <div className="panel docs-panel">
        <PanelHead
          eyebrow="DOCUMENTS · CORPUS"
          title={`${docs.length} hot documents · 11,920 in corpus`}
          sub={b ? "Side-by-side compare mode. Esc to exit." : "Click any document. Shift-click a second to compare side-by-side."}
        />
        <div className="docs-grid">
          <aside className="docs-list">
            <div className="docs-filter">
              <span className="docs-filter-ico">⌕</span>
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter by Bates, title, author" />
              <span className="docs-filter-count font-mono">{filtered.length}</span>
            </div>
            <ul className="docs-list-rows">
              {filtered.map((d) => (
                <li key={d.id}
                    className={"docs-list-row " +
                      (d.id === selA ? "selA " : "") +
                      (d.id === selB ? "selB " : "") +
                      (d.hot ? "hot " : "") +
                      (d.privilege === "flagged" ? "priv " : "")}
                    onClick={(e) => {
                      if (e.shiftKey && d.id !== selA) setSelB(d.id);
                      else { setSelA(d.id); setSelB(null); }
                    }}>
                  <div className="docs-list-top">
                    <span className="bates-chip">{d.bates}</span>
                    {d.hot && <span className="hot-tag-mini">HOT</span>}
                    {d.privilege === "flagged" && <span className="priv-mini">🔒</span>}
                    <span className="docs-list-date font-mono">{d.date}</span>
                  </div>
                  <div className="docs-list-title">{d.title}</div>
                  <div className="docs-list-author">{d.author}</div>
                </li>
              ))}
            </ul>
            <div className="docs-list-foot">
              <span className="kbd-row"><Kbd k="J"/><Kbd k="K"/> next · prev · <Kbd k="⇧⌥ click"/> compare</span>
            </div>
          </aside>
          <main className={"docs-viewer " + (b ? "compare" : "")}>
            {a && <DocView doc={a} side="A" />}
            {b && <DocView doc={b} side="B" onClose={() => setSelB(null)} />}
          </main>
        </div>
      </div>
    );
  };

  function DocView({ doc, side, onClose }) {
    const data = T();
    const thread = doc.threadId
      ? data.documents.filter(x => x.threadId === doc.threadId).sort((a, b) => (a.threadPos || 0) - (b.threadPos || 0))
      : [];
    const isPriv = doc.privilege === "flagged" || doc.privilege === "withheld";
    return (
      <div className={"doc-view doc-view-" + side}>
        <header className="doc-view-head">
          <span className="doc-view-side">{side}</span>
          <div className="doc-view-titleblock">
            <div className="doc-view-bates">
              <span className="bates-chip">{doc.bates}</span>
              {doc.hot && <span className="hot-tag-mini">HOT</span>}
              {isPriv && <span className="priv-tag">🔒 PRIVILEGED</span>}
              <span className="doc-view-date font-mono">{doc.date}</span>
            </div>
            <h3 className="doc-view-title font-display">{doc.title}</h3>
          </div>
          {onClose && <button className="modal-close" onClick={onClose}>×</button>}
        </header>
        <div className="doc-view-meta">
          <div><span className="meta-k">FROM</span><span className="meta-v">{doc.author}</span></div>
          <div><span className="meta-k">TO</span><span className="meta-v">{doc.recipients.join(", ")}</span></div>
          {doc.threadId && <div><span className="meta-k">THREAD</span><span className="meta-v">message {doc.threadPos} of {doc.threadLen}</span></div>}
          <div><span className="meta-k">OCR</span><span className="meta-v"><span className={"conf-dot " + doc.ocrConfidence}></span> {doc.ocrConfidence}</span></div>
        </div>
        {isPriv ? (
          <div className="doc-view-priv">
            <div className="priv-wall-icon">🔒</div>
            <div className="priv-wall-title">Body withheld pending privilege decision</div>
            <div className="priv-wall-body">{doc.privilegeBasis}</div>
          </div>
        ) : (
          <div className="doc-view-source">
            <pre className="source-page">{doc.body}</pre>
          </div>
        )}
        {thread.length > 1 && (
          <div className="doc-view-thread">
            <div className="doc-view-thread-h">THREAD · {thread.length} messages</div>
            {thread.map((m) => (
              <div key={m.id} className={"thread-pin " + (m.id === doc.id ? "current" : "")}>
                <span className="font-mono">{m.threadPos}.</span> {m.bates} · {m.date} · {m.author}
              </div>
            ))}
          </div>
        )}
        <div className="doc-view-actions">
          <button className="micro-btn">⎘ Copy Bates cite</button>
          <button className="micro-btn">＋ Add to binder</button>
          <button className="micro-btn">⌬ Mark hot</button>
          <button className="micro-btn">↺ Reviewed</button>
        </div>
      </div>
    );
  }
})();
