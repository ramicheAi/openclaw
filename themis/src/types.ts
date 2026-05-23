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
  verified: boolean;
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

export interface ChatTurn {
  id: string;
  role: "user" | "themis";
  text: string;
  citations?: Citation[];
  confidence?: Confidence;
}
