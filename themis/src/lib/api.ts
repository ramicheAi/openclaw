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
  SpokenLine,
  FirmAuditEntry,
  MatterAccess,
  MatterRole,
  WebhookEndpoint,
  FirmTemplate,
  TemplateKind,
} from "../types";

const BASE = import.meta.env.VITE_THEMIS_API ?? "";

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export interface PlanLimitInfo {
  limit: "matters" | "pages" | "seats" | "feature";
  current: number;
  cap: number;
  plan: string;
  message: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include", // send session cookie cross-origin in case the
                            // API is on a different host than the SPA.
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data as { error?: string; message?: string; hint?: string; detail?: string; limit?: string; current?: number; cap?: number; plan?: string };
    // 402 plan-limit responses get broadcast on a global event so a top-
    // level upgrade modal can intercept and show a real CTA instead of a
    // raw toast/error string.
    if (res.status === 402 && d.error === "plan_limit" && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent<PlanLimitInfo>("themis:plan-limit", {
        detail: {
          limit: (d.limit ?? "feature") as PlanLimitInfo["limit"],
          current: d.current ?? 0,
          cap: d.cap ?? 0,
          plan: d.plan ?? "free",
          message: d.message ?? "You've hit a plan limit. Upgrade to continue.",
        },
      }));
    }
    const msg = d.message ?? d.detail ?? d.hint ?? d.error ?? "error";
    throw new ApiError(res.status, d.error ?? "error", msg);
  }
  return data as T;
}

export interface AuthMe {
  mode: "single-user" | "multi-tenant";
  user: { email: string; name: string } | null;
}

// --- PERM work-product engine ---
export interface PermAuditRow {
  label: string;
  severity: "high" | "medium" | "low";
  status: "present" | "partial" | "missing";
  bates?: string;
  note?: string;
}
export interface PermAuditReport {
  packId: string;
  packLabel: string;
  total: number;
  present: number;
  partial: number;
  missing: number;
  highMissing: number;
  ready: boolean;
  rows: PermAuditRow[];
}
export interface Eta9089Value {
  source: string;
  value: string;
  bates: string;
}
export interface Eta9089Finding {
  field: string;
  severity: "high" | "medium" | "low";
  status: "inconsistent" | "missing_source";
  values: Eta9089Value[];
  note?: string;
}
export interface Eta9089Report {
  total: number;
  high: number;
  clean: boolean;
  findings: Eta9089Finding[];
}

