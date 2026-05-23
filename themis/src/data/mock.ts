import type {
  ChatTurn,
  ChronEvent,
  DocItem,
  Entity,
  MatterSummary,
} from "../types";

export const matters: MatterSummary[] = [
  {
    id: "reyes-northwind",
    name: "Reyes v. Northwind Logistics",
    client: "Maria Reyes",
    matterType: "Employment — Wrongful Termination",
    pages: 84213,
    docs: 11920,
    ingestPercent: 100,
    privilegeQueue: 14,
    hotDocs: 23,
    lastActivity: "12 min ago",
    status: "In Review",
    leadAttorney: "D. Okafor",
  },
  {
    id: "atlas-merger",
    name: "Atlas Foods — Acquisition Diligence",
    client: "Atlas Foods Inc.",
    matterType: "Commercial — M&A Diligence",
    pages: 142655,
    docs: 20431,
    ingestPercent: 72,
    privilegeQueue: 0,
    hotDocs: 0,
    lastActivity: "3 hours ago",
    status: "Ingesting",
    leadAttorney: "P. Lindqvist",
  },
  {
    id: "harbor-injury",
    name: "Calloway v. Harbor Freight Co.",
    client: "James Calloway",
    matterType: "Personal Injury — Premises",
    pages: 9788,
    docs: 1342,
    ingestPercent: 100,
    privilegeQueue: 3,
    hotDocs: 9,
    lastActivity: "Yesterday",
    status: "Ready",
    leadAttorney: "D. Okafor",
  },
];

export const activeMatter = matters[0];

export const caseTheory = {
  posture:
    "Plaintiff Maria Reyes alleges wrongful termination in retaliation for reporting wage-and-hour violations. Defendant Northwind asserts termination was for documented performance issues.",
  claims: [
    "Retaliatory discharge (Labor Code §1102.5)",
    "Failure to pay overtime",
    "Wrongful termination in violation of public policy",
  ],
  defenses: [
    "Legitimate, non-retaliatory business reason",
    "Performance documentation predates protected activity",
  ],
  keyDates: [
    { label: "Reyes hired", date: "2019-04-08" },
    { label: "First wage complaint (internal)", date: "2021-02-11" },
    { label: "Negative performance review", date: "2021-02-26" },
    { label: "Termination", date: "2021-03-15" },
  ],
};

