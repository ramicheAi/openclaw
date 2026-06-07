// CourtListener bridge — verify legal authorities (case-law citations) against
// the Free Law Project's CourtListener corpus, which covers federal and most
// state appellate opinions for free. This is the "Mata v. Avianca shield":
// paste a brief, and every case citation gets checked for real existence.
//
// API: POST https://www.courtlistener.com/api/rest/v4/citation-lookup/
//   body  : { text: "<blob containing citations>" }  (eyecite parses it)
//   header: Authorization: Token <COURTLISTENER_API_TOKEN>   (optional; raises
//           rate limits and is recommended, but the endpoint also answers
//           anonymously at a lower ceiling)
//   returns: array of { citation, normalized_citations, start_index, end_index,
//            status, error_message, clusters: [{ case_name, absolute_url,
//            date_filed, citation_count, ... }] }
//
// status semantics (HTTP-like codes inside the JSON):
//   200 → found and unambiguous (the citation is REAL)
//   300 → found but matches multiple opinions (ambiguous — needs a human)
//   404 → well-formed citation that resolves to NOTHING (likely hallucinated)
//   429 → rate limited (we processed >250 cites; the rest are unchecked)
//   else → malformed / unparseable
//
// We never *fail closed* on a network error: if CourtListener is down we mark
// each citation "unverified" with the reason, so the operator knows the check
// didn't run rather than seeing a false all-clear.

const ENDPOINT = "https://www.courtlistener.com/api/rest/v4/citation-lookup/";

export type AuthorityVerdict =
  | "verified" // real, unambiguous
  | "ambiguous" // matches multiple opinions
  | "not_found" // well-formed but resolves to nothing — likely fabricated
  | "malformed" // couldn't parse as a citation
  | "rate_limited" // CourtListener cut us off mid-batch
  | "unverified"; // network/auth failure — check didn't run

export interface AuthorityMatch {
  caseName: string;
  url: string; // absolute CourtListener URL
  dateFiled?: string;
  citationCount?: number; // how many later opinions cite it (authority weight)
  court?: string;
}

export interface AuthorityFinding {
  citation: string; // the citation text as it appeared
  startIndex: number;
  endIndex: number;
  verdict: AuthorityVerdict;
  statusCode: number;
  matches: AuthorityMatch[];
  note?: string;
}

interface CLCluster {
  case_name?: string;
  caseName?: string;
  absolute_url?: string;
  date_filed?: string;
  dateFiled?: string;
  citation_count?: number;
  citeCount?: number;
  court?: string;
}
interface CLResult {
  citation?: string;
  start_index?: number;
  end_index?: number;
  status?: number;
  error_message?: string;
  clusters?: CLCluster[];
}

function verdictForStatus(status: number, clusters: number): AuthorityVerdict {
  if (status === 200) return clusters > 1 ? "ambiguous" : "verified";
  if (status === 300) return "ambiguous";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return "malformed";
}

export function isCourtListenerConfigured(): boolean {
  return !!process.env.COURTLISTENER_API_TOKEN;
}

export async function verifyAuthorities(text: string): Promise<{
  ok: boolean;
  findings: AuthorityFinding[];
  error?: string;
  configured: boolean;
}> {
  const configured = isCourtListenerConfigured();
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  const token = process.env.COURTLISTENER_API_TOKEN;
  if (token) headers["Authorization"] = `Token ${token}`;

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers,
      body: new URLSearchParams({ text: text.slice(0, 64_000) }).toString(),
    });
  } catch (err) {
    return {
      ok: false,
      configured,
      findings: [],
      error: `Could not reach CourtListener: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      configured,
      findings: [],
      error: "CourtListener rejected the token. Set a valid COURTLISTENER_API_TOKEN (free at courtlistener.com/profile/api).",
    };
  }
  if (res.status === 429) {
    return { ok: false, configured, findings: [], error: "CourtListener rate-limited this request. Wait a minute and retry, or add an API token to raise the ceiling." };
  }
  if (!res.ok) {
    return { ok: false, configured, findings: [], error: `CourtListener returned ${res.status}.` };
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    return { ok: false, configured, findings: [], error: "CourtListener returned a non-JSON response." };
  }
  const results = Array.isArray(raw) ? (raw as CLResult[]) : [];
  const findings: AuthorityFinding[] = results.map((r) => {
    const clusters = r.clusters ?? [];
    const status = r.status ?? 0;
    const matches: AuthorityMatch[] = clusters.map((c) => ({
      caseName: c.case_name ?? c.caseName ?? "(unnamed opinion)",
      url: c.absolute_url ? `https://www.courtlistener.com${c.absolute_url}` : "",
      dateFiled: c.date_filed ?? c.dateFiled,
      citationCount: c.citation_count ?? c.citeCount,
      court: c.court,
    }));
    return {
      citation: r.citation ?? "(unknown)",
      startIndex: r.start_index ?? 0,
      endIndex: r.end_index ?? 0,
      verdict: verdictForStatus(status, matches.length),
      statusCode: status,
      matches,
      note: r.error_message,
    };
  });

  return { ok: true, configured, findings };
}
