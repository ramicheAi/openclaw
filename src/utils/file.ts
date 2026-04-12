import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveOAuthDir } from "../config/paths.js";
import { logVerbose, shouldLogVerbose } from "../globals.js";
import { normalizeE164 } from "./string.js";

export async function ensureDir(dir: string) {
  await fs.promises.mkdir(dir, { recursive: true });
}

export function resolveUserPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~")) {
    const expanded = trimmed.replace(/^~(?=$|[\\/])/, os.homedir());
    return path.resolve(expanded);
  }
  return path.resolve(trimmed);
}

export function resolveConfigDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const override = env.OPENCLAW_STATE_DIR?.trim() || env.CLAWDBOT_STATE_DIR?.trim();
  if (override) return resolveUserPath(override);
  const newDir = path.join(homedir(), ".openclaw");
  try {
    const hasNew = fs.existsSync(newDir);
    if (hasNew) return newDir;
  } catch {
    // best-effort
  }
  return newDir;
}

// Configuration root; can be overridden via OPENCLAW_STATE_DIR.
export const CONFIG_DIR = resolveConfigDir();

export function resolveHomeDir(): string | undefined {
  const envHome = process.env.HOME?.trim();
  if (envHome) return envHome;
  const envProfile = process.env.USERPROFILE?.trim();
  if (envProfile) return envProfile;
  try {
    const home = os.homedir();
    return home?.trim() ? home : undefined;
  } catch {
    return undefined;
  }
}

export function shortenHomePath(input: string): string {
  if (!input) return input;
  const home = resolveHomeDir();
  if (!home) return input;
  if (input === home) return "~";
  if (input.startsWith(`${home}/`)) return `~${input.slice(home.length)}`;
  return input;
}

export function shortenHomeInString(input: string): string {
  if (!input) return input;
  const home = resolveHomeDir();
  if (!home) return input;
  return input.split(home).join("~");
}

export function displayPath(input: string): string {
  return shortenHomePath(input);
}

export function displayString(input: string): string {
  return shortenHomeInString(input);
}

export type JidToE164Options = {
  authDir?: string;
  lidMappingDirs?: string[];
  logMissing?: boolean;
};

type LidLookup = {
  getPNForLID?: (jid: string) => Promise<string | null>;
};

function resolveLidMappingDirs(opts?: JidToE164Options): string[] {
  const dirs = new Set<string>();
  const addDir = (dir?: string | null) => {
    if (!dir) return;
    dirs.add(resolveUserPath(dir));
  };
  addDir(opts?.authDir);
  for (const dir of opts?.lidMappingDirs ?? []) addDir(dir);
  addDir(resolveOAuthDir());
  addDir(path.join(CONFIG_DIR, "credentials"));
  return [...dirs];
}

function readLidReverseMapping(lid: string, opts?: JidToE164Options): string | null {
  const mappingFilename = `lid-mapping-${lid}_reverse.json`;
  const mappingDirs = resolveLidMappingDirs(opts);
  for (const dir of mappingDirs) {
    const mappingPath = path.join(dir, mappingFilename);
    try {
      const data = fs.readFileSync(mappingPath, "utf8");
      const phone = JSON.parse(data) as string | number | null;
      if (phone === null || phone === undefined) continue;
      return normalizeE164(String(phone));
    } catch {
      // Try the next location.
    }
  }
  return null;
}

export function jidToE164(jid: string, opts?: JidToE164Options): string | null {
  // Convert a WhatsApp JID (with optional device suffix, e.g. 1234:1@s.whatsapp.net) back to +1234.
  const match = jid.match(/^(\d+)(?::\d+)?@(s\.whatsapp\.net|hosted)$/);
  if (match) {
    const digits = match[1];
    return `+${digits}`;
  }

  // Support @lid format (WhatsApp Linked ID) - look up reverse mapping
  const lidMatch = jid.match(/^(\d+)(?::\d+)?@(lid|hosted\.lid)$/);
  if (lidMatch) {
    const lid = lidMatch[1];
    const phone = readLidReverseMapping(lid, opts);
    if (phone) return phone;
    const shouldLog = opts?.logMissing ?? shouldLogVerbose();
    if (shouldLog) {
      logVerbose(`LID mapping not found for ${lid}; skipping inbound message`);
    }
  }

  return null;
}

export async function resolveJidToE164(
  jid: string | null | undefined,
  opts?: JidToE164Options & { lidLookup?: LidLookup },
): Promise<string | null> {
  if (!jid) return null;
  const direct = jidToE164(jid, opts);
  if (direct) return direct;
  if (!/(@lid|@hosted\.lid)$/.test(jid)) return null;
  if (!opts?.lidLookup?.getPNForLID) return null;
  try {
    const pnJid = await opts.lidLookup.getPNForLID(jid);
    if (!pnJid) return null;
    return jidToE164(pnJid, opts);
  } catch (err) {
    if (shouldLogVerbose()) {
      logVerbose(`LID mapping lookup failed for ${jid}: ${String(err)}`);
    }
    return null;
  }
}
