/* global React */
// Command palette (Cmd+K).
// Fuzzy-filter list of actions: navigation, doc jumps, accept/reject, generate exports.

(function () {
  const { useState, useEffect, useRef, useMemo } = React;
  const T = () => window.THEMIS;

  function fuzzy(q, s) {
    if (!q) return 0;
    s = s.toLowerCase(); q = q.toLowerCase();
    let i = 0, score = 0, run = 0;
    for (const ch of s) {
      if (q[i] === ch) { i++; run++; score += 2 + run; }
      else { run = 0; }
      if (i === q.length) break;
    }
    return i === q.length ? score : 0;
  }

  window.CommandPalette = function CommandPalette({ open, onClose, onTab, onJumpDoc, onSetMode, onLightToggle, onReplay, onGenerate, onAcceptNext }) {
    const [q, setQ] = useState("");
    const [idx, setIdx] = useState(0);
    const inputRef = useRef(null);
    const listRef = useRef(null);

    useEffect(() => {
      if (open) {
        setQ(""); setIdx(0);
        setTimeout(() => inputRef.current && inputRef.current.focus(), 30);
      }
    }, [open]);

    const all = useMemo(() => buildCommands({ onTab, onJumpDoc, onSetMode, onLightToggle, onReplay, onGenerate, onAcceptNext, onClose }), [onTab, onJumpDoc, onSetMode, onLightToggle, onReplay, onGenerate, onAcceptNext, onClose]);

    const items = useMemo(() => {
      if (!q) return all;
      return all
        .map((c) => ({ c, s: Math.max(fuzzy(q, c.label), fuzzy(q, c.section) * 0.4, ...(c.kw || []).map(k => fuzzy(q, k))) }))
        .filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map(x => x.c);
    }, [q, all]);

    useEffect(() => { setIdx(0); }, [q]);
    useEffect(() => {
      if (listRef.current) {
        const el = listRef.current.querySelector(".cmd-row.on");
        if (el) el.scrollIntoView({ block: "nearest" });
      }
    }, [idx, items]);

    function run(c) {
      if (!c) return;
      onClose && onClose();
      setTimeout(() => c.action && c.action(), 50);
    }

    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(items.length - 1, i + 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); return; }
      if (e.key === "Enter")     { e.preventDefault(); run(items[idx]); return; }
    }

    if (!open) return null;

    // group by section for display
    const groups = [];
    const map = {};
    items.forEach((c) => {
      if (!map[c.section]) { map[c.section] = []; groups.push({ name: c.section, list: map[c.section] }); }
      map[c.section].push(c);
    });

    return (
      <div className="cmdk-shroud" onClick={onClose}>
        <div className="cmdk-panel" onClick={(e) => e.stopPropagation()}>
          <div className="cmdk-input-row">
            <span className="cmdk-prompt">⌘K</span>
            <input
              ref={inputRef}
              className="cmdk-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKey}
              placeholder="Type a command, doc, or question…"
              spellCheck={false}
            />
            <span className="cmdk-esc">esc</span>
          </div>
          <div ref={listRef} className="cmdk-list">
            {groups.map((g) => (
              <div key={g.name} className="cmdk-group">
                <div className="cmdk-group-head">{g.name}</div>
                {g.list.map((c, i) => {
                  const flatIdx = items.indexOf(c);
                  return (
                    <button
                      key={c.id}
                      className={"cmd-row " + (flatIdx === idx ? "on" : "")}
                      onMouseEnter={() => setIdx(flatIdx)}
                      onClick={() => run(c)}
                    >
                      <span className="cmd-glyph">{c.glyph || "›"}</span>
                      <span className="cmd-label">{c.label}</span>
                      {c.detail && <span className="cmd-detail">{c.detail}</span>}
                      {c.shortcut && <span className="cmd-shortcut font-mono">{c.shortcut}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
            {items.length === 0 && <div className="cmdk-empty">No matches for "{q}". Try a Bates number or "/help".</div>}
          </div>
          <div className="cmdk-foot">
            <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
            <span><kbd>↵</kbd> run</span>
            <span><kbd>esc</kbd> close</span>
          </div>
        </div>
      </div>
    );
  };

  function buildCommands(o) {
    const data = T();
    const cmds = [];

    // Navigation
    [
      { id: "go-ask", label: "Go to Ask Themis", glyph: "❯", shortcut: "⌘1", action: () => o.onTab && o.onTab("ask") },
      { id: "go-chron", label: "Go to Chronology", glyph: "⌛", shortcut: "⌘2", action: () => o.onTab && o.onTab("chronology") },
      { id: "go-priv", label: "Go to Privilege Queue", glyph: "🔒", shortcut: "⌘3", action: () => o.onTab && o.onTab("privilege") },
      { id: "go-bind", label: "Go to Binders", glyph: "▤", shortcut: "⌘4", action: () => o.onTab && o.onTab("binder") },
      { id: "go-docs", label: "Go to Documents", glyph: "▥", shortcut: "⌘5", action: () => o.onTab && o.onTab("documents") },
    ].forEach((c) => cmds.push({ ...c, section: "NAVIGATE" }));

    // Mode toggles
    cmds.push({
      id: "mode-brain", label: "Switch to Brain mode (cinematic)",
      glyph: "◉", section: "MODE", kw: ["demo", "presentation"],
      action: () => o.onSetMode && o.onSetMode("brain"),
    });
    cmds.push({
      id: "mode-worktop", label: "Switch to Worktop mode (daily)",
      glyph: "□", section: "MODE", kw: ["work", "daily"],
      action: () => o.onSetMode && o.onSetMode("worktop"),
    });
    cmds.push({
      id: "theme", label: "Toggle light / dark theme",
      glyph: "◐", section: "MODE", shortcut: "⌘D",
      action: () => o.onLightToggle && o.onLightToggle(),
    });

    // Actions
    cmds.push({
      id: "replay", label: "Replay ingest assembly", glyph: "↻", section: "ACTIONS",
      action: () => o.onReplay && o.onReplay(),
    });
    cmds.push({
      id: "gen-priv", label: "Generate privilege log (court PDF)", glyph: "⤓",
      section: "ACTIONS · OUTPUT", detail: "FRCP 26(b)(5)",
      action: () => o.onGenerate && o.onGenerate("privilege"),
    });
    cmds.push({
      id: "gen-chron", label: "Generate court chronology (Word + PDF)", glyph: "⤓",
      section: "ACTIONS · OUTPUT",
      action: () => o.onGenerate && o.onGenerate("chronology"),
    });
    cmds.push({
      id: "gen-binder", label: "Export current binder as labeled exhibit set", glyph: "⤓",
      section: "ACTIONS · OUTPUT",
      action: () => o.onGenerate && o.onGenerate("binder"),
    });
    cmds.push({
      id: "accept-next", label: "Accept next pending chronology event", glyph: "✓",
      section: "ACTIONS", shortcut: "A",
      action: () => o.onAcceptNext && o.onAcceptNext(),
    });

    // Doc jumps
    data.documents.forEach((d) => {
      cmds.push({
        id: "doc-" + d.id,
        label: d.bates + " — " + d.title,
        glyph: d.hot ? "★" : (d.privilege === "flagged" ? "🔒" : "▢"),
        section: "OPEN DOCUMENT",
        detail: d.date + " · " + d.type,
        kw: [d.bates, d.author, d.type, ...(d.entities || [])],
        action: () => { o.onTab && o.onTab("documents"); o.onJumpDoc && o.onJumpDoc(d.bates); },
      });
    });

    // Entity jumps
    data.entities.forEach((e) => {
      cmds.push({
        id: "ent-" + e.id,
        label: "Show " + e.name + "'s dossier",
        glyph: "👤", section: "ENTITIES",
        detail: e.role + " · " + e.mentions.toLocaleString() + " mentions",
        kw: [e.name, ...(e.aliases || [])],
        action: () => { /* future: dedicated entity dossier */ o.onTab && o.onTab("documents"); },
      });
    });

    // Quick queries
    ["What did Tom Brandt write about Reyes?", "Show me everything around the negative review", "Compare NW-000847 and NW-000851", "What's our retaliation theory?"].forEach((p, i) => {
      cmds.push({
        id: "q-" + i, label: p, glyph: "❯", section: "ASK THEMIS",
        action: () => { o.onTab && o.onTab("ask"); /* could prefill */ },
      });
    });

    return cmds;
  }
})();
