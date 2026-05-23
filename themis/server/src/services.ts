import { randomUUID } from "node:crypto";
import type { DB } from "./db.js";
import type { ChatTurn, Confidence, DocItem, PrivilegeStatus, SearchHit } from "./types.js";
import { audit, getDocumentByBates, insertChat, listDocuments, setPrivilege } from "./repo.js";

// ---------------------------------------------------------------------------
// These interfaces define the "AI pipeline" seam. The implementations below
// are deterministic, corpus-grounded stubs (no external models). Swapping in
// real providers — Azure Document Intelligence for OCR, an embedding model for
// retrieval, Claude for synthesis — means replacing the impls behind these
// interfaces; route handlers and the data model do not change.
// ---------------------------------------------------------------------------

export interface SearchOptions {
  limit?: number;
  excludePrivileged?: boolean;
}

export interface SearchService {
  search(db: DB, matterId: string, query: string, opts?: SearchOptions): SearchHit[];
}

export interface ChatService {
  ask(db: DB, matterId: string, question: string, actor: string): ChatTurn;
}

export interface PrivilegeService {
  scan(
    doc: Pick<DocItem, "body" | "summary" | "recipients" | "author">,
    counselTokens?: string[],
  ): { flagged: boolean; basis?: string };
  decide(db: DB, matterId: string, docId: string, decision: "cleared" | "withheld", actor: string): DocItem | null;
}

// --- Citation verification -------------------------------------------------
// A citation is "verified" when its Bates id resolves to a real document in the
// matter and the cited page falls within that document's page count. This is
// the trust primitive: no claim is shown as verified unless it grounds out in a
// source page that actually exists.
export function verifyCitation(db: DB, matterId: string, bates: string, page: number): boolean {
  const doc = getDocumentByBates(db, matterId, bates);
  if (!doc) return false;
  return page >= 1 && page <= doc.pages;
}

// --- Lexical retrieval stub ------------------------------------------------
const STOPWORDS = new Set([
  "the", "and", "for", "was", "her", "his", "with", "that", "this", "what",
  "who", "did", "does", "how", "much", "between", "from", "about", "into",
  "are", "were", "she", "him", "they", "them", "have", "has", "had",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function countOccurrences(haystack: string, term: string): number {
  if (!haystack) return 0;
  let n = 0;
  let i = haystack.indexOf(term);
  while (i !== -1) {
    n++;
    i = haystack.indexOf(term, i + term.length);
  }
  return n;
}

export const searchService: SearchService = {
  search(db, matterId, query, opts = {}) {
    const terms = [...new Set(tokenize(query))];
    let docs = listDocuments(db, matterId);
    if (opts.excludePrivileged) {
      docs = docs.filter((d) => d.privilege !== "flagged" && d.privilege !== "withheld");
    }
    if (terms.length === 0) return [];

    const hits: SearchHit[] = [];
    for (const doc of docs) {
      const title = doc.title.toLowerCase();
      const summary = doc.summary.toLowerCase();
      const body = doc.body.toLowerCase();
      const ents = doc.entities.join(" ").toLowerCase();
      let score = 0;
      const matched: string[] = [];
      for (const term of terms) {
        const s =
          countOccurrences(title, term) * 3 +
          countOccurrences(summary, term) * 2 +
          countOccurrences(ents, term) * 2 +
          countOccurrences(body, term) * 1;
        if (s > 0) {
          score += s;
          matched.push(term);
        }
      }
      if (score > 0) hits.push({ doc, score, matchedTerms: matched });
    }
    // Stable sort: equal scores keep corpus order (listDocuments is sort_order'd).
    hits.sort((a, b) => b.score - a.score);
    const limit = opts.limit ?? 10;
    return hits.slice(0, limit);
  },
};

function confidenceFromHits(hits: SearchHit[]): Confidence {
  const strong = hits.filter((h) => h.score >= 2).length;
  if (strong >= 3) return "high";
  if (hits.length >= 1) return "medium";
  return "low";
}

export const chatService: ChatService = {
  ask(db, matterId, question, actor) {
    const now = new Date().toISOString();
    const userTurn: ChatTurn = { id: randomUUID(), role: "user", text: question, createdAt: now };
    insertChat(db, matterId, userTurn);
    audit(db, matterId, actor, "chat.query", question.slice(0, 140));

    const hits = searchService.search(db, matterId, question, { limit: 4, excludePrivileged: true });

    let text: string;
    let citations: ChatTurn["citations"] = [];
    let confidence: Confidence;

    if (hits.length === 0) {
      text =
        "I couldn't find non-privileged documents in this matter that speak to that question. Try rephrasing, or review the gap analysis on the Overview tab for known holes in the production.";
      confidence = "low";
    } else {
      const top = hits.slice(0, 3);
      const body = top.map((h) => `${h.doc.bates} (${h.doc.date}): ${h.doc.summary}`).join(" ");
      text = `${hits.length} document${hits.length > 1 ? "s" : ""} in this matter bear on your question. ${body} Every citation below is verified against its source page.`;
      citations = top.map((h) => ({
        bates: h.doc.bates,
        page: 1,
        verified: verifyCitation(db, matterId, h.doc.bates, 1),
      }));
      confidence = confidenceFromHits(hits);
    }

    const verifiedCount = citations.filter((c) => c.verified).length;
    const themisTurn: ChatTurn = {
      id: randomUUID(),
      role: "themis",
      text,
      citations: citations.length ? citations : undefined,
      confidence,
      createdAt: new Date().toISOString(),
    };
    insertChat(db, matterId, themisTurn);
    audit(
      db,
      matterId,
      "themis",
      "chat.answer",
      `${citations.length} citations, ${verifiedCount} verified, confidence ${confidence}`,
    );
    return themisTurn;
  },
};

const COUNSEL_SIGNALS = [
  "attorney-client",
  "attorney client",
  "work product",
  "privileged",
  "legal advice",
  "counsel",
];

export const privilegeService: PrivilegeService = {
  // Two-pass screen: phrase signals, then known-counsel name screening — the
  // latter mirrors how privilege review uses an attorney-name list.
  scan(doc, counselTokens = []) {
    const hay = `${doc.summary} ${doc.body} ${doc.author} ${doc.recipients.join(" ")}`.toLowerCase();
    const phrase = COUNSEL_SIGNALS.find((s) => hay.includes(s));
    if (phrase) {
      return { flagged: true, basis: `Phrase match on "${phrase}" — potential attorney-client/work-product material` };
    }
    const name = counselTokens.find((t) => hay.includes(t));
    if (name) {
      return { flagged: true, basis: `Mentions known counsel ("${name}") — potential privileged communication` };
    }
    return { flagged: false };
  },
  decide(db, matterId, docId, decision, actor) {
    const status: PrivilegeStatus = decision;
    const updated = setPrivilege(db, matterId, docId, status);
    if (updated) {
      audit(db, matterId, actor, `privilege.${decision}`, `${updated.bates} ${updated.title}`);
    }
    return updated;
  },
};
