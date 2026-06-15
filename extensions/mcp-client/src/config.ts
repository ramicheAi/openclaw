// Configuration parsing for the MCP client plugin.
//
// Servers may be declared either as a map keyed by server name:
//   { servers: { linear: { transport: "http", url: "..." } } }
// or as an array of objects each carrying a `name`:
//   { servers: [{ name: "linear", transport: "http", url: "..." }] }
//
// Parsing is intentionally defensive: a malformed server entry is skipped with
// an error string rather than throwing, so one bad entry never breaks boot.

export type McpTransport = "stdio" | "http" | "sse";

export type McpServerConfig = {
  name: string;
  transport: McpTransport;
  enabled: boolean;
  // stdio transport
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  // http / sse transport
  url?: string;
  headers?: Record<string, string>;
  // per-server tool filtering (applied to the discovered tool list)
  includeTools?: string[];
  excludeTools?: string[];
};

export type McpClientConfig = {
  servers: McpServerConfig[];
  toolTimeoutMs: number;
  connectTimeoutMs: number;
  toolPrefix: string;
};

export type ParsedMcpConfig = { config: McpClientConfig; errors: string[] };

export const DEFAULT_TOOL_TIMEOUT_MS = 60_000;
export const DEFAULT_CONNECT_TIMEOUT_MS = 20_000;
export const DEFAULT_TOOL_PREFIX = "mcp";

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && x.length > 0);
  return out.length ? out : undefined;
}

function asStringRecord(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string") out[k] = val;
    else if (typeof val === "number" || typeof val === "boolean") out[k] = String(val);
  }
  return Object.keys(out).length ? out : undefined;
}

function clampNumber(v: unknown, dflt: number, min: number, max: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : dflt;
  return Math.min(max, Math.max(min, n));
}

function parseTransport(raw: unknown, hasCommand: boolean, hasUrl: boolean): McpTransport | undefined {
  const t = asString(raw)?.toLowerCase();
  if (t === "stdio" || t === "http" || t === "sse") return t;
  if (t === "streamable-http" || t === "streamablehttp" || t === "http-stream") return "http";
  if (!t) {
    if (hasCommand) return "stdio";
    if (hasUrl) return "http";
  }
  return undefined;
}

/** Sanitize a name segment to satisfy provider tool-name constraints (^[A-Za-z0-9_-]+$). */
export function sanitizeNameSegment(input: string): string {
  return input
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "");
}

export function fnv1aShort(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36).slice(0, 8);
}

/**
 * Build the namespaced agent-facing tool name: `<prefix>__<server>__<tool>`,
 * capped at 128 chars (Anthropic limit) with a stable hash suffix on overflow.
 */
export function mcpToolName(prefix: string, server: string, tool: string): string {
  const p = sanitizeNameSegment(prefix) || DEFAULT_TOOL_PREFIX;
  const s = sanitizeNameSegment(server);
  const t = sanitizeNameSegment(tool) || "tool";
  let name = `${p}__${s}__${t}`;
  if (name.length > 128) {
    const head = `${p}__${s}__`;
    const room = Math.max(4, 128 - head.length - 9);
    name = `${head}${t.slice(0, room)}_${fnv1aShort(tool)}`;
    if (name.length > 128) name = name.slice(0, 128);
  }
  return name;
}

export function parseMcpClientConfig(raw: unknown): ParsedMcpConfig {
  const errors: string[] = [];
  const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const toolTimeoutMs = clampNumber(root.toolTimeoutMs, DEFAULT_TOOL_TIMEOUT_MS, 1_000, 600_000);
  const connectTimeoutMs = clampNumber(root.connectTimeoutMs, DEFAULT_CONNECT_TIMEOUT_MS, 1_000, 120_000);
  const toolPrefix = sanitizeNameSegment(asString(root.toolPrefix) ?? DEFAULT_TOOL_PREFIX) || DEFAULT_TOOL_PREFIX;

  const entries: Array<[string, unknown]> = [];
  const rawServers = root.servers;
  if (Array.isArray(rawServers)) {
    for (const item of rawServers) {
      const name = asString((item as Record<string, unknown> | undefined)?.name);
      if (!name) {
        errors.push("server entry missing 'name'");
        continue;
      }
      entries.push([name, item]);
    }
  } else if (rawServers && typeof rawServers === "object") {
    for (const [name, def] of Object.entries(rawServers as Record<string, unknown>)) {
      entries.push([name, def]);
    }
  }

  const servers: McpServerConfig[] = [];
  const seen = new Set<string>();
  for (const [rawName, defRaw] of entries) {
    const def = (defRaw && typeof defRaw === "object" ? defRaw : {}) as Record<string, unknown>;
    const name = sanitizeNameSegment(rawName);
    if (!name) {
      errors.push(`invalid server name: ${JSON.stringify(rawName)}`);
      continue;
    }
    if (seen.has(name)) {
      errors.push(`duplicate server name: ${name}`);
      continue;
    }

    const command = asString(def.command);
    const url = asString(def.url);
    const transport = parseTransport(def.transport, !!command, !!url);
    if (!transport) {
      errors.push(`server '${name}': set transport to stdio | http | sse`);
      continue;
    }

    if (transport === "stdio" && !command) {
      errors.push(`server '${name}': stdio transport requires 'command'`);
      continue;
    }
    if (transport !== "stdio") {
      if (!url) {
        errors.push(`server '${name}': ${transport} transport requires 'url'`);
        continue;
      }
      try {
        new URL(url);
      } catch {
        errors.push(`server '${name}': invalid url ${JSON.stringify(url)}`);
        continue;
      }
    }

    servers.push({
      name,
      transport,
      enabled: def.enabled === undefined ? true : def.enabled !== false,
      command,
      args: asStringArray(def.args),
      env: asStringRecord(def.env),
      cwd: asString(def.cwd),
      url,
      headers: asStringRecord(def.headers),
      includeTools: asStringArray(def.includeTools),
      excludeTools: asStringArray(def.excludeTools),
    });
    seen.add(name);
  }

  return { config: { servers, toolTimeoutMs, connectTimeoutMs, toolPrefix }, errors };
}