export const api = {
  // --- Auth ---
  getMe: () => request<AuthMe>(`/api/auth/me`),

  requestMagicLink: (email: string) =>
    request<{ ok: boolean; via?: "resend" | "console"; delivered?: boolean; url?: string; mode?: string; message?: string }>(
      `/api/auth/request-link`,
      {
        method: "POST",
        body: JSON.stringify({ email }),
      },
    ),

  logout: () => request<{ ok: boolean }>(`/api/auth/logout`, { method: "POST" }),

  // --- Billing ---
  billingStatus: () =>
    request<{
      configured: boolean;
      plan: string;
      planLabel?: string;
      planActiveUntil: string | null;
      hasSubscription: boolean;
      stripeCustomerId: string | null;
      usage?: {
        matters: { used: number; cap: number };
        pages: { used: number; cap: number };
        seats: { used: number; cap: number };
      };
    }>(`/api/billing/status`),
  billingCheckout: (plan: string) =>
    request<{ url?: string; error?: string }>(`/api/billing/checkout`, {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),
  billingPortal: () =>
    request<{ url: string }>(`/api/billing/portal`, { method: "POST" }),

  // --- Public Cite Check (no auth) ---
  publicCiteCheck: (text: string, email?: string) =>
    request<unknown>(`/api/public/cite-check`, {
      method: "POST",
      body: JSON.stringify({ text, email }),
    }),
  publicSaveLead: (email: string) =>
    request<{ ok: boolean }>(`/api/public/save-lead`, {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  // --- Team access (per-matter) ---
  listMatterAccess: (matterId: string) =>
    request<{ access: MatterAccess[] }>(`/api/matters/${matterId}/access`).then((r) => r.access),
  grantMatterAccess: (matterId: string, email: string, role: MatterRole) =>
    request<MatterAccess>(`/api/matters/${matterId}/access`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),
  revokeMatterAccess: (matterId: string, email: string) =>
    request<{ ok: boolean }>(`/api/matters/${matterId}/access/${encodeURIComponent(email)}`, {
      method: "DELETE",
    }),

  // --- Webhooks (firm-scoped) ---
  listWebhooks: () => request<{ webhooks: WebhookEndpoint[] }>(`/api/webhooks`).then((r) => r.webhooks),
  createWebhook: (url: string, events = "audit.*") =>
    request<WebhookEndpoint>(`/api/webhooks`, {
      method: "POST",
      body: JSON.stringify({ url, events }),
    }),
  deleteWebhook: (id: string) =>
    request<{ ok: boolean }>(`/api/webhooks/${id}`, { method: "DELETE" }),

  listMatters: () => request<{ matters: MatterSummary[] }>("/api/matters").then((r) => r.matters),

  listArchivedMatters: () =>
    request<{ matters: MatterSummary[] }>("/api/matters/archived").then((r) => r.matters),

  setMatterArchived: (id: string, archived: boolean) =>
    request<{ ok: boolean; archived: boolean }>(`/api/matters/${id}/archive`, {
      method: "POST",
      body: JSON.stringify({ archived }),
    }),

  listPacks: () =>
    request<{ packs: { id: string; label: string; blurb: string }[] }>(`/api/packs`).then((r) => r.packs),

  // --- Firm Library templates ---
  listTemplates: (kind?: TemplateKind) =>
    request<{ templates: FirmTemplate[] }>(`/api/templates${kind ? `?kind=${kind}` : ""}`).then((r) => r.templates),
  createTemplate: (input: { kind: TemplateKind; category?: string; title: string; body?: string; tags?: string }) =>
    request<FirmTemplate>(`/api/templates`, { method: "POST", body: JSON.stringify(input) }),
  updateTemplate: (id: string, patch: Partial<{ kind: TemplateKind; category: string; title: string; body: string; tags: string }>) =>
    request<FirmTemplate>(`/api/templates/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteTemplate: (id: string) =>
    request<{ ok: boolean }>(`/api/templates/${id}`, { method: "DELETE" }),
  useTemplate: (id: string) =>
    request<{ ok: boolean }>(`/api/templates/${id}/use`, { method: "POST" }),

  listFirmAudit: (limit = 200) =>
    request<{ entries: FirmAuditEntry[] }>(`/api/firm/audit?limit=${limit}`).then((r) => r.entries),

  listUpcomingDeadlines: () =>
    request<{
      deadlines: { id: string; matterId: string; matterName: string; dueDate: string; title: string; kind: string; detail: string }[];
    }>(`/api/firm/upcoming-deadlines`).then((r) => r.deadlines),

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
    packId?: string;
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

  // PERM: grade the matter's documents against the required-exhibit checklist.
  auditFileCheck: (matterId: string) =>
    request<PermAuditReport>(`/api/matters/${matterId}/audit-file`, { method: "POST" }),

  // PERM: cross-check the ETA-9089 against the PWD + recruitment ads.
  eta9089Check: (matterId: string) =>
    request<Eta9089Report>(`/api/matters/${matterId}/eta-9089-check`, { method: "POST" }),

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

  generateCertification: (
    id: string,
    payload: { filing: string; jurisdiction?: string; signer?: string; barNumber?: string },
  ) =>
    request<{
      text: string;
      stats: {
        cite_check_runs: number;
        authorities_verified: number;
        authorities_not_found: number;
        bates_verified: number;
        bates_not_in_matter: number;
        last_run?: string;
      };
    }>(`/api/matters/${id}/certification`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // --- Speaker timeline ---

  listSpokenLines: (id: string, entityName: string, aliases: string[] = []) =>
    request<{ name: string; lines: SpokenLine[] }>(
      `/api/matters/${id}/entities/${encodeURIComponent(entityName)}/quotes${aliases.length ? `?aliases=${encodeURIComponent(aliases.join(","))}` : ""}`,
    ).then((r) => r.lines),

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
