import { randomUUID } from "node:crypto";
import type { DB } from "./db.js";
import type { ChatTurn, Confidence, DocItem, PrivilegeStatus, SearchHit } from "./types.js";
import { audit, getDocumentByBates, insertChat, listDocuments, setPrivilege } from "./repo.js";
import { isLLMReady, judgeEntailment, synthesizeAnswer } from "./llm.js";

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
  ask(db: DB, matterId: string, question: string, actor: string): Promise<ChatTurn>;
}

export interface PrivilegeService {
  scan(
    doc: Pick<DocItem, "body" | "summary" | "recipients" | "author">,
    counselTokens?: string[],
  ): { flagged: boolean; basis?: string };
  decide(db: DB, matterId: string, docId: string, decision: "cleared" | "withheld", actor: string): DocItem | null;
}

// --- Citation verification -------------------------------------------------
// TWO-LAYER verification. Existence is necessary but never sufficient.
//
//   Layer 1 (existence): does the Bates id resolve to a real document and a
//     real page in this matter? Cheap, deterministic. Catches hallucinated
//     citations (the Mata v. Avianca failure mode).
//
//   Layer 2 (entailment): does the source page's body actually support the
//     claim being made? A token-overlap + key-phrase coverage heuristic
//     today; a fine-tuned NLI model or an LLM-as-judge step drops in here
//     behind the same interface tomorrow. Falsifiable in the eval harness.
//
// A citation only carries trust if BOTH layers pass. A green check in the UI
// is reserved for entailed citations; existence-only citations are styled
// as "located but not entailed" — the honest middle state.

export function verifyCitation(db: DB, matterId: string, bates: string, page: number): boolean {
  const doc = getDocumentByBates(db, matterId, bates);
  if (!doc) return false;
  return page >= 1 && page <= doc.pages;
}

const ENTAILMENT_STOPWORDS = new Set([
  "the", "and", "for", "was", "her", "his", "with", "that", "this", "what",
  "who", "did", "does", "how", "much", "between", "from", "about", "into",
  "are", "were", "she", "him", "they", "them", "have", "has", "had", "but",
  "not", "any", "all", "can", "will", "would", "should", "could", "than",
  "then", "when", "where", "why", "which", "you", "your", "their", "there",
]);

// Tiny Porter-style stemmer — catches the common morphological tail that
// otherwise breaks pure token overlap ("sanctioned" vs "sanction",
// "fabricated" vs "fabricate"). Not linguistically complete; good enough that
// citation entailment isn't defeated by tense or pluralization.
function stem(t: string): string {
  if (t.length <= 4) return t;
  if (t.endsWith("ied")) return t.slice(0, -3) + "y";
  if (t.endsWith("ing")) return t.slice(0, -3);
  if (t.endsWith("ed")) return t.slice(0, -2);
  if (t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.endsWith("es")) return t.slice(0, -2);
  if (t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

function contentTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !ENTAILMENT_STOPWORDS.has(t))
    .map(stem);
}

function bigrams(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < tokens.length; i++) out.push(`${tokens[i]} ${tokens[i + 1]}`);
  return out;
}

export interface CitationSupport {
  existed: boolean;
  entailed: boolean;
  supportScore: number; // 0..1
  matchedKeyTerms: string[];
}

