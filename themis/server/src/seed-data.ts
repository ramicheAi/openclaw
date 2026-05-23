// Canonical seed content for the Themis backend. The Reyes matter is fully
// populated (documents, chronology, entities, chat) so search/chat/privilege
// behave realistically; the other matters are lighter, matching their status.

import type {
  CaseTheory,
  ChronEvent,
  DocItem,
  Entity,
  GapFinding,
  IngestStage,
  MatterStatus,
} from "./types.js";

export interface SeedMatter {
  id: string;
  name: string;
  client: string;
  matterType: string;
  leadAttorney: string;
  status: MatterStatus;
  pages: number;
  docs: number;
  ingestPercent: number;
  lastActivity: string;
  caseTheory: CaseTheory;
  ingestStages: IngestStage[];
  gapFindings: GapFinding[];
}

export type SeedDoc = Omit<DocItem, "pages"> & { pages?: number; sortOrder: number };

const reyesIngest: IngestStage[] = [
  { label: "Upload", done: true },
  { label: "OCR (Azure DI)", done: true },
  { label: "Bates stamp", done: true },
  { label: "Dedup + threading", done: true },
  { label: "Extraction", done: true },
  { label: "Privilege scan", done: true },
];

export const matters: SeedMatter[] = [
  {
    id: "reyes-northwind",
    name: "Reyes v. Northwind Logistics",
    client: "Maria Reyes",
    matterType: "Employment — Wrongful Termination",
    leadAttorney: "D. Okafor",
    status: "In Review",
    pages: 84213,
    docs: 11920,
    ingestPercent: 100,
    lastActivity: "12 min ago",
    caseTheory: {
      posture:
        "Plaintiff Maria Reyes alleges wrongful termination in retaliation for reporting wage-and-hour violations. Defendant Northwind asserts termination was for documented performance issues.",
      claims: [
        "Retaliatory discharge (Labor Code 1102.5)",
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
    },
    ingestStages: reyesIngest,
    gapFindings: [
      {
        severity: "high",
        text: "No documents from Reyes's direct supervisor (T. Brandt) between 2021-02-12 and 2021-02-26 — gap around the review's origin.",
      },
      {
        severity: "medium",
        text: "Payroll records referenced in NW-000847 attachments not present in the production. Consider a follow-up RFP.",
      },
      {
        severity: "low",
        text: "3 text messages reference an off-system call on 2021-03-10; no recording or notes in corpus.",
      },
    ],
  },
  {
    id: "atlas-merger",
    name: "Atlas Foods — Acquisition Diligence",
    client: "Atlas Foods Inc.",
    matterType: "Commercial — M&A Diligence",
    leadAttorney: "P. Lindqvist",
    status: "Ingesting",
    pages: 142655,
    docs: 20431,
    ingestPercent: 72,
    lastActivity: "3 hours ago",
    caseTheory: {
      posture:
        "Buy-side diligence on the acquisition of Atlas Foods. Reviewing material contracts, change-of-control provisions, and outstanding litigation.",
      claims: [],
      defenses: [],
      keyDates: [{ label: "LOI signed", date: "2026-03-02" }],
    },
    ingestStages: [
      { label: "Upload", done: true },
      { label: "OCR (Azure DI)", done: true },
      { label: "Bates stamp", done: true },
      { label: "Dedup + threading", done: false },
      { label: "Extraction", done: false },
      { label: "Privilege scan", done: false },
    ],
    gapFindings: [],
  },
  {
    id: "harbor-injury",
    name: "Calloway v. Harbor Freight Co.",
    client: "James Calloway",
    matterType: "Personal Injury — Premises",
    leadAttorney: "D. Okafor",
    status: "Ready",
    pages: 9788,
    docs: 1342,
    ingestPercent: 100,
    lastActivity: "Yesterday",
    caseTheory: {
      posture:
        "Plaintiff slipped on an unmarked wet floor in a Harbor Freight warehouse. Liability turns on notice of the hazard and adequacy of warnings.",
      claims: ["Negligence", "Premises liability"],
      defenses: ["No actual or constructive notice", "Comparative fault"],
      keyDates: [
        { label: "Incident", date: "2024-08-19" },
        { label: "Incident report filed", date: "2024-08-19" },
      ],
    },
    ingestStages: reyesIngest,
    gapFindings: [
      {
        severity: "medium",
        text: "Maintenance logs for the 24 hours before the incident are missing from the production.",
      },
    ],
  },
];

export const documents: Record<string, SeedDoc[]> = {
  "reyes-northwind": [
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
      sortOrder: 1,
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
      sortOrder: 2,
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
      sortOrder: 3,
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
      sortOrder: 4,
    },
    {
      id: "d5",
      bates: "NW-001502",
      title: "Termination letter — M. Reyes",
      type: "Letter",
      date: "2021-03-15",
      author: "Greg Hollis (HR)",
      recipients: ["Maria Reyes"],
      summary: "Formal termination letter citing 'performance.' Dated 32 days after the wage complaint.",
      entities: ["Greg Hollis", "Maria Reyes"],
      privilege: "none",
      hot: false,
      ocrConfidence: "high",
      body:
        "Dear Ms. Reyes, your employment with Northwind Logistics is terminated effective today due to performance. Final pay enclosed.",
      sortOrder: 5,
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
      body: "[Flagged for privilege review — body withheld from non-privileged workspace]",
      sortOrder: 6,
    },
  ],
  "harbor-injury": [
    {
      id: "h1",
      bates: "HF-000043",
      title: "Incident report — aisle 7 slip",
      type: "Report",
      date: "2024-08-19",
      author: "Store Manager",
      recipients: ["Risk Mgmt"],
      summary:
        "Contemporaneous incident report describing a wet floor in aisle 7 and the plaintiff's fall. No mention of a warning sign.",
      entities: ["James Calloway"],
      privilege: "none",
      hot: true,
      ocrConfidence: "high",
      body: "Customer slipped near aisle 7 endcap. Floor was wet. Customer transported for evaluation.",
      sortOrder: 1,
    },
    {
      id: "h2",
      bates: "HF-000110",
      title: "Counsel intake notes",
      type: "Memo",
      date: "2024-08-26",
      author: "Outside Counsel",
      recipients: ["File"],
      summary: "Counsel's intake assessment of the claim. Likely work product.",
      entities: ["James Calloway"],
      privilege: "flagged",
      privilegeBasis: "Attorney work product — counsel's mental impressions",
      hot: false,
      ocrConfidence: "high",
      body: "[Flagged for privilege review — body withheld from non-privileged workspace]",
      sortOrder: 2,
    },
  ],
  "atlas-merger": [],
};