export const documents: DocItem[] = [
  {
    id: "d1",
    bates: "NW-000847",
    title: "RE: Overtime hours — payroll discrepancy",
    type: "Email",
    date: "2021-02-11",
    author: "Maria Reyes",
    recipients: ["Greg Hollis (HR)", "Dana Wu (Payroll)"],
    summary:
      "Reyes reports unpaid overtime for the warehouse night shift and asks HR to correct payroll. First documented internal wage complaint in the corpus.",
    entities: ["Maria Reyes", "Greg Hollis", "Dana Wu"],
    privilege: "none",
    hot: true,
    threadId: "t-ot",
    threadPos: 1,
    threadLen: 5,
    ocrConfidence: "high",
    body:
      "Hi Greg, following up on the night-shift hours from January. Several of us logged overtime that isn't showing on our stubs. Can payroll review and correct? I've attached the shift logs.",
  },
  {
    id: "d2",
    bates: "NW-000851",
    title: "RE: Overtime hours — payroll discrepancy",
    type: "Email",
    date: "2021-02-12",
    author: "Greg Hollis (HR)",
    recipients: ["Maria Reyes"],
    summary:
      "HR acknowledges the complaint and says it will be 'looked into.' Establishes employer knowledge of the wage complaint.",
    entities: ["Greg Hollis", "Maria Reyes"],
    privilege: "none",
    hot: true,
    threadId: "t-ot",
    threadPos: 2,
    threadLen: 5,
    ocrConfidence: "high",
    body:
      "Maria — thanks, we'll look into it. Please don't circulate the shift logs more widely while we review.",
  },
  {
    id: "d3",
    bates: "NW-001120",
    title: "Performance Review — M. Reyes (Q1)",
    type: "Report",
    date: "2021-02-26",
    author: "Tom Brandt (Ops Mgr)",
    recipients: ["HR File"],
    summary:
      "Negative performance review dated 15 days after Reyes's wage complaint. Cites 'attitude' and 'team friction' with no prior documentation in the file.",
    entities: ["Tom Brandt", "Maria Reyes"],
    privilege: "none",
    hot: true,
    duplicates: 2,
    ocrConfidence: "medium",
    body:
      "Overall rating: Below Expectations. Notes: friction with team, attitude concerns raised this quarter. Recommend performance plan.",
  },
  {
    id: "d4",
    bates: "NW-001498",
    title: "Memo to file re: Reyes separation",
    type: "Memo",
    date: "2021-03-12",
    author: "Tom Brandt (Ops Mgr)",
    recipients: ["Greg Hollis (HR)"],
    summary:
      "Internal memo discussing the decision to terminate. References 'the complaint situation' — potentially probative of retaliatory motive.",
    entities: ["Tom Brandt", "Greg Hollis", "Maria Reyes"],
    privilege: "flagged",
    privilegeBasis: "Possible attorney-client — copies in-house counsel L. Stein",
    hot: true,
    ocrConfidence: "high",
    body:
      "Per our discussion, given the complaint situation and ongoing friction, proceeding with separation on the 15th. Looping in Linda for the wording.",
  },
  {
    id: "d5",
    bates: "NW-001502",
    title: "Termination letter — M. Reyes",
    type: "Letter",
    date: "2021-03-15",
    author: "Greg Hollis (HR)",
    recipients: ["Maria Reyes"],
    summary:
      "Formal termination letter citing 'performance.' Dated 32 days after the wage complaint.",
    entities: ["Greg Hollis", "Maria Reyes"],
    privilege: "none",
    hot: false,
    ocrConfidence: "high",
    body:
      "Dear Ms. Reyes, your employment with Northwind Logistics is terminated effective today due to performance. Final pay enclosed.",
  },
  {
    id: "d6",
    bates: "NW-002310",
    title: "Counsel guidance on separation wording",
    type: "Email",
    date: "2021-03-13",
    author: "Linda Stein (In-house Counsel)",
    recipients: ["Greg Hollis (HR)", "Tom Brandt"],
    summary:
      "In-house counsel advises on documentation and letter wording. Strong privilege candidate — withhold pending review.",
    entities: ["Linda Stein", "Greg Hollis", "Tom Brandt"],
    privilege: "flagged",
    privilegeBasis: "Attorney-client privilege — legal advice from in-house counsel",
    hot: false,
    ocrConfidence: "high",
    body:
      "[Flagged for privilege review — body withheld from non-privileged workspace]",
  },
];

export const chronology: ChronEvent[] = [
  {
    id: "c1",
    date: "2019-04-08",
    description: "Maria Reyes hired as warehouse shift lead at Northwind Logistics.",
    citation: { bates: "NW-000012", page: 1, verified: true },
    confidence: "high",
    accepted: true,
    issueTags: ["Background"],
  },
  {
    id: "c2",
    date: "2021-02-11",
    description:
      "Reyes submits internal complaint about unpaid overtime to HR (Greg Hollis).",
    citation: { bates: "NW-000847", page: 1, verified: true },
    confidence: "high",
    accepted: true,
    issueTags: ["Protected Activity", "Wage Claim"],
  },
  {
    id: "c3",
    date: "2021-02-12",
    description: "HR acknowledges the complaint in writing.",
    citation: { bates: "NW-000851", page: 1, verified: true },
    confidence: "high",
    accepted: true,
    issueTags: ["Employer Knowledge"],
  },
  {
    id: "c4",
    date: "2021-02-26",
    description:
      "First negative performance review of Reyes, 15 days after the complaint.",
    citation: { bates: "NW-001120", page: 1, verified: true },
    confidence: "high",
    accepted: null,
    issueTags: ["Pretext", "Causation"],
  },
  {
    id: "c5",
    date: "2021-03-12",
    description:
      "Ops manager memo references 'the complaint situation' while planning separation.",
    citation: { bates: "NW-001498", page: 1, verified: true },
    confidence: "medium",
    accepted: null,
    issueTags: ["Retaliatory Motive"],
  },
  {
    id: "c6",
    date: "2021-03-15",
    description: "Reyes terminated; letter cites performance.",
    citation: { bates: "NW-001502", page: 1, verified: true },
    confidence: "high",
    accepted: null,
    issueTags: ["Adverse Action"],
  },
];

