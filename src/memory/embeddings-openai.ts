import { requireApiKey, resolveApiKeyForProvider } from "../agents/model-auth.js";
import type { EmbeddingProvider, EmbeddingProviderOptions } from "./embeddings.js";

export type OpenAiEmbeddingClient = {
  baseUrl: string;
  headers: Record<string, string>;
  model: string;
};

export const DEFAULT_OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

export function normalizeOpenAiModel(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) return DEFAULT_OPENAI_EMBEDDING_MODEL;
  if (trimmed.startsWith("openai/")) return trimmed.slice("openai/".length);
  return trimmed;
}

export async function createOpenAiEmbeddingProvider(
  options: EmbeddingProviderOptions,
): Promise<{ provider: EmbeddingProvider; client: OpenAiEmbeddingClient }> {
  const client = await resolveOpenAiEmbeddingClient(options);
  const url = `${client.baseUrl.replace(/\/$/, "")}/embeddings`;

  // OpenAI embedding models cap at 8192 input tokens. Token-count is hard to
  // predict from char count (dense JSON/code/multibyte content can exceed
  // limits at small char sizes), so we defensively truncate by chars AND
  // recursively halve a failing batch — a single bad chunk gets isolated and
  // skipped (empty embedding) without taking down the whole reindex.
  const MAX_INPUT_CHARS = 6000;
  const isTokenLimitError = (message: string) =>
    /maximum input length|maximum context length|input too long|too many tokens/i.test(message);

  const postEmbeddings = async (input: string[]): Promise<number[][]> => {
    const res = await fetch(url, {
      method: "POST",
      headers: client.headers,
      body: JSON.stringify({ model: client.model, input }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`openai embeddings failed: ${res.status} ${text}`);
    }
    const payload = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    return (payload.data ?? []).map((entry) => entry.embedding ?? []);
  };

  const embed = async (input: string[]): Promise<number[][]> => {
    if (input.length === 0) return [];
    const safeInput = input.map((s) =>
      s.length > MAX_INPUT_CHARS ? s.slice(0, MAX_INPUT_CHARS) : s,
    );
    try {
      return await postEmbeddings(safeInput);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Non-token errors: rethrow (caller's retry-with-backoff handles rate limits etc.)
      if (!isTokenLimitError(message)) throw err;

      // Token-limit failure: halve the batch and retry each half. Single failing
      // input is logged and skipped with an empty-embedding placeholder so the
      // rest of the reindex can complete.
      if (safeInput.length === 1) {
        console.warn(
          `[memory] skipping chunk that exceeds embedding token limit (chars=${safeInput[0]?.length})`,
        );
        return [[]];
      }
      const mid = Math.floor(safeInput.length / 2);
      const [left, right] = await Promise.all([
        embed(safeInput.slice(0, mid)),
        embed(safeInput.slice(mid)),
      ]);
      return [...left, ...right];
    }
  };

  return {
    provider: {
      id: "openai",
      model: client.model,
      embedQuery: async (text) => {
        const [vec] = await embed([text]);
        return vec ?? [];
      },
      embedBatch: embed,
    },
    client,
  };
}

export async function resolveOpenAiEmbeddingClient(
  options: EmbeddingProviderOptions,
): Promise<OpenAiEmbeddingClient> {
  const remote = options.remote;
  const remoteApiKey = remote?.apiKey?.trim();
  const remoteBaseUrl = remote?.baseUrl?.trim();

  const apiKey = remoteApiKey
    ? remoteApiKey
    : requireApiKey(
        await resolveApiKeyForProvider({
          provider: "openai",
          cfg: options.config,
          agentDir: options.agentDir,
        }),
        "openai",
      );

  const providerConfig = options.config.models?.providers?.openai;
  const baseUrl = remoteBaseUrl || providerConfig?.baseUrl?.trim() || DEFAULT_OPENAI_BASE_URL;
  const headerOverrides = Object.assign({}, providerConfig?.headers, remote?.headers);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...headerOverrides,
  };
  const model = normalizeOpenAiModel(options.model);
  return { baseUrl, headers, model };
}