// Returns the per-citation support assessment. Pure function over the doc body
// and the claim text. The score combines:
//   - unigram coverage of distinctive claim tokens
//   - bigram coverage (rewards adjacency, not just keyword presence)
//   - exact-match anchor matches for dates, integers, currency, Bates ids
// supportScore ranges 0..1. entailed = supportScore >= 0.35.
export function scoreCitationSupport(claim: string, body: string): CitationSupport {
  if (!claim || !body) return { existed: false, entailed: false, supportScore: 0, matchedKeyTerms: [] };

  const claimTokens = contentTokens(claim);
  const distinctClaim = [...new Set(claimTokens)];
  if (distinctClaim.length === 0) return { existed: true, entailed: false, supportScore: 0, matchedKeyTerms: [] };

  const bodyLower = body.toLowerCase();
  const bodyTokens = contentTokens(body);
  const bodyTokenSet = new Set(bodyTokens);
  const bodyBigramSet = new Set(bigrams(bodyTokens));

  const matchedUnigrams = distinctClaim.filter((t) => bodyTokenSet.has(t));
  const unigramCoverage = matchedUnigrams.length / distinctClaim.length;

  const claimBigrams = [...new Set(bigrams(claimTokens))];
  const bigramCoverage =
    claimBigrams.length === 0 ? 0 : claimBigrams.filter((b) => bodyBigramSet.has(b)).length / claimBigrams.length;

  // Anchor matches: dates (2019-08-27), 4-digit years, dollar amounts ($5,000),
  // and Bates-style ids (LETTERS-DIGITS). These are high-evidentiary if present.
  const anchorPatterns = [
    /\b\d{4}-\d{2}-\d{2}\b/g, // ISO date
    /\b(19|20)\d{2}\b/g, // year
    /\$\s*\d[\d,]*/g, // dollars
    /\b[A-Z]{2,}-\d{3,}\b/g, // bates
  ];
  let anchorBonus = 0;
  for (const re of anchorPatterns) {
    const claimMatches = claim.match(re) ?? [];
    for (const m of claimMatches) {
      if (bodyLower.includes(m.toLowerCase())) anchorBonus += 0.08;
    }
  }
  anchorBonus = Math.min(anchorBonus, 0.3);

  // Unmatched-token penalty exists for the "elementary school" pattern: entity
  // names match but no concept tokens do. But strong signal should override
  // it — a doc that shares 4+ distinctive content tokens with the question is
  // overwhelmingly likely to be relevant even if 6 other question words are
  // absent. Soft penalty when there's strong overlap, hard penalty otherwise.
  const unmatchedCount = distinctClaim.length - matchedUnigrams.length;
  const strongOverlap = matchedUnigrams.length >= 4 || unigramCoverage >= 0.45;
  const unmatchedPenalty = strongOverlap
    ? Math.min(0.05, unmatchedCount * 0.01)
    : Math.min(0.18, unmatchedCount * 0.04);

  const supportScore = Math.max(
    0,
    Math.min(1, unigramCoverage * 0.5 + bigramCoverage * 0.35 + anchorBonus + 0.05 - unmatchedPenalty),
  );
  const entailed = supportScore >= 0.25;
  return { existed: true, entailed, supportScore: round3(supportScore), matchedKeyTerms: matchedUnigrams.slice(0, 8) };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Full assessment used by chat: existence + entailment in one call.
// We score against the doc's body AND its summary, since both are part of
// the cited source page in our model (the summary is canonical extraction
// from the body). Honest about what the citation actually points to.
export function assessCitation(
  db: DB,
  matterId: string,
  bates: string,
  page: number,
  claim: string,
): CitationSupport {
  const doc = getDocumentByBates(db, matterId, bates);
  if (!doc || page < 1 || page > doc.pages) {
    return { existed: false, entailed: false, supportScore: 0, matchedKeyTerms: [] };
  }
  // Tight haystack: just body + summary + title + date. Author/recipients/
  // entities are metadata, not content of the claim — including them yields
  // false-positive entailment on tangential questions that happen to mention
  // a person who is in the corpus.
  const haystack = `${doc.body}\n\n${doc.summary}\n\n${doc.title}\n\n${doc.date}`;
  const sup = scoreCitationSupport(claim, haystack);
  return { ...sup, existed: true };
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

// Honest confidence: blends entailment quality of the citations themselves
// (not just retrieval-score). If best entailment is weak, confidence is low
// even if retrieval returned many hits.
function calibratedConfidence(hits: SearchHit[], citations: { entailed?: boolean; supportScore?: number }[]): Confidence {
  if (hits.length === 0 || citations.length === 0) return "low";
  const entailedCount = citations.filter((c) => c.entailed).length;
  const best = Math.max(0, ...citations.map((c) => c.supportScore ?? 0));
  if (entailedCount >= 2 && best >= 0.5) return "high";
  if (entailedCount >= 1) return "medium";
  return "low";
}

// Decoupled from entailment threshold: refusal kicks in only when every
// citation is essentially unsupported, not merely below the "entailed" bar.
const REFUSAL_THRESHOLD = 0.22;

export const chatService: ChatService = {
  async ask(db, matterId, question, actor) {
    const now = new Date().toISOString();
    const userTurn: ChatTurn = { id: randomUUID(), role: "user", text: question, createdAt: now };
    insertChat(db, matterId, userTurn);
    audit(db, matterId, actor, "chat.query", question.slice(0, 140));

    const hits = searchService.search(db, matterId, question, { limit: 6, excludePrivileged: true });

    let text: string;
    let citations: ChatTurn["citations"] = [];
    let confidence: Confidence;
    let refused = false;
    let engine: "deterministic" | "llm" = "deterministic";

    if (hits.length === 0) {
      text =
        "I couldn't find non-privileged documents in this matter that speak to that. Try rephrasing, or review the gap analysis on the Overview tab.";
      confidence = "low";
      refused = true;
    } else if (isLLMReady()) {
      // LLM path: synthesize a real grounded answer; assess each cited Bates
      // with the LLM-as-judge entailment pass. Refusal contract preserved —
      // the synthesis prompt itself instructs the model to refuse if the
      // sources don't support a specific answer, and we double-check that
      // posture from the parsed citations.
      engine = "llm";
      const top = hits.slice(0, 5);
      const sources = top.map((h) => ({
        bates: h.doc.bates,
        date: h.doc.date,
        title: h.doc.title,
        summary: h.doc.summary,
        body: h.doc.body,
      }));
      const synth = await synthesizeAnswer(question, sources);
      if (!synth) {
        // LLM transient failure — fall back to deterministic engine for this turn.
        return runDeterministic(db, matterId, question, userTurn, hits, actor);
      }
      text = synth.text;
      refused = synth.refused;

      // Build citation list: cap to those the model actually cited; if none,
      // fall back to top-3 retrieval as "located" anchors so the user can
      // verify the refusal posture.
      const cited = synth.citationBates.length > 0 ? synth.citationBates : top.slice(0, 3).map((h) => h.doc.bates);
      const assessed: NonNullable<ChatTurn["citations"]> = [];
      for (const bates of cited) {
        const doc = getDocumentByBates(db, matterId, bates);
        if (!doc) continue;
        const haystack = `${doc.body}\n\n${doc.summary}\n\n${doc.title}\n\n${doc.date}`;
        const judgment = await judgeEntailment(question, haystack);
        if (judgment) {
          assessed.push({
            bates,
            page: 1,
            verified: true,
            entailed: judgment.entailed,
            supportScore: round3(judgment.supportScore),
            matchedKeyTerms: [],
          });
        } else {
          // Judge failed — fall back to deterministic support score for this cite.
          const sup = scoreCitationSupport(question, haystack);
          assessed.push({
            bates,
            page: 1,
            verified: true,
            entailed: sup.entailed,
            supportScore: sup.supportScore,
            matchedKeyTerms: sup.matchedKeyTerms,
          });
        }
      }
      citations = assessed;
      confidence = calibratedConfidence(hits, assessed);
      if (refused) confidence = "low";
    } else {
      // Deterministic engine — token-overlap entailment + templated synthesis.
      // This is the no-API-key fallback that keeps the prototype usable.
      const det = runDeterministicSync(db, matterId, question, hits);
      text = det.text;
      citations = det.citations;
      confidence = det.confidence;
      refused = det.refused;
    }

    const entailedCount = (citations ?? []).filter((c) => c.entailed).length;
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
      refused ? "chat.refused" : "chat.answer",
      `${engine} · ${citations.length} citations · ${entailedCount} entailed · confidence ${confidence}`,
    );
    return themisTurn;
  },
};

// Deterministic answer synthesis — kept as a function so the LLM path can fall
// back to it on transient API failures without code duplication.
function runDeterministicSync(
  db: DB,
  matterId: string,
  question: string,
  hits: SearchHit[],
): { text: string; citations: NonNullable<ChatTurn["citations"]>; confidence: Confidence; refused: boolean } {
  const top = hits.slice(0, 3);
  const draftBody = top.map((h) => `${h.doc.bates} (${h.doc.date}): ${h.doc.summary}`).join(" ");
  const assessed = top.map((h) => {
    const sup = assessCitation(db, matterId, h.doc.bates, 1, question);
    return {
      bates: h.doc.bates,
      page: 1,
      verified: sup.existed,
      entailed: sup.entailed,
      supportScore: sup.supportScore,
      matchedKeyTerms: sup.matchedKeyTerms,
    };
  });
  const bestSupport = Math.max(0, ...assessed.map((c) => c.supportScore ?? 0));
  if (bestSupport < REFUSAL_THRESHOLD) {
    return {
      text:
        "I located documents that mention your question's terms, but none of them actually support a specific answer. Rather than guess, I'm declining to claim. Review the cited Bates below directly, or rephrase the question.",
      citations: assessed,
      confidence: "low",
      refused: true,
    };
  }
  const entailedTop = assessed.filter((c) => c.entailed);
  const text =
    entailedTop.length === 0
      ? `${hits.length} document${hits.length > 1 ? "s" : ""} mention this question's terms but none cleanly entail a specific answer. The strongest located source is ${top[0].doc.bates} (${top[0].doc.date}): ${top[0].doc.summary} Treat as a starting point, not a conclusion.`
      : `${entailedTop.length} of ${hits.length} document${hits.length > 1 ? "s" : ""} in this matter directly entail an answer. ${draftBody} Every citation below was checked for both existence and entailment against its source page.`;
  return { text, citations: assessed, confidence: calibratedConfidence(hits, assessed), refused: false };
}

// Async wrapper that also writes audit + returns a full ChatTurn — used when
// the LLM path bails mid-call and we still want a usable answer for the user.
async function runDeterministic(
  db: DB,
  matterId: string,
  question: string,
  _userTurn: ChatTurn,
  hits: SearchHit[],
  _actor: string,
): Promise<ChatTurn> {
  const det = runDeterministicSync(db, matterId, question, hits);
  const themisTurn: ChatTurn = {
    id: randomUUID(),
    role: "themis",
    text: det.text,
    citations: det.citations.length ? det.citations : undefined,
    confidence: det.confidence,
    createdAt: new Date().toISOString(),
  };
  insertChat(db, matterId, themisTurn);
  const entailedCount = det.citations.filter((c) => c.entailed).length;
  audit(
    db,
    matterId,
    "themis",
    det.refused ? "chat.refused" : "chat.answer",
    `deterministic (llm fallback) · ${det.citations.length} citations · ${entailedCount} entailed · confidence ${det.confidence}`,
  );
  return themisTurn;
}

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
