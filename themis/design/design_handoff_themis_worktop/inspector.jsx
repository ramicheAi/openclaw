/* global React */
// Inspector — slides over the canvas when a node is selected.
// Renders document body, entity dossier, event detail, or claim/defense panel.

(function () {
  const { useState } = React;

  window.Inspector = function Inspector({ node, onClose, onJump, onAccept, onReject }) {
    if (!node) return null;
    return (
      <aside className="inspector animate-fade">
        <header className="inspector-head">
          <div className="inspector-kind">{prettyKind(node)}</div>
          <button className="inspector-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="inspector-body">
          {node.kind === "doc" && node.doc && <DocPanel doc={node.doc} onJump={onJump} />}
          {node.kind === "entity" && node.entity && <EntityPanel entity={node.entity} onJump={onJump} />}
          {node.kind === "event" && node.event && <EventPanel event={node.event} onAccept={onAccept} onReject={onReject} onJump={onJump} />}
          {node.kind === "claim" && <ClaimPanel claim={node} onJump={onJump} />}
          {node.kind === "defense" && <DefensePanel defense={node} onJump={onJump} />}
        </div>
      </aside>
    );
  };

  function prettyKind(n) {
    if (n.kind === "doc") return n.doc ? n.doc.type.toUpperCase() : "DOCUMENT";
    if (n.kind === "entity") return "ENTITY";
    if (n.kind === "event") return "CHRONOLOGY EVENT";
    if (n.kind === "claim") return "PLAINTIFF CLAIM";
    if (n.kind === "defense") return "DEFENSE";
    return "NODE";
  }

  function ConfDot({ level }) {
    const m = {
      high: { txt: "high", cls: "verify" },
      medium: { txt: "medium", cls: "flag" },
      low: { txt: "low", cls: "danger" },
    };
    const c = m[level] || m.high;
    return (
      <span className="inspector-conf">
        <span className={"conf-dot " + level}></span>
        <span>{c.txt} confidence</span>
      </span>
    );
  }

  function CitationChip({ c }) {
    return (
      <span className={"cite-chip " + (c.verified ? "v" : "u")} title={c.verified ? "Citation verified against source page" : "Citation not yet verified"}>
        {c.verified ? "✓ " : "⚠ "}{c.bates} · p{c.page}
      </span>
    );
  }

  function DocPanel({ doc, onJump }) {
    const isPriv = doc.privilege === "flagged" || doc.privilege === "withheld";
    return (
      <div>
        <div className="inspector-bates">
          <span className="bates-chip">{doc.bates}</span>
          {doc.hot && <span className="hot-tag">⚠ HOT</span>}
          {isPriv && <span className="priv-tag">🔒 PRIVILEGE REVIEW</span>}
          <span className="inspector-date">{doc.date}</span>
        </div>
        <h2 className="inspector-title">{doc.title}</h2>
        <div className="inspector-meta-row">
          <div><span className="meta-k">From</span><span className="meta-v">{doc.author}</span></div>
          <div><span className="meta-k">To</span><span className="meta-v">{doc.recipients.join(", ")}</span></div>
          <div><span className="meta-k">Type</span><span className="meta-v">{doc.type}</span></div>
          {doc.threadId && (
            <div><span className="meta-k">Thread</span><span className="meta-v">message {doc.threadPos} of {doc.threadLen}</span></div>
          )}
          {doc.duplicates && (
            <div><span className="meta-k">Duplicates</span><span className="meta-v">{doc.duplicates} collapsed into this canonical record</span></div>
          )}
          <div><span className="meta-k">OCR</span><span className="meta-v"><ConfDot level={doc.ocrConfidence} /></span></div>
        </div>

        <div className="inspector-summary">
          <div className="inspector-label">summary</div>
          <p>{doc.summary}</p>
        </div>

        {isPriv ? (
          <div className="priv-wall-card">
            <div className="priv-wall-icon">🔒</div>
            <div className="priv-wall-title">Body withheld pending privilege decision</div>
            <div className="priv-wall-body">{doc.privilegeBasis}</div>
            <div className="priv-wall-actions">
              <button className="btn btn-ghost">Clear (not privileged)</button>
              <button className="btn btn-flag">Withhold</button>
            </div>
            <div className="priv-wall-foot">System flags. A human decides. Every decision is audited.</div>
          </div>
        ) : (
          <div className="inspector-source">
            <div className="inspector-label">source · {doc.bates} · page 1 of {doc.pageCount || 1}</div>
            <pre className="source-page">{doc.body}</pre>
          </div>
        )}

        <div className="inspector-citation-row">
          <CitationChip c={{ bates: doc.bates, page: 1, verified: true }} />
          <button className="btn btn-ghost" onClick={() => onJump && onJump("documents", doc.id)}>Open in binder →</button>
        </div>
      </div>
    );
  }

  function EntityPanel({ entity, onJump }) {
    return (
      <div>
        <h2 className="inspector-title">{entity.name}</h2>
        <div className="inspector-sub">{entity.role}</div>
        <div className="inspector-meta-row">
          <div><span className="meta-k">Org</span><span className="meta-v">{entity.org}</span></div>
          <div><span className="meta-k">Aliases</span><span className="meta-v">{entity.aliases.join(", ")}</span></div>
          <div><span className="meta-k">Mentions</span><span className="meta-v"><span className="num-big">{entity.mentions.toLocaleString()}</span> across corpus</span></div>
          <div><span className="meta-k">First seen</span><span className="meta-v"><span className="bates-chip">{entity.firstSeen}</span></span></div>
        </div>
        <div className="inspector-rel">
          <div className="inspector-label">relationships</div>
          {entity.relationships.map((r, i) => (
            <div key={i} className="rel-row">
              <span className="rel-name">{r.name}</span>
              <span className="rel-rel">{r.relation}</span>
            </div>
          ))}
        </div>
        <button className="btn btn-ghost" onClick={() => onJump && onJump("entities", entity.id)}>Open dossier →</button>
      </div>
    );
  }

  function EventPanel({ event, onAccept, onReject, onJump }) {
    const accepted = event.accepted === true;
    const rejected = event.accepted === false;
    const pending = event.accepted == null;
    return (
      <div>
        <div className="inspector-bates">
          <span className="event-date">{event.date}</span>
          {pending && <span className="draft-tag">DRAFT · pending review</span>}
          {accepted && <span className="accepted-tag">✓ ACCEPTED</span>}
          {rejected && <span className="rejected-tag">✗ rejected</span>}
        </div>
        <p className="inspector-event-desc">{event.description}</p>
        <div className="inspector-tagrow">
          {event.issueTags.map((t) => <span key={t} className="issue-chip">{t}</span>)}
        </div>
        <div className="inspector-meta-row">
          <div><span className="meta-k">Citation</span><span className="meta-v"><CitationChip c={event.citation} /></span></div>
          <div><span className="meta-k">Confidence</span><span className="meta-v"><ConfDot level={event.confidence} /></span></div>
        </div>
        <div className="inspector-actions">
          <button className="btn btn-verify" disabled={accepted} onClick={() => onAccept && onAccept(event)}>
            {accepted ? "Accepted" : "Accept onto chronology"}
          </button>
          <button className="btn btn-ghost" onClick={() => onReject && onReject(event)}>Reject</button>
        </div>
        <div className="audit-foot">
          Acceptance moves this event's weight onto the Scales.
          Every change appears in the audit trail.
        </div>
      </div>
    );
  }

  function ClaimPanel({ claim, onJump }) {
    return (
      <div>
        <div className="inspector-bates"><span className="claim-tag">▲ CLAIM</span></div>
        <h2 className="inspector-title">{claim.label}</h2>
        <p className="inspector-sub">
          A claim asserted by Plaintiff. The Brain shows every supporting node
          drawn toward this claim; the Scales weighs grounded support against
          opposing defenses.
        </p>
        <div className="inspector-label">grounded support</div>
        <ul className="inspector-list">
          <li><span className="bates-chip">NW-000847</span> Wage complaint (2021-02-11) <span className="cite-v">✓ verified</span></li>
          <li><span className="bates-chip">NW-001120</span> Negative review 15 days later <span className="cite-v">✓ verified</span></li>
          <li><span className="bates-chip">NW-001502</span> Termination, day 32 <span className="cite-v">✓ verified</span></li>
        </ul>
        <button className="btn btn-ghost" onClick={() => onJump && onJump("chronology")}>Open chronology →</button>
      </div>
    );
  }

  function DefensePanel({ defense, onJump }) {
    return (
      <div>
        <div className="inspector-bates"><span className="defense-tag">▽ DEFENSE</span></div>
        <h2 className="inspector-title">{defense.label}</h2>
        <p className="inspector-sub">
          Defendant's asserted theory. Supporting evidence appears translucent
          on the Scales until accepted by a reviewer.
        </p>
      </div>
    );
  }
})();