export const chronologyEvents: Record<
  string,
  { id: string; date: string; description: string; bates: string; page: number; confidence: ChronEvent["confidence"]; accepted: boolean | null; issueTags: string[] }[]
> = {
  "reyes-northwind": [
    {
      id: "c1",
      date: "2019-04-08",
      description: "Maria Reyes hired as warehouse shift lead at Northwind Logistics.",
      bates: "NW-000847",
      page: 1,
      confidence: "high",
      accepted: true,
      issueTags: ["Background"],
    },
    {
      id: "c2",
      date: "2021-02-11",
      description: "Reyes submits internal complaint about unpaid overtime to HR (Greg Hollis).",
      bates: "NW-000847",
      page: 1,
      confidence: "high",
      accepted: true,
      issueTags: ["Protected Activity", "Wage Claim"],
    },
    {
      id: "c3",
      date: "2021-02-12",
      description: "HR acknowledges the complaint in writing.",
      bates: "NW-000851",
      page: 1,
      confidence: "high",
      accepted: true,
      issueTags: ["Employer Knowledge"],
    },
    {
      id: "c4",
      date: "2021-02-26",
      description: "First negative performance review of Reyes, 15 days after the complaint.",
      bates: "NW-001120",
      page: 1,
      confidence: "high",
      accepted: null,
      issueTags: ["Pretext", "Causation"],
    },
    {
      id: "c5",
      date: "2021-03-12",
      description: "Ops manager memo references 'the complaint situation' while planning separation.",
      bates: "NW-001498",
      page: 1,
      confidence: "medium",
      accepted: null,
      issueTags: ["Retaliatory Motive"],
    },
    {
      id: "c6",
      date: "2021-03-15",
      description: "Reyes terminated; letter cites performance.",
      bates: "NW-001502",
      page: 1,
      confidence: "high",
      accepted: null,
      issueTags: ["Adverse Action"],
    },
  ],
  "harbor-injury": [
    {
      id: "hc1",
      date: "2024-08-19",
      description: "Plaintiff slips on wet floor in aisle 7; incident report filed same day.",
      bates: "HF-000043",
      page: 1,
      confidence: "high",
      accepted: true,
      issueTags: ["Incident", "Notice"],
    },
  ],
  "atlas-merger": [],
};

export const entityRecords: Record<string, Entity[]> = {
  "reyes-northwind": [
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
  ],
  "harbor-injury": [
    {
      id: "he1",
      name: "James Calloway",
      role: "Plaintiff",
      org: "—",
      aliases: ["J. Calloway"],
      mentions: 211,
      firstSeen: "HF-000043",
      relationships: [],
    },
  ],
  "atlas-merger": [],
};

export const seedChat: Record<string, { id: string; role: "user" | "themis"; text: string; bates?: { bates: string; page: number }[]; confidence?: ChronEvent["confidence"] }[]> = {
  "reyes-northwind": [
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
      bates: [
        { bates: "NW-000847", page: 1 },
        { bates: "NW-001120", page: 1 },
        { bates: "NW-001502", page: 1 },
      ],
    },
  ],
};
