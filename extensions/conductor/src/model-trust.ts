// model-trust.ts — the data-egress trust guard for multi-lab orchestration.
//
// WHY THIS EXISTS (gap #1, security-first):
// The fleet can already reach multiple labs (Anthropic via the Claude Max proxy,
// Google Gemini, Alibaba Qwen, GitHub/OpenAI Copilot). The moment a task is routed
// to >1 vendor, the prompt's contents EGRESS to every one of them. Nothing in the
// tree stops a prompt carrying secrets / financial / identity data from silently
// leaving to a lab we don't trust with it. This module is the bright-line gate that
// converts the COO hard-rule ("sensitive financial/identity data -> ask first") into
// an enforced invariant: sensitive data may only egress to explicitly-allowed vendors,
// and secrets never egress to any model at all.
//
// Pure + offline by design (no I/O, no network) so it is trivially testable and can
// sit on the hot path of every routed call without latency.

// "local" = a model served on-machine (lmstudio / ollama / vllm …). Data never
// leaves the host, so it is the SAFEST destination for sensitive content.
export type Vendor = "local" | "anthropic" | "google" | "alibaba" | "openai" | "github" | "unknown";

// Ordered most→least damaging. A single span can trip multiple classes.
export type SensitivityClass = "secret" | "financial" | "identity" | "pii";

export interface Detection {
  class: SensitivityClass;
  label: string; // human-readable kind, e.g. "AWS access key"
  sample: string; // short, already-masked evidence (never the raw secret)
}

export interface TrustPolicy {
  // sensitivity class -> vendors permitted to receive that class.
  // Empty array = block for ALL vendors (used for secrets).
  allow: Record<SensitivityClass, Vendor[]>;
}

// Conservative default: sensitive data stays with our primary trusted vendor
// (Anthropic, the model we run on), secrets go nowhere. Loosen per-deployment
// via config — never tighten by accident.
export const DEFAULT_POLICY: TrustPolicy = {
  allow: {
    secret: [], // a secret in a prompt is a leak regardless of destination — block everywhere
    financial: ["local", "anthropic"],
    identity: ["local", "anthropic"],
    pii: ["local", "anthropic"],
  },
};

// Map a `provider/model` key (or a bare model id) to its owning lab. Unknown is
// treated as untrusted by construction: it appears in no allow-list, so any
// sensitive content routed to an unrecognized model is blocked.
// Local runtimes (the provider segment, before the "/"). A model served here stays
// on-machine — checked FIRST so a locally-served "qwen"/"gemma" is treated as local
// (no egress), not as its originating cloud lab.
const LOCAL_RUNTIME = /^(?:lmstudio|lm-studio|ollama|local|vllm|llamacpp|llama-cpp|mlx)\b/;

export function resolveVendor(modelKey: string): Vendor {
  const k = (modelKey || "").toLowerCase();
  if (LOCAL_RUNTIME.test(k.split("/")[0] ?? "")) return "local";
  if (/anthropic|claude/.test(k)) return "anthropic";
  if (/gemini|antigravity|google|code[-_ ]?assist/.test(k)) return "google";
  if (/qwen|alibaba|dashscope/.test(k)) return "alibaba";
  if (/copilot|github/.test(k)) return "github";
  if (/openai|codex|gpt[-_ ]?\d|\bo[134]\b/.test(k)) return "openai";
  return "unknown";
}

// --- detectors -------------------------------------------------------------
// Each detector is intentionally high-precision (favour false-negatives over
// crying wolf) EXCEPT for secrets, where we favour catching them.

