// API-facing domain types. These are the JSON shapes returned to clients;
// they intentionally match the frontend's camelCase contract so the UI layer
// can consume the API without a translation step.

export type Confidence = "high" | "medium" | "low";
export type PrivilegeStatus = "none" | "flagged" | "cleared" | "withheld";
export type MatterStatus = "Ingesting" | "Ready" | "In Review";

export interface Citation {
  bates: string;
  page: number;
  verified: boolean;
}

export interface MatterSummary {
  id: string;
  name: string;
  client: string;
  matterType: string;
  pages: number;
  docs: number;
  ingestPercent: number;
  privilegeQueue: number;
  hotDocs: number;
  lastActivity: string;
  status: MatterStatus;
  leadAttorney: string;
}

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

export interface DocItem {
  id: string;
  bates: string;
  title: string;
  type: string;
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
  pages: number;
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

export interface SearchHit {
  doc: DocItem;
  score: number;
  matchedTerms: string[];
}

export interface ChronEvent {
  id: string;
  date: string;
  description: string;
  citation: Citation;
  confidence: Confidence;
  accepted: boolean | null;
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

export interface ChatTurn {
  id: string;
  role: "user" | "themis";
  text: string;
  citations?: Citation[];
  confidence?: Confidence;
  createdAt?: string;
}

export interface AuditEntry {
  id: number;
  ts: string;
  actor: string;
  action: string;
  detail: string;
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
