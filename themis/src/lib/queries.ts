// TanStack Query hooks — server state for the Worktop + Brain modes.
// One module so the queryKey conventions live in one place.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export const qk = {
  matters: ["matters"] as const,
  matter: (id: string) => ["matter", id] as const,
  documents: (id: string) => ["matter", id, "documents"] as const,
  document: (id: string, docId: string) => ["matter", id, "document", docId] as const,
  chronology: (id: string) => ["matter", id, "chronology"] as const,
  entities: (id: string) => ["matter", id, "entities"] as const,
  privilege: (id: string) => ["matter", id, "privilege"] as const,
  chat: (id: string) => ["matter", id, "chat"] as const,
  audit: (id: string) => ["matter", id, "audit"] as const,
  binders: (id: string) => ["matter", id, "binders"] as const,
  chains: (id: string) => ["matter", id, "chains"] as const,
};

export function useMatters() {
  return useQuery({ queryKey: qk.matters, queryFn: api.listMatters });
}

export function useEngineStatus() {
  return useQuery({
    queryKey: ["engine"],
    queryFn: api.getEngineStatus,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

export function useMatter(id: string) {
  return useQuery({ queryKey: qk.matter(id), queryFn: () => api.getMatter(id) });
}

export function useDocuments(id: string) {
  return useQuery({ queryKey: qk.documents(id), queryFn: () => api.listDocuments(id) });
}

export function useDocument(id: string, docId: string | null) {
  return useQuery({
    queryKey: qk.document(id, docId ?? ""),
    queryFn: () => api.getDocument(id, docId!),
    enabled: !!docId,
  });
}

export function useChronology(id: string) {
  return useQuery({ queryKey: qk.chronology(id), queryFn: () => api.listChronology(id) });
}

export function useEntities(id: string) {
  return useQuery({ queryKey: qk.entities(id), queryFn: () => api.listEntities(id) });
}

export function usePrivilegeQueue(id: string) {
  return useQuery({ queryKey: qk.privilege(id), queryFn: () => api.listPrivilegeQueue(id) });
}

export function useChatHistory(id: string) {
  return useQuery({ queryKey: qk.chat(id), queryFn: () => api.listChat(id) });
}

export function useAudit(id: string, limit = 50) {
  return useQuery({
    queryKey: [...qk.audit(id), limit],
    queryFn: () => api.getAudit(id, limit),
  });
}

export function useAuditChain(id: string) {
  return useQuery({
    queryKey: [...qk.audit(id), "verify"],
    queryFn: () => api.verifyAuditChain(id),
  });
}

// --- Mutations: every one invalidates the data it touches AND the audit log.

export function useAskThemis(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (question: string) => api.ask(id, question),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.chat(id) });
      qc.invalidateQueries({ queryKey: qk.audit(id) });
    },
  });
}

export function useSetChronologyAccepted(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, accepted }: { eventId: string; accepted: boolean | null }) =>
      api.setChronologyAccepted(id, eventId, accepted),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.chronology(id) });
      qc.invalidateQueries({ queryKey: qk.audit(id) });
    },
  });
}

export function useDecidePrivilege(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, decision }: { docId: string; decision: "cleared" | "withheld" }) =>
      api.decidePrivilege(id, docId, decision),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.privilege(id) });
      qc.invalidateQueries({ queryKey: qk.documents(id) });
      qc.invalidateQueries({ queryKey: qk.matter(id) }); // computed privilegeQueue count
      qc.invalidateQueries({ queryKey: qk.matters });
      qc.invalidateQueries({ queryKey: qk.audit(id) });
    },
  });
}

// --- Binders ---

export function useBinders(id: string) {
  return useQuery({ queryKey: qk.binders(id), queryFn: () => api.listBinders(id) });
}

function invalidateBinders(qc: ReturnType<typeof useQueryClient>, id: string) {
  qc.invalidateQueries({ queryKey: qk.binders(id) });
  qc.invalidateQueries({ queryKey: qk.audit(id) });
}

export function useCreateBinder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.createBinder(id, name),
    onSuccess: () => invalidateBinders(qc, id),
  });
}

export function useRenameBinder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ binderId, name }: { binderId: string; name: string }) =>
      api.renameBinder(id, binderId, name),
    onSuccess: () => invalidateBinders(qc, id),
  });
}

export function useDeleteBinder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (binderId: string) => api.deleteBinder(id, binderId),
    onSuccess: () => invalidateBinders(qc, id),
  });
}

export function useAddBinderItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ binderId, docId, label }: { binderId: string; docId: string; label?: string }) =>
      api.addBinderItem(id, binderId, docId, label),
    onSuccess: () => invalidateBinders(qc, id),
  });
}

export function useRemoveBinderItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ binderId, itemId }: { binderId: string; itemId: string }) =>
      api.removeBinderItem(id, binderId, itemId),
    onSuccess: () => invalidateBinders(qc, id),
  });
}

export function useRenameBinderItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ binderId, itemId, label }: { binderId: string; itemId: string; label: string }) =>
      api.renameBinderItem(id, binderId, itemId, label),
    onSuccess: () => invalidateBinders(qc, id),
  });
}

export function useReorderBinder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ binderId, order }: { binderId: string; order: string[] }) =>
      api.reorderBinder(id, binderId, order),
    onSuccess: () => invalidateBinders(qc, id),
  });
}

// --- Per-doc review state ---

export function useSetDocReview(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, patch }: { docId: string; patch: { hot?: boolean; reviewed?: boolean } }) =>
      api.setDocReview(id, docId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.documents(id) });
      qc.invalidateQueries({ queryKey: qk.matter(id) });
      qc.invalidateQueries({ queryKey: qk.matters });
      qc.invalidateQueries({ queryKey: qk.audit(id) });
    },
  });
}

// --- Causal chains ---

export function useCausalChains(id: string) {
  return useQuery({ queryKey: qk.chains(id), queryFn: () => api.listChains(id) });
}

function invalidateChains(qc: ReturnType<typeof useQueryClient>, id: string) {
  qc.invalidateQueries({ queryKey: qk.chains(id) });
  qc.invalidateQueries({ queryKey: qk.audit(id) });
}

export function useCreateChain(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, nodes }: { name: string; nodes: import("../types").CausalChainNode[] }) =>
      api.createChain(id, name, nodes),
    onSuccess: () => invalidateChains(qc, id),
  });
}

export function useUpdateChain(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chainId, patch }: { chainId: string; patch: { name?: string; nodes?: import("../types").CausalChainNode[] } }) =>
      api.updateChain(id, chainId, patch),
    onSuccess: () => invalidateChains(qc, id),
  });
}

export function useDeleteChain(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (chainId: string) => api.deleteChain(id, chainId),
    onSuccess: () => invalidateChains(qc, id),
  });
}
