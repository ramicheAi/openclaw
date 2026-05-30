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
    throw new ApiError(res.status, (data as { error?: string }).error ?? "error", (data as { hint?: string }).hint);
  }
  return data as T;
}

export const api = {
  listMatters: () => request<{ matters: MatterSummary[] }>("/api/matters").then((r) => r.matters),

  getMatter: (id: string) => request<MatterDetail>(`/api/matters/${id}`),

  getAudit: (id: string, limit = 50) =>
    request<{ entries: AuditEntry[] }>(`/api/matters/${id}/audit?limit=${limit}`).then((r) => r.entries),

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
