// Typed client for the Themis backend (themis/server). Framework-agnostic —
// the next frontend can wrap these in hooks / react-query as needed.
// In dev, Vite proxies /api to the server (see vite.config.ts).

import type {
  AuditChainStatus,
  AuditEntry,
  Binder,
  CausalChain,
  CausalChainNode,
  ChatTurn,
  ChronEvent,
  DocItem,
  Entity,
  MatterDetail,
  MatterSummary,
  PrivilegeFlag,
  SearchHit,
  VerifyResult,
  DepoOutline,
  Deadline,
  DraftKindOption,
  DraftResult,
  DraftKind,
  Production,
  ProductionDirection,
  ConflictHit,
  ShareLink,
  ShareScope,
  SharedView,
  DamagesItem,
  DamagesCategory,
} from "../types";

const BASE = import.meta.env.VITE_THEMIS_API ?? "";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data as { error?: string; message?: string; hint?: string; detail?: string };
    // Surface the human-readable message when the server provides one so
    // the UI can show 'Bates X is already used in this matter' instead of
    // an opaque code.
    const msg = d.message ?? d.detail ?? d.hint ?? d.error ?? "error";
    throw new ApiError(res.status, d.error ?? "error", msg);
  }
  return data as T;
}

export const api = {
  listMatters: () => request<{ matters: MatterSummary[] }>("/api/matters").then((r) => r.matters),

  getMatter: (id: string) => request<MatterDetail>(`/api/matters/${id}`),

  getEngineStatus: () =>
    request<{
      llm: boolean;
      engine: "llm" | "deterministic";
      model: string | null;
      lastError: string | null;
    }>(`/api/engine`),

  createMatter: (input: {
    name: string;
    client: string;
    matterType?: string;
    leadAttorney?: string;
    posture?: string;
  }) =>
    request<{ matter: MatterDetail; id: string }>(`/api/matters`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),

  nextBates: (matterId: string, prefix?: string) =>
    request<{ prefix: string; next: string; count: number }>(
      `/api/matters/${matterId}/next-bates${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ""}`,
    ),

  extractMetadata: (text: string, filename?: string) =>
    request<{
      title?: string;
      type?: string;
      date?: string;
      author?: string;
      recipients?: string[];
      summary?: string;
      confidence: "high" | "medium" | "low";
      signals: string[];
    }>(`/api/extract-metadata`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, filename }),
    }),

  renameSpeakers: (matterId: string, docId: string, speakers: Record<string, string>) =>
    request<{ ok: boolean; speakers: Record<string, string> }>(
      `/api/matters/${matterId}/documents/${docId}/speakers`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ speakers }),
      },
    ),

  analyzeMatter: (matterId: string) =>
    request<{ ok: true; entities: number; events: number; hot: number; gaps: number }>(
      `/api/matters/${matterId}/analyze`,
      { method: "POST" },
    ),

  createDocument: (matterId: string, input: {
    bates: string;
    title: string;
    type?: string;
    date?: string;
    author?: string;
    recipients?: string[];
    summary?: string;
    body: string;
    entities?: string[];
    pages?: number;
  }) =>
    request<DocItem>(`/api/matters/${matterId}/documents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),

  getAudit: (id: string, limit = 50) =>
    request<{ entries: AuditEntry[] }>(`/api/matters/${id}/audit?limit=${limit}`).then((r) => r.entries),

  citeCheck: (id: string, text: string) =>
    request<{
      total: number;
      existed: number;
      entailed: number;
      findings: {
        bates: string;
        page: number;
        index: number;
        existed: boolean;
        entailed: boolean;
        supportScore: number;
        title?: string;
        date?: string;
        privilege?: string;
      }[];
    }>(`/api/matters/${id}/cite-check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    }),

  verifyAuditChain: (id: string) => request<AuditChainStatus>(`/api/matters/${id}/audit/verify`),

  listDocuments: (id: string) =>
    request<{ documents: DocItem[] }>(`/api/matters/${id}/documents`).then((r) => r.documents),

  getDocument: (id: string, docId: string) => request<DocItem>(`/api/matters/${id}/documents/${docId}`),

  search: (id: string, q: string, limit = 10) =>
    request<{ hits: SearchHit[] }>(`/api/matters/${id}/search?q=${encodeURIComponent(q)}&limit=${limit}`).then(
      (r) => r.hits,
    ),

  listChronology: (id: string) =>
    request<{ events: ChronEvent[] }>(`/api/matters/${id}/chronology`).then((r) => r.events),

  setChronologyAccepted: (id: string, eventId: string, accepted: boolean | null) =>
    request<ChronEvent>(`/api/matters/${id}/chronology/${eventId}`, {
      method: "PATCH",
      body: JSON.stringify({ accepted }),
    }),

  listEntities: (id: string) =>
    request<{ entities: Entity[] }>(`/api/matters/${id}/entities`).then((r) => r.entities),

  listPrivilegeQueue: (id: string) =>
    request<{ queue: DocItem[] }>(`/api/matters/${id}/privilege`).then((r) => r.queue),

  decidePrivilege: (id: string, docId: string, decision: "cleared" | "withheld") =>
    request<DocItem>(`/api/matters/${id}/privilege/${docId}`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),

  scanPrivilege: (id: string) =>
    request<{ flags: PrivilegeFlag[] }>(`/api/matters/${id}/privilege/scan`, { method: "POST" }).then(
      (r) => r.flags,
    ),

  listChat: (id: string) => request<{ turns: ChatTurn[] }>(`/api/matters/${id}/chat`).then((r) => r.turns),

  ask: (id: string, question: string) =>
    request<ChatTurn>(`/api/matters/${id}/chat`, {
      method: "POST",
      body: JSON.stringify({ question }),
    }),

  // --- Cite Check (Mata shield) ---

  verifyDraft: (id: string, text: string) =>
    request<VerifyResult>(`/api/matters/${id}/verify`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  getVerifyStatus: () =>
    request<{ courtListenerConfigured: boolean }>(`/api/verify/status`),

  // --- Deposition outline ---

  buildDepositionOutline: (id: string, witness: string) =>
    request<DepoOutline>(`/api/matters/${id}/deposition-outline`, {
      method: "POST",
      body: JSON.stringify({ witness }),
    }),

  // --- Deadlines ---

  listDeadlines: (id: string) =>
    request<{ deadlines: Deadline[] }>(`/api/matters/${id}/deadlines`).then((r) => r.deadlines),

  extractDeadlines: (id: string, text: string, source?: string) =>
    request<{ deadlines: Deadline[]; added: number }>(`/api/matters/${id}/deadlines/extract`, {
      method: "POST",
      body: JSON.stringify({ text, source }),
    }),

  setDeadlineDone: (id: string, dlId: string, done: boolean) =>
    request<Deadline>(`/api/matters/${id}/deadlines/${dlId}`, {
      method: "PATCH",
      body: JSON.stringify({ done }),
    }),

  deleteDeadline: (id: string, dlId: string) =>
    request<{ ok: boolean }>(`/api/matters/${id}/deadlines/${dlId}`, { method: "DELETE" }),

  // --- Drafting ---

  listDraftKinds: () =>
    request<{ kinds: DraftKindOption[] }>(`/api/draft-kinds`).then((r) => r.kinds),

  // --- Damages ---

  listDamages: (id: string) =>
    request<{ items: DamagesItem[] }>(`/api/matters/${id}/damages`).then((r) => r.items),

  createDamagesItem: (
    id: string,
    item: {
      category: DamagesCategory;
      description: string;
      amountCents: number;
      multiplier?: number;
      dateIncurred?: string;
      citationBates?: string;
      notes?: string;
    },
  ) =>
    request<DamagesItem>(`/api/matters/${id}/damages`, {
      method: "POST",
      body: JSON.stringify(item),
    }),

  updateDamagesItem: (
    id: string,
    itemId: string,
    patch: Partial<{
      category: DamagesCategory;
      description: string;
      amountCents: number;
      multiplier: number;
      dateIncurred: string;
      citationBates: string;
      notes: string;
    }>,
  ) =>
    request<DamagesItem>(`/api/matters/${id}/damages/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteDamagesItem: (id: string, itemId: string) =>
    request<{ ok: boolean }>(`/api/matters/${id}/damages/${itemId}`, { method: "DELETE" }),

  // --- Sharing ---

  listShareLinks: (id: string) =>
    request<{ links: ShareLink[] }>(`/api/matters/${id}/share-links`).then((r) => r.links),

  createShareLink: (id: string, payload: { label?: string; scope?: ShareScope; binderId?: string; expiresAt?: string }) =>
    request<ShareLink>(`/api/matters/${id}/share-links`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  revokeShareLink: (id: string, token: string) =>
    request<{ ok: boolean }>(`/api/matters/${id}/share-links/${token}`, { method: "DELETE" }),

  getSharedView: (token: string) => request<SharedView>(`/api/shared/${token}`),

  // --- Conflicts ---

  checkConflicts: (names: string[], excludeMatterId?: string) =>
    request<{ checked: number; hits: ConflictHit[] }>(`/api/conflicts/check`, {
      method: "POST",
      body: JSON.stringify({ names, excludeMatterId }),
    }),

  // --- Productions manifest ---

  listProductions: (id: string) =>
    request<{ productions: Production[] }>(`/api/matters/${id}/productions`).then((r) => r.productions),

  createProduction: (
    id: string,
    p: {
      direction: ProductionDirection;
      party: string;
      prodDate: string;
      label?: string;
      batesStart: string;
      batesEnd: string;
      privilegeLog?: boolean;
      notes?: string;
    },
  ) =>
    request<Production>(`/api/matters/${id}/productions`, {
      method: "POST",
      body: JSON.stringify(p),
    }),

  deleteProduction: (id: string, prodId: string) =>
    request<{ ok: boolean }>(`/api/matters/${id}/productions/${prodId}`, { method: "DELETE" }),

  generateDraft: (
    id: string,
    payload: {
      kind: DraftKind;
      eventBates?: string[];
      addressee?: string;
      demandAmount?: string;
      instructions?: string;
    },
  ) =>
    request<DraftResult>(`/api/matters/${id}/drafts`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // --- Binders ---

  listBinders: (id: string) =>
    request<{ binders: Binder[] }>(`/api/matters/${id}/binders`).then((r) => r.binders),

  createBinder: (id: string, name: string) =>
    request<Binder>(`/api/matters/${id}/binders`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  renameBinder: (id: string, binderId: string, name: string) =>
    request<Binder>(`/api/matters/${id}/binders/${binderId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),

  reorderBinder: (id: string, binderId: string, order: string[]) =>
    request<Binder>(`/api/matters/${id}/binders/${binderId}`, {
      method: "PATCH",
      body: JSON.stringify({ order }),
    }),

  deleteBinder: (id: string, binderId: string) =>
    request<{ ok: boolean }>(`/api/matters/${id}/binders/${binderId}`, { method: "DELETE" }),

  addBinderItem: (id: string, binderId: string, docId: string, label?: string) =>
    request<Binder>(`/api/matters/${id}/binders/${binderId}/items`, {
      method: "POST",
      body: JSON.stringify({ docId, label }),
    }),

  renameBinderItem: (id: string, binderId: string, itemId: string, label: string) =>
    request<Binder>(`/api/matters/${id}/binders/${binderId}/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ label }),
    }),

  removeBinderItem: (id: string, binderId: string, itemId: string) =>
    request<Binder>(`/api/matters/${id}/binders/${binderId}/items/${itemId}`, { method: "DELETE" }),

  // --- Per-doc review state ---

  setDocReview: (id: string, docId: string, patch: { hot?: boolean; reviewed?: boolean }) =>
    request<DocItem>(`/api/matters/${id}/documents/${docId}/review`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  // --- Causal chains ---

  listChains: (id: string) =>
    request<{ chains: CausalChain[] }>(`/api/matters/${id}/chains`).then((r) => r.chains),

  createChain: (id: string, name: string, nodes: CausalChainNode[]) =>
    request<CausalChain>(`/api/matters/${id}/chains`, {
      method: "POST",
      body: JSON.stringify({ name, nodes }),
    }),

  updateChain: (id: string, chainId: string, patch: { name?: string; nodes?: CausalChainNode[] }) =>
    request<CausalChain>(`/api/matters/${id}/chains/${chainId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteChain: (id: string, chainId: string) =>
    request<{ ok: boolean }>(`/api/matters/${id}/chains/${chainId}`, { method: "DELETE" }),
};