function mask(s: string): string {
  if (s.length <= 8) return "*".repeat(s.length);
  return `${s.slice(0, 3)}…${s.slice(-2)}`;
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

const SECRET_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { label: "private key block", re: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g },
  { label: "OpenAI/Anthropic-style API key", re: /\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}\b/g },
  { label: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { label: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { label: "Google API key", re: /\bAIza[0-9A-Za-z_-]{20,}\b/g },
  { label: "JWT", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { label: "inline password/secret assignment", re: /\b(?:password|passwd|secret|api[_-]?key|token)\b\s*[:=]\s*\S{6,}/gi },
];

function detectSecrets(text: string): Detection[] {
  const out: Detection[] = [];
  for (const { label, re } of SECRET_PATTERNS) {
    for (const m of text.matchAll(re)) out.push({ class: "secret", label, sample: mask(m[0]) });
  }
  return out;
}

function detectFinancial(text: string): Detection[] {
  const out: Detection[] = [];
  // Credit-card-like: 13-19 digits with optional space/dash separators, Luhn-valid.
  for (const m of text.matchAll(/\b(?:\d[ -]?){12,18}\d\b/g)) {
    const digits = m[0].replace(/[^\d]/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      out.push({ class: "financial", label: "payment card number", sample: mask(digits) });
    }
  }
  // IBAN.
  for (const m of text.matchAll(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g)) {
    out.push({ class: "financial", label: "IBAN", sample: mask(m[0]) });
  }
  // Bank routing/account framed by an explicit label (avoids flagging any number).
  for (const m of text.matchAll(/\b(?:routing|account|acct)\s*(?:number|no\.?|#)?\s*[:#]?\s*\d{6,17}\b/gi)) {
    out.push({ class: "financial", label: "bank account/routing number", sample: mask(m[0]) });
  }
  return out;
}

function detectIdentity(text: string): Detection[] {
  const out: Detection[] = [];
  // US SSN.
  for (const m of text.matchAll(/\b\d{3}-\d{2}-\d{4}\b/g)) {
    out.push({ class: "identity", label: "US SSN", sample: mask(m[0].replace(/-/g, "")) });
  }
  // Passport / DOB only when explicitly labelled (otherwise far too noisy).
  for (const m of text.matchAll(/\bpassport\s*(?:number|no\.?|#)?\s*[:#]?\s*[A-Z0-9]{6,9}\b/gi)) {
    out.push({ class: "identity", label: "passport number", sample: mask(m[0]) });
  }
  for (const m of text.matchAll(/\b(?:dob|date of birth|born)\b[^\n]{0,12}\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:19|20)\d\d\b/gi)) {
    out.push({ class: "identity", label: "date of birth", sample: mask(m[0]) });
  }
  return out;
}

function detectPii(text: string): Detection[] {
  const out: Detection[] = [];
  for (const m of text.matchAll(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g)) {
    out.push({ class: "pii", label: "email address", sample: mask(m[0]) });
  }
  for (const m of text.matchAll(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g)) {
    out.push({ class: "pii", label: "phone number", sample: mask(m[0].replace(/\D/g, "")) });
  }
  return out;
}

// Classify a piece of content into every sensitivity class it trips.
export function classify(content: string): Detection[] {
  const text = content ?? "";
  return [...detectSecrets(text), ...detectFinancial(text), ...detectIdentity(text), ...detectPii(text)];
}

export interface EgressViolation {
  class: SensitivityClass;
  label: string;
  vendor: Vendor;
  reason: string;
}

export interface EgressDecision {
  allowed: boolean;
  vendor: Vendor;
  modelKey: string;
  detections: Detection[];
  violations: EgressViolation[];
}

// The core check: may `content` be sent to `modelKey` under `policy`?
export function checkEgress(content: string, modelKey: string, policy: TrustPolicy = DEFAULT_POLICY): EgressDecision {
  const vendor = resolveVendor(modelKey);
  const detections = classify(content);
  const violations: EgressViolation[] = [];
  const seen = new Set<SensitivityClass>();
  for (const d of detections) {
    if (seen.has(d.class)) continue; // one violation per class is enough to block
    const allowed = policy.allow[d.class] ?? [];
    if (!allowed.includes(vendor)) {
      seen.add(d.class);
      violations.push({
        class: d.class,
        label: d.label,
        vendor,
        reason: `${d.class} content may not egress to '${vendor}' (allowed: ${allowed.length ? allowed.join(", ") : "none"})`,
      });
    }
  }
  return { allowed: violations.length === 0, vendor, modelKey, detections, violations };
}

export class EgressBlockedError extends Error {
  readonly decision: EgressDecision;
  constructor(decision: EgressDecision) {
    super(
      `egress blocked: routing to '${decision.modelKey}' (${decision.vendor}) would leak ` +
        decision.violations.map((v) => v.class).join(", "),
    );
    this.name = "EgressBlockedError";
    this.decision = decision;
  }
}

// Hot-path assertion: throws EgressBlockedError if the route is unsafe, else
// returns the (clean) decision for logging.
export function assertRoutable(content: string, modelKey: string, policy: TrustPolicy = DEFAULT_POLICY): EgressDecision {
  const decision = checkEgress(content, modelKey, policy);
  if (!decision.allowed) throw new EgressBlockedError(decision);
  return decision;
}

// Best-effort redaction so a caller can CHOOSE to send a scrubbed version rather
// than abort. Only secrets/pii are masked in place; financial/identity removal is
// lossy and left to the caller to decide.
export function redactSecrets(content: string): string {
  let out = content ?? "";
  for (const { label, re } of SECRET_PATTERNS) {
    out = out.replace(re, `[REDACTED:${label}]`);
  }
  return out;
}
