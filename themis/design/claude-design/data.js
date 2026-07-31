// Themis demo data — Reyes v. Northwind Logistics
// Mirrors themis/src/data/mock.ts + types from the API contract.

window.THEMIS = (function () {
  const matter = {
    id: "reyes-northwind",
    name: "Reyes v. Northwind Logistics",
    client: "Maria Reyes",
    matterType: "Employment — Wrongful Termination",
    leadAttorney: "D. Okafor",
    status: "In Review",
    pages: 84213,
    docs: 11920,
    ingestPercent: 100,
    privilegeQueue: 14,
    hotDocs: 23,
    lastActivity: "12 min ago",
  };

  const caseTheory = {
    posture:
      "Plaintiff Maria Reyes alleges wrongful termination in retaliation for reporting wage-and-hour violations. Defendant Northwind asserts termination was for documented performance issues.",
    claims: [
      "Retaliatory discharge — Cal. Lab. Code §1102.5",
      "Failure to pay overtime",
      "Wrongful termination in violation of public policy",
    ],
    defenses: [
      "Legitimate, non-retaliatory business reason",
      "Performance documentation predates protected activity",
    ],
    keyDates: [
      { label: "Reyes hired", date: "2019-04-08" },
      { label: "Wage complaint (internal)", date: "2021-02-11" },
      { label: "Negative review", date: "2021-02-26" },
      { label: "Termination", date: "2021-03-15" },
    ],
  };

  // Hot documents (full fidelity)
  const documents = [
    {
      id: "d1", bates: "NW-000847",
      title: "RE: Overtime hours — payroll discrepancy",
      type: "Email", date: "2021-02-11",
      author: "Maria Reyes",
      recipients: ["Greg Hollis (HR)", "Dana Wu (Payroll)"],
      summary:
        "Reyes reports unpaid overtime for the warehouse night shift and asks HR to correct payroll. First documented internal wage complaint in the corpus.",
      entities: ["Maria Reyes", "Greg Hollis", "Dana Wu"],
      privilege: "none", hot: true,
      threadId: "t-ot", threadPos: 1, threadLen: 5,
      ocrConfidence: "high",
      body:
        "Hi Greg,\n\nFollowing up on the night-shift hours from January. Several of us logged overtime that isn't showing on our stubs. Can payroll review and correct? I've attached the shift logs.\n\nThis isn't isolated — Diana, Marcus, and Jorge all flagged the same thing for the last two pay periods. Happy to walk through the logs in person if helpful.\n\nMaria",
      pageCount: 2,
    },
    {
      id: "d2", bates: "NW-000851",
      title: "RE: Overtime hours — payroll discrepancy",
      type: "Email", date: "2021-02-12",
      author: "Greg Hollis (HR)",
      recipients: ["Maria Reyes"],
      summary:
        "HR acknowledges the complaint and says it will be 'looked into.' Establishes employer knowledge of the wage complaint.",
      entities: ["Greg Hollis", "Maria Reyes"],
      privilege: "none", hot: true,
      threadId: "t-ot", threadPos: 2, threadLen: 5,
      ocrConfidence: "high",
      body:
        "Maria —\n\nThanks, we'll look into it. Please don't circulate the shift logs more widely while we review.\n\nGreg",
      pageCount: 1,
    },
    {
      id: "d3", bates: "NW-001120",
      title: "Performance Review — M. Reyes (Q1)",
      type: "Report", date: "2021-02-26",
      author: "Tom Brandt (Ops Mgr)",
      recipients: ["HR File"],
      summary:
        "Negative performance review dated 15 days after Reyes's wage complaint. Cites 'attitude' and 'team friction' with no prior documentation in the file.",
      entities: ["Tom Brandt", "Maria Reyes"],
      privilege: "none", hot: true,
      duplicates: 2,
      ocrConfidence: "medium",
      body:
        "Quarterly Performance Review — Maria Reyes, Warehouse Shift Lead\n\nOverall rating: Below Expectations.\n\nNotes: friction with team, attitude concerns raised this quarter. Recommend performance plan and 30-day review cadence.\n\nReviewer: Tom Brandt, Operations Manager",
      pageCount: 3,
    },
    {
      id: "d4", bates: "NW-001498",
      title: "Memo to file re: Reyes separation",
      type: "Memo", date: "2021-03-12",
      author: "Tom Brandt (Ops Mgr)",
      recipients: ["Greg Hollis (HR)"],
      summary:
        "Internal memo discussing the decision to terminate. References 'the complaint situation' — potentially probative of retaliatory motive.",
      entities: ["Tom Brandt", "Greg Hollis", "Maria Reyes"],
      privilege: "flagged",
      privilegeBasis:
        "Possible attorney-client — copies in-house counsel L. Stein",
      hot: true,
      ocrConfidence: "high",
      body:
        "Per our discussion, given the complaint situation and ongoing friction, proceeding with separation on the 15th. Looping in Linda for the wording.",
      pageCount: 1,
    },
    {
      id: "d5", bates: "NW-001502",
      title: "Termination letter — M. Reyes",
      type: "Letter", date: "2021-03-15",
      author: "Greg Hollis (HR)",
      recipients: ["Maria Reyes"],
      summary:
        "Formal termination letter citing 'performance.' Dated 32 days after the wage complaint.",
      entities: ["Greg Hollis", "Maria Reyes"],
      privilege: "none", hot: true,
      ocrConfidence: "high",
      body:
        "Dear Ms. Reyes,\n\nYour employment with Northwind Logistics is terminated effective today due to performance. Final pay enclosed.\n\nGreg Hollis\nHR Generalist, Northwind Logistics",
      pageCount: 2,
    },
    {
      id: "d6", bates: "NW-002310",
      title: "Counsel guidance on separation wording",
      type: "Email", date: "2021-03-13",
      author: "Linda Stein (In-house Counsel)",
      recipients: ["Greg Hollis (HR)", "Tom Brandt"],
      summary:
        "In-house counsel advises on documentation and letter wording. Strong privilege candidate — withhold pending review.",
      entities: ["Linda Stein", "Greg Hollis", "Tom Brandt"],
      privilege: "flagged",
      privilegeBasis:
        "Attorney-client privilege — legal advice from in-house counsel",
      hot: false,
      ocrConfidence: "high",
      body:
        "[Flagged for privilege review — body withheld from non-privileged workspace. Click \"Open in privilege queue\" to review and decide.]",
      pageCount: 2,
    },
  ];

  const entities = [
    {
      id: "e1", name: "Maria Reyes",
      role: "Plaintiff · Warehouse Shift Lead",
      org: "Northwind Logistics",
      aliases: ["M. Reyes", "Maria R."],
      mentions: 1842, firstSeen: "NW-000012",
      relationships: [
        { name: "Greg Hollis", relation: "Reported wage complaint to" },
        { name: "Tom Brandt", relation: "Direct report to" },
      ],
    },
    {
      id: "e2", name: "Tom Brandt",
      role: "Operations Manager",
      org: "Northwind Logistics",
      aliases: ["T. Brandt", "Thomas Brandt"],
      mentions: 612, firstSeen: "NW-000204",
      relationships: [
        { name: "Maria Reyes", relation: "Supervised" },
        { name: "Linda Stein", relation: "Consulted re: separation" },
      ],
    },
    {
      id: "e3", name: "Greg Hollis",
      role: "HR Generalist",
      org: "Northwind Logistics",
      aliases: ["G. Hollis"],
      mentions: 487, firstSeen: "NW-000301",
      relationships: [
        { name: "Maria Reyes", relation: "Received complaint from" },
        { name: "Linda Stein", relation: "Escalated to" },
      ],
    },
    {
      id: "e4", name: "Linda Stein",
      role: "In-house Counsel",
      org: "Northwind Logistics",
      aliases: ["L. Stein", "Linda S."],
      mentions: 96, firstSeen: "NW-002310",
      relationships: [
        { name: "Tom Brandt", relation: "Advised" },
        { name: "Greg Hollis", relation: "Advised" },
      ],
    },
  ];

  const chronology = [
    {
      id: "c1", date: "2019-04-08",
      description: "Maria Reyes hired as warehouse shift lead at Northwind Logistics.",
      citation: { bates: "NW-000012", page: 1, verified: true },
      confidence: "high", accepted: true,
      issueTags: ["Background"],
    },
    {
      id: "c2", date: "2021-02-11",
      description: "Reyes submits internal complaint about unpaid overtime to HR (Greg Hollis).",
      citation: { bates: "NW-000847", page: 1, verified: true },
      confidence: "high", accepted: true,
      issueTags: ["Protected Activity", "Wage Claim"],
    },
    {
      id: "c3", date: "2021-02-12",
      description: "HR acknowledges the complaint in writing.",
      citation: { bates: "NW-000851", page: 1, verified: true },
      confidence: "high", accepted: true,
      issueTags: ["Employer Knowledge"],
    },
    {
      id: "c4", date: "2021-02-26",
      description: "First negative performance review of Reyes, 15 days after the complaint.",
      citation: { bates: "NW-001120", page: 1, verified: true },
      confidence: "high", accepted: null,
      issueTags: ["Pretext", "Causation"],
    },
    {
      id: "c5", date: "2021-03-12",
      description: "Ops manager memo references 'the complaint situation' while planning separation.",
      citation: { bates: "NW-001498", page: 1, verified: true },
      confidence: "medium", accepted: null,
      issueTags: ["Retaliatory Motive"],
    },
    {
      id: "c6", date: "2021-03-15",
      description: "Reyes terminated; letter cites performance.",
      citation: { bates: "NW-001502", page: 1, verified: true },
      confidence: "high", accepted: null,
      issueTags: ["Adverse Action"],
    },
  ];

  const ingestStages = [
    { key: "upload",    label: "Upload",            done: true, ts: "08:14:22" },
    { key: "ocr",       label: "OCR · Azure DI",    done: true, ts: "08:31:07" },
    { key: "bates",     label: "Bates stamp",       done: true, ts: "08:32:41" },
    { key: "dedup",     label: "Dedup + threading", done: true, ts: "08:38:55" },
    { key: "extract",   label: "Entity extraction", done: true, ts: "08:46:12" },
    { key: "privilege", label: "Privilege scan",    done: true, ts: "08:49:33" },
  ];

  const gapFindings = [
    {
      severity: "high",
      text:
        "No documents from T. Brandt between 2021-02-12 and 2021-02-26 — gap around the review's origin.",
    },
    {
      severity: "medium",
      text:
        "Payroll records referenced in NW-000847 attachments not present in the production. Consider a follow-up RFP.",
    },
    {
      severity: "low",
      text:
        "3 text messages reference an off-system call on 2021-03-10; no recording or notes in corpus.",
    },
  ];

  // ── Graph structure for the Brain ──────────────────────────────────
  // Each "real" node has metadata; ambient ~ docs are just dots.
  // Node kinds: doc, entity, event, claim, defense.

  const claims = caseTheory.claims.map((label, i) => ({
    id: "cl" + (i + 1), kind: "claim", label, weight: 0,
  }));
  claims[0].weight = 3;   // retaliatory discharge — anchored by the chain
  claims[1].weight = 1;   // failure to pay overtime
  claims[2].weight = 2;   // wrongful termination

  const defenses = caseTheory.defenses.map((label, i) => ({
    id: "df" + (i + 1), kind: "defense", label, weight: 0,
  }));
  defenses[0].weight = 1;
  defenses[1].weight = 1;

  // Edges: thread (email chain), citation (claim ← doc), relationship,
  // chronology spine, privilege link.
  const realNodes = [
    ...documents.map((d) => ({
      id: d.id, kind: "doc", label: d.bates, doc: d, hot: d.hot,
      privilege: d.privilege, threadId: d.threadId, date: d.date,
    })),
    ...entities.map((e) => ({
      id: e.id, kind: "entity", label: e.name, entity: e,
      size: Math.max(8, Math.min(28, Math.log10(e.mentions) * 7)),
    })),
    ...chronology.map((c) => ({
      id: c.id, kind: "event", label: c.date, event: c,
    })),
    ...claims, ...defenses,
  ];

  // Hand-authored edges between real nodes
  const realEdges = [
    // email thread t-ot (Reyes complaint chain)
    { a: "d1", b: "d2", type: "thread" },
    // documents authored by / mention entities
    { a: "d1", b: "e1", type: "author" },
    { a: "d1", b: "e3", type: "mention" },
    { a: "d2", b: "e3", type: "author" },
    { a: "d2", b: "e1", type: "mention" },
    { a: "d3", b: "e2", type: "author" },
    { a: "d3", b: "e1", type: "mention" },
    { a: "d4", b: "e2", type: "author" },
    { a: "d4", b: "e3", type: "mention" },
    { a: "d4", b: "e4", type: "mention" },
    { a: "d5", b: "e3", type: "author" },
    { a: "d5", b: "e1", type: "mention" },
    { a: "d6", b: "e4", type: "author" },
    { a: "d6", b: "e3", type: "mention" },
    { a: "d6", b: "e2", type: "mention" },
    // entity relationships
    { a: "e1", b: "e3", type: "relation", label: "reported complaint to" },
    { a: "e1", b: "e2", type: "relation", label: "direct report to" },
    { a: "e2", b: "e4", type: "relation", label: "consulted" },
    { a: "e3", b: "e4", type: "relation", label: "escalated to" },
    // chronology spine
    { a: "c1", b: "c2", type: "timeline" },
    { a: "c2", b: "c3", type: "timeline" },
    { a: "c3", b: "c4", type: "timeline" },
    { a: "c4", b: "c5", type: "timeline" },
    { a: "c5", b: "c6", type: "timeline" },
    // events ↔ source documents (verified citations)
    { a: "c2", b: "d1", type: "citation", verified: true },
    { a: "c3", b: "d2", type: "citation", verified: true },
    { a: "c4", b: "d3", type: "citation", verified: true },
    { a: "c5", b: "d4", type: "citation", verified: true },
    { a: "c6", b: "d5", type: "citation", verified: true },
    // claims supported by events / docs
    { a: "cl1", b: "c2", type: "supports", verified: true }, // retaliation ← protected activity
    { a: "cl1", b: "c5", type: "supports", verified: true }, // retaliation ← motive memo
    { a: "cl1", b: "c6", type: "supports", verified: true }, // retaliation ← adverse action
    { a: "cl2", b: "d1", type: "supports", verified: true }, // OT failure ← complaint
    { a: "cl3", b: "c4", type: "supports", verified: true }, // wrongful ← pretext review
    { a: "cl3", b: "c6", type: "supports", verified: true },
    // defenses
    { a: "df1", b: "c4", type: "supports", verified: false }, // perf review (contested)
    { a: "df2", b: "d3", type: "supports", verified: false },
  ];

  // Ambient/background docs — give the brain its mass.
  // Distributed by thread/cluster so layout looks like a real corpus.
  const ambient = [];
  const clusters = [
    { entity: "e1", n: 22 }, // Reyes-heavy
    { entity: "e2", n: 14 },
    { entity: "e3", n: 12 },
    { entity: "e4", n: 5 },
    { entity: null, n: 18 }, // unclustered docs
  ];
  let ambIdx = 0;
  clusters.forEach((c) => {
    for (let i = 0; i < c.n; i++) {
      const id = "a" + ambIdx++;
      const priv = Math.random() < 0.05 ? "flagged" : "none";
      ambient.push({
        id, kind: "doc", label: "NW-" + String(3000 + ambIdx).padStart(6, "0"),
        ambient: true, hot: false, privilege: priv,
        cluster: c.entity,
      });
      if (c.entity) realEdges.push({ a: id, b: c.entity, type: "mention", ambient: true });
    }
  });

  return {
    matter, caseTheory, documents, entities, chronology,
    ingestStages, gapFindings,
    graph: {
      nodes: [...realNodes, ...ambient],
      edges: realEdges,
    },
    // shorthand lookups
    byId: (() => {
      const m = {};
      [...realNodes, ...ambient].forEach((n) => (m[n.id] = n));
      return m;
    })(),
  };
})();
