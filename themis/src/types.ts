export type Confidence = "high" | "medium" | "low";

export type DocType =
  | "Email"
  | "Contract"
  | "Memo"
  | "Invoice"
  | "Report"
  | "Letter"
  | "Text Message"
  | "Spreadsheet";

export type PrivilegeStatus = "none" | "flagged" | "cleared" | "withheld";

export interface MatterSummary {
  id: string;
  name: string;
  client: string;
  matterType: string;
  pages: number;
  docs: number;
  ingestPercent: number; // 0..100
  privilegeQueue: number;
  hotDocs: number;
  lastActivity: string;
  status: "Ingesting" | "Ready" | "In Review";
  leadAttorney: string;
}

export interface Citation {
  bates: string;
  page: number;
  /** Existence verified: Bates resolves and the page exists. */
  verified: boolean;
  /** Entailment verified: the source page's body actually supports the claim. */
  entailed?: boolean;
  /** Support score 0..1 from the entailment check. */
  supportScore?: number;
  /** Up to ~8 distinct claim tokens that appear in the source body. */
  matchedKeyTerms?: string[];
}

export interface AuditChainStatus {
  entries: number;
  broken: boolean;
  brokenAt?: number;
  reason?: string;
}

export interface DocItem {
  id: string;
  bates: string;
  title: string;
  type: DocType;
  date: string;
  author: string;
  recipients: string[];
  summary: string;
  entities: string[];
  privilege: PrivilegeStatus;
  privilegeBasis?: string;
  hot: boolean;
  threadId?: string;
  threadPos?: number;
  threadLen?: number;
  duplicates?: number;
  ocrConfidence: Confidence;
  body: string;
  pages?: number;
  reviewed?: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface CausalChainNode {
  kind: "event" | "doc" | "entity";
  id: string;
}

export interface CausalChain {
  id: string;
  matterId: string;
  name: string;
  nodes: CausalChainNode[];
  createdBy: string;
  createdAt: string;
}

export interface ChronEvent {
  id: string;
  date: string;
  description: string;
  citation: Citation;
  confidence: Confidence;
  accepted: boolean | null; // null = pending review
  issueTags: string[];
}

export interface Entity {
  id: string;
  name: string;
  role: string;
  org: string;
  aliases: string[];
  mentions: number;
  relationships: { name: string; relation: string }[];
  firstSeen: string;
}

// --- Cite-Check / Authority verification (the Mata shield) ---

export type AuthorityVerdict =
  | "verified"
  | "ambiguous"
  | "not_found"
  | "malformed"
  | "rate_limited"
  | "unverified";

export interface AuthorityMatch {
  caseName: string;
  url: string;
  dateFiled?: string;
  citationCount?: number;
  court?: string;
}

export interface AuthorityFinding {
  citation: string;
  startIndex: number;
  endIndex: number;
  verdict: AuthorityVerdict;
  statusCode: number;
  matches: AuthorityMatch[];
  note?: string;
}

export interface BatesFinding {
  bates: string;
  page: number;
  index: number;
  existed: boolean;
  entailed: boolean;
  supportScore: number;
  title?: string;
  date?: string;
  privilege?: string;
}

// --- Deadlines ---

export type DeadlineKind = "deadline" | "hearing" | "conference" | "trial" | "disclosure";

export interface Deadline {
  id: string;
  dueDate: string; // ISO YYYY-MM-DD or "" when unresolved
  title: string;
  detail: string;
  kind: DeadlineKind;
  source: string;
  done: boolean;
  createdAt: string;
}

// --- Deposition outline ---

export interface DepoTopic {
  topic: string;
  goal: string;
  questions: string[];
  exhibits: string[];
}

export interface DepoOutline {
  witness: string;
  role: string;
  background: string;
  topics: DepoTopic[];
}

export interface VerifyResult {
  bates: {
    total: number;
    existed: number;
    entailed: number;
    findings: BatesFinding[];
  };
  authorities: {
    ok: boolean;
    configured: boolean;
    error?: string;
    total: number;
    verified: number;
    ambiguous: number;
    notFound: number;
    findings: AuthorityFinding[];
  };
}

export interface ChatTurn {
  id: string;
  role: "user" | "themis";
  text: string;
  citations?: Citation[];
  confidence?: Confidence;
  createdAt?: string;
}

// --- Backend API shapes (themis/server) ---

export interface CaseTheory {
  posture: string;
  claims: string[];
  defenses: string[];
  keyDates: { label: string; date: string }[];
}

export interface IngestStage {
  label: string;
  done: boolean;
}

export interface GapFinding {
  severity: "high" | "medium" | "low";
  text: string;
}

export interface MatterDetail extends MatterSummary {
  caseTheory: CaseTheory;
  ingestStages: IngestStage[];
  gapFindings: GapFinding[];
}

export interface SearchHit {
  doc: DocItem;
  score: number;
  matchedTerms: string[];
}

export interface AuditEntry {
  id: number;
  ts: string;
  actor: string;
  action: string;
  detail: string;
}

export interface PrivilegeFlag {
  id: string;
  bates: string;
  title: string;
  basis?: string;
}

export interface BinderItem {
  id: string;
  docId: string;
  label: string;
  bates: string;
  type: string;
  date: string;
}

export interface Binder {
  id: string;
  matterId: string;
  name: string;
  createdBy: string;
  createdAt: string;
  items: BinderItem[];
}