export const entities: Entity[] = [
  {
    id: "e1",
    name: "Maria Reyes",
    role: "Plaintiff / Warehouse Shift Lead",
    org: "Northwind Logistics",
    aliases: ["M. Reyes", "Maria R."],
    mentions: 1842,
    firstSeen: "NW-000012",
    relationships: [
      { name: "Greg Hollis", relation: "Reported wage complaint to" },
      { name: "Tom Brandt", relation: "Direct report to" },
    ],
  },
  {
    id: "e2",
    name: "Tom Brandt",
    role: "Operations Manager",
    org: "Northwind Logistics",
    aliases: ["T. Brandt", "Thomas Brandt"],
    mentions: 612,
    firstSeen: "NW-000204",
    relationships: [
      { name: "Maria Reyes", relation: "Supervised" },
      { name: "Linda Stein", relation: "Consulted re: separation" },
    ],
  },
  {
    id: "e3",
    name: "Greg Hollis",
    role: "HR Generalist",
    org: "Northwind Logistics",
    aliases: ["G. Hollis"],
    mentions: 487,
    firstSeen: "NW-000301",
    relationships: [
      { name: "Maria Reyes", relation: "Received complaint from" },
      { name: "Linda Stein", relation: "Escalated to" },
    ],
  },
  {
    id: "e4",
    name: "Linda Stein",
    role: "In-house Counsel",
    org: "Northwind Logistics",
    aliases: ["L. Stein", "Linda S."],
    mentions: 96,
    firstSeen: "NW-002310",
    relationships: [
      { name: "Tom Brandt", relation: "Advised" },
      { name: "Greg Hollis", relation: "Advised" },
    ],
  },
];

export const seedChat: ChatTurn[] = [
  {
    id: "q1",
    role: "user",
    text: "How much time passed between Reyes's wage complaint and her termination?",
  },
  {
    id: "a1",
    role: "themis",
    text:
      "32 days. The first documented internal wage complaint is dated 2021-02-11, and the termination letter is dated 2021-03-15. A negative performance review was created on 2021-02-26, 15 days after the complaint and the first negative review in her file.",
    confidence: "high",
    citations: [
      { bates: "NW-000847", page: 1, verified: true },
      { bates: "NW-001120", page: 1, verified: true },
      { bates: "NW-001502", page: 1, verified: true },
    ],
  },
];

export const ingestStages = [
  { label: "Upload", done: true },
  { label: "OCR (Azure DI)", done: true },
  { label: "Bates stamp", done: true },
  { label: "Dedup + threading", done: true },
  { label: "Extraction", done: true },
  { label: "Privilege scan", done: true },
];

export const gapFindings = [
  {
    severity: "high" as const,
    text: "No documents from Reyes's direct supervisor (T. Brandt) between 2021-02-12 and 2021-02-26 — gap around the review's origin.",
  },
  {
    severity: "medium" as const,
    text: "Payroll records referenced in NW-000847 attachments not present in the production. Consider a follow-up RFP.",
  },
  {
    severity: "low" as const,
    text: "3 text messages reference an off-system call on 2021-03-10; no recording or notes in corpus.",
  },
];
