/* global React */
// The Scales of Themis — claims vs defenses, beam tilts by accepted+verified weight.
// Reads from window.THEMIS.

(function () {
  const { useState, useMemo, useEffect } = React;
  const T = () => window.THEMIS;

  // ── Compute the weight tokens that "drop" into pans ──
  // Each accepted, verified chronology event becomes a weighted token under
  // the claim(s) supported by it. Each pending event is translucent.
  function buildTokens() {
    const { chronology, graph } = T();
    // Build claim → supporting events from edges
    const claimSupport = {};
    graph.edges.filter(e => e.type === "supports").forEach((e) => {
      const claimId = e.a, eventOrDoc = e.b;
      claimSupport[claimId] = claimSupport[claimId] || [];
      claimSupport[claimId].push({ targetId: eventOrDoc, verified: e.verified });
    });

    // For our Reyes case: bin tokens into Plaintiff vs Defense
    const plaintiff = [];   // tokens (each has weight, accepted, label, citation)
    const defense = [];

    // claims = cl1..cl3, defenses = df1, df2
    function eventById(id) { return chronology.find(c => c.id === id); }
    function docById(id) { return T().documents.find(d => d.id === id); }

    Object.entries(claimSupport).forEach(([claimId, list]) => {
      const side = claimId.startsWith("cl") ? plaintiff : defense;
      list.forEach((it) => {
        const ev = eventById(it.targetId);
        const dc = docById(it.targetId);
        if (ev) {
          side.push({
            id: claimId + ":" + ev.id,
            kind: "event",
            label: ev.description,
            date: ev.date,
            confidence: ev.confidence,
            accepted: ev.accepted,
            citation: ev.citation,
            weight: ev.confidence === "high" ? 3 : ev.confidence === "medium" ? 2 : 1,
            claimId,
          });
        } else if (dc) {
          side.push({
            id: claimId + ":" + dc.id,
            kind: "doc",
            label: dc.title,
            date: dc.date,
            confidence: dc.ocrConfidence,
            accepted: !dc.hot ? false : true,  // hot docs are "accepted as relevant"
            citation: { bates: dc.bates, page: 1, verified: true },
            weight: dc.hot ? 2 : 1,
            claimId,
          });
        }
      });
    });
    return { plaintiff, defense };
  }

  // Tilt: positive = beam tips toward plaintiff (left), negative toward defense (right)
  function tilt(p, d) {
    const grounded = (arr) => arr.filter(t => t.accepted === true).reduce((s, t) => s + t.weight, 0);
    const pw = grounded(p), dw = grounded(d);
    const total = pw + dw + 0.0001;
    return { pw, dw, ratio: (pw - dw) / total };
  }

  window.Scales = function Scales({ onSelectEvent, onAccept }) {
    const [tokens, setTokens] = useState(() => buildTokens());

    // re-compute when external state shifts (parent can call ref via key)
    useEffect(() => { setTokens(buildTokens()); }, []);

    const { plaintiff, defense } = tokens;
    const { pw, dw, ratio } = useMemo(() => tilt(plaintiff, defense), [plaintiff, defense]);

    // Beam tilt angle: cap ±14deg
    const angle = Math.max(-14, Math.min(14, ratio * 14));

    return (
      <div className="scales-wrap">
        {/* The scales SVG instrument */}
        <div className="scales-stage">
          <svg viewBox="0 0 900 520" className="scales-svg" preserveAspectRatio="xMidYMid meet">
            {/* base */}
            <defs>
              <linearGradient id="brassGrad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#e9cf95" />
                <stop offset="0.5" stopColor="#caa05c" />
                <stop offset="1" stopColor="#845f27" />
              </linearGradient>
              <filter id="softGlow">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {/* base pedestal */}
            <rect x="380" y="460" width="140" height="20" rx="3" fill="url(#brassGrad)" />
            <rect x="350" y="478" width="200" height="12" rx="2" fill="#3a2a14" opacity="0.8" />
            {/* column */}
            <rect x="445" y="170" width="10" height="290" fill="url(#brassGrad)" />
            {/* fulcrum */}
            <circle cx="450" cy="170" r="9" fill="url(#brassGrad)" stroke="#3a2a14" strokeWidth="1.2" />

            {/* beam (tilted) */}
            <g transform={`rotate(${angle} 450 170)`} style={{ transition: "transform 700ms cubic-bezier(.4,1.6,.4,1)" }}>
              <rect x="100" y="166" width="700" height="8" rx="3" fill="url(#brassGrad)" />
              {/* drop chains */}
              <line x1="170" y1="170" x2="170" y2="265" stroke="#caa05c" strokeWidth="1.6" />
              <line x1="220" y1="170" x2="220" y2="265" stroke="#caa05c" strokeWidth="1.6" />
              <line x1="680" y1="170" x2="680" y2="265" stroke="#caa05c" strokeWidth="1.6" />
              <line x1="730" y1="170" x2="730" y2="265" stroke="#caa05c" strokeWidth="1.6" />

              {/* left pan (plaintiff) */}
              <g>
                <ellipse cx="195" cy="282" rx="115" ry="18" fill="#5e4a25" opacity="0.6" />
                <path d="M 80 265 Q 195 320 310 265 L 295 280 Q 195 322 95 280 Z" fill="url(#brassGrad)" />
                <ellipse cx="195" cy="265" rx="115" ry="14" fill="#dcc18a" stroke="#7a5c2a" strokeWidth="1" />
                <text x="195" y="245" textAnchor="middle" className="scales-pan-label">PLAINTIFF · CLAIMS</text>
              </g>

              {/* right pan (defense) */}
              <g>
                <ellipse cx="705" cy="282" rx="115" ry="18" fill="#5e4a25" opacity="0.6" />
                <path d="M 590 265 Q 705 320 820 265 L 805 280 Q 705 322 605 280 Z" fill="url(#brassGrad)" />
                <ellipse cx="705" cy="265" rx="115" ry="14" fill="#dcc18a" stroke="#7a5c2a" strokeWidth="1" />
                <text x="705" y="245" textAnchor="middle" className="scales-pan-label">DEFENDANT · DEFENSES</text>
              </g>
            </g>

            {/* ornamental crest */}
            <g transform="translate(450 110)" opacity="0.7">
              <path d="M -34 50 L 0 14 L 34 50 Z" fill="none" stroke="#caa05c" strokeWidth="1.2" />
              <circle cx="0" cy="14" r="3" fill="#caa05c" />
            </g>
          </svg>

          {/* HTML token layer — positioned to match the tilted beam */}
          <div className="scales-tokens" style={{ "--angle": angle + "deg" }}>
            <Pan side="left" tokens={plaintiff} onSelect={onSelectEvent} onAccept={onAccept} />
            <Pan side="right" tokens={defense} onSelect={onSelectEvent} onAccept={onAccept} />
          </div>
        </div>

        {/* Readout */}
        <div className="scales-readout">
          <div className="scales-readout-side">
            <div className="scales-readout-pill verify">▲ PLAINTIFF · GROUNDED WEIGHT</div>
            <div className="scales-readout-num">{pw}</div>
            <div className="scales-readout-floating">+ {plaintiff.filter(t => t.accepted !== true).length} pending</div>
          </div>
          <div className="scales-readout-mid">
            <div className="scales-readout-tilt">{angle === 0 ? "BALANCED" : (angle < 0 ? "TIPPED →" : "← TIPPED")}</div>
            <div className="scales-readout-tiltnum">{angle.toFixed(1)}°</div>
            <div className="scales-readout-help">Only <em>accepted + verified</em> evidence moves the beam.</div>
          </div>
          <div className="scales-readout-side" style={{ textAlign: "right" }}>
            <div className="scales-readout-pill flag">▽ DEFENSE · GROUNDED WEIGHT</div>
            <div className="scales-readout-num">{dw}</div>
            <div className="scales-readout-floating">+ {defense.filter(t => t.accepted !== true).length} pending</div>
          </div>
        </div>
      </div>
    );
  };

  function Pan({ side, tokens, onSelect, onAccept }) {
    return (
      <div className={"scales-pan scales-pan-" + side}>
        <div className="scales-pan-stack">
          {tokens.map((t) => (
            <Token key={t.id} t={t} onSelect={onSelect} onAccept={onAccept} side={side} />
          ))}
        </div>
      </div>
    );
  }

  function Token({ t, onSelect, onAccept, side }) {
    const grounded = t.accepted === true;
    const cls = "scales-token " + (grounded ? "grounded " : "floating ") + (t.confidence || "high");
    return (
      <div className={cls} onClick={() => onSelect && onSelect(t)}>
        <div className="scales-token-bates">
          <span className="bates-chip">{t.citation.bates}</span>
          <span className="scales-token-date">{t.date}</span>
        </div>
        <div className="scales-token-label">{t.label}</div>
        <div className="scales-token-foot">
          <span className={"conf-dot " + (t.confidence || "high")}></span>
          <span className="conf-text">{t.confidence || "high"} confidence</span>
          {!grounded && (
            <button
              className="scales-token-accept"
              onClick={(e) => { e.stopPropagation(); onAccept && onAccept(t); }}
            >Accept</button>
          )}
          {grounded && <span className="scales-token-grounded">✓ grounded</span>}
        </div>
      </div>
    );
  }

  window.ScalesBuildTokens = buildTokens;
})();
