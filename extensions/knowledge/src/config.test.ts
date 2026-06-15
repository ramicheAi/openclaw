import { describe, expect, it } from "vitest";

import {
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_CHUNK_TOKENS,
  DEFAULT_COLLECTION,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_TOP_K,
  parseKnowledgeConfig,
  sanitizeCollectionName,
} from "./config.js";

describe("parseKnowledgeConfig", () => {
  it("applies defaults for empty input", () => {
    const { config } = parseKnowledgeConfig({});
    expect(config.defaultCollection).toBe(DEFAULT_COLLECTION);
    expect(config.embeddingModel).toBe(DEFAULT_EMBEDDING_MODEL);
    expect(config.chunkTokens).toBe(DEFAULT_CHUNK_TOKENS);
    expect(config.chunkOverlap).toBe(DEFAULT_CHUNK_OVERLAP);
    expect(config.topK).toBe(DEFAULT_TOP_K);
    expect(config.apiKeyEnv).toBe("OPENAI_API_KEY");
  });

  it("honors provided values", () => {
    const { config } = parseKnowledgeConfig({
      defaultCollection: "docs",
      embeddingModel: "text-embedding-3-large",
      chunkTokens: 256,
      chunkOverlap: 32,
      topK: 10,
      apiKeyEnv: "MY_KEY",
    });
    expect(config.defaultCollection).toBe("docs");
    expect(config.embeddingModel).toBe("text-embedding-3-large");
    expect(config.chunkTokens).toBe(256);
    expect(config.chunkOverlap).toBe(32);
    expect(config.topK).toBe(10);
    expect(config.apiKeyEnv).toBe("MY_KEY");
  });

  it("clamps out-of-range numeric values", () => {
    const low = parseKnowledgeConfig({ chunkTokens: 1, topK: 0, chunkOverlap: -5 }).config;
    expect(low.chunkTokens).toBe(50);
    expect(low.topK).toBe(1);
    expect(low.chunkOverlap).toBe(0);

    const high = parseKnowledgeConfig({ chunkTokens: 999_999, topK: 9999 }).config;
    expect(high.chunkTokens).toBe(4000);
    expect(high.topK).toBe(50);
  });

  it("keeps overlap strictly below chunk size", () => {
    const { config } = parseKnowledgeConfig({ chunkTokens: 100, chunkOverlap: 500 });
    expect(config.chunkOverlap).toBeLessThan(config.chunkTokens);
    expect(config.chunkOverlap).toBe(90);
  });

  it("tolerates non-object / junk input without throwing", () => {
    expect(parseKnowledgeConfig(undefined).config.defaultCollection).toBe(DEFAULT_COLLECTION);
    expect(parseKnowledgeConfig("nope").config.topK).toBe(DEFAULT_TOP_K);
    expect(parseKnowledgeConfig(42).config.chunkTokens).toBe(DEFAULT_CHUNK_TOKENS);
    expect(parseKnowledgeConfig(null).config.embeddingModel).toBe(DEFAULT_EMBEDDING_MODEL);
  });

  it("sanitizes a messy defaultCollection and reports it", () => {
    const { config, errors } = parseKnowledgeConfig({ defaultCollection: "My Docs!!" });
    expect(config.defaultCollection).toBe("my-docs");
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("sanitizeCollectionName", () => {
  it("lowercases and replaces unsafe characters", () => {
    expect(sanitizeCollectionName("Hello World")).toBe("hello-world");
    expect(sanitizeCollectionName("a/b\\c:d")).toBe("a-b-c-d");
    expect(sanitizeCollectionName("--Trim__")).toBe("trim");
  });

  it("collapses repeated dash separators from unsafe runs", () => {
    expect(sanitizeCollectionName("a   b")).toBe("a-b");
    expect(sanitizeCollectionName("a***b")).toBe("a-b");
  });

  it("falls back to the default for empty or garbage input", () => {
    expect(sanitizeCollectionName("")).toBe(DEFAULT_COLLECTION);
    expect(sanitizeCollectionName("!!!")).toBe(DEFAULT_COLLECTION);
    expect(sanitizeCollectionName(undefined)).toBe(DEFAULT_COLLECTION);
    expect(sanitizeCollectionName(123)).toBe(DEFAULT_COLLECTION);
  });
});
