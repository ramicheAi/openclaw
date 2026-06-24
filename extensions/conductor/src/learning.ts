import fs from "node:fs/promises";
import path from "node:path";

// learning.ts — Phase 6: the learning loop (the part that compounds).
//
// After each run, record which MODE won for which TASK-KIND, and bias future routing
// toward the proven winner — while still occasionally sampling others so an improved
// setup gets re-discovered. Distil a one-line lesson on weak runs and inject known
// failure modes into future prompts, so the system stops REPEATING mistakes, not just
// re-picking modes. Pure logic + an injectable store, so it is fully testable offline.

export type TaskKind = "code" | "writing" | "analysis" | "factual" | "other";

// Coarse, deterministic task classification (keyword-based) — the key future routing
// is keyed on.
export function taskKind(task: string): TaskKind {
  const t = (task ?? "").toLowerCase();
  if (/\b(code|function|bug|refactor|implement|compile|debug|class|async|regex|typescript|python|api endpoint)\b/.test(t)) return "code";
  if (/\b(write|draft|copy|essay|blog|email|tweet|post|story|headline|caption|script)\b/.test(t)) return "writing";
  if (/\b(fact|cite|citation|source|statistic|how many|what year|release date|price of)\b/.test(t)) return "factual";
  if (/\b(analy|compare|evaluate|assess|strateg|tradeoff|pros and cons|root cause|critique)\b/.test(t)) return "analysis";
  return "other";
}

export interface KindStat {
  runs: number;
  clean: number; // runs that passed the floor + evidence + egress checks
  modeWins: Record<string, number>; // mode -> # of clean runs
}

export interface LearningState {
  byKind: Record<string, KindStat>;
  lessons: Record<string, string[]>; // kind -> distilled failure lessons
}

export function emptyState(): LearningState {
  return { byKind: {}, lessons: {} };
}

function cloneState(s: LearningState): LearningState {
  return { byKind: structuredClone(s.byKind), lessons: structuredClone(s.lessons) };
}

const MIN_RUNS_TO_TRUST = 3;
const MAX_LESSONS_PER_KIND = 8;

// Record a run's outcome. A "clean" run (passed all quality gates) credits its mode.
export function recordRun(state: LearningState, run: { kind: TaskKind; mode: string; success: boolean }): LearningState {
  const next = cloneState(state);
  const stat = (next.byKind[run.kind] ??= { runs: 0, clean: 0, modeWins: {} });
  stat.runs += 1;
  if (run.success) {
    stat.clean += 1;
    stat.modeWins[run.mode] = (stat.modeWins[run.mode] ?? 0) + 1;
  }
  return next;
}

// The mode that has won most for this kind — once we have enough runs to trust it.
export function bestModeFor(state: LearningState, kind: TaskKind): string | null {
  const stat = state.byKind[kind];
  if (!stat || stat.runs < MIN_RUNS_TO_TRUST) return null;
  let best: string | null = null;
  let bestWins = 0;
  for (const [mode, wins] of Object.entries(stat.modeWins)) {
    if (wins > bestWins) {
      best = mode;
      bestWins = wins;
    }
  }
  return best;
}

export function addLesson(state: LearningState, kind: TaskKind, lesson: string): LearningState {
  const next = cloneState(state);
  const arr = (next.lessons[kind] ??= []);
  const clean = lesson.trim();
  if (clean && !arr.includes(clean)) {
    arr.push(clean);
    if (arr.length > MAX_LESSONS_PER_KIND) arr.shift(); // keep the most recent
  }
  return next;
}

export function lessonsFor(state: LearningState, kind: TaskKind): string[] {
  return state.lessons[kind] ?? [];
}

// Prepend known failure modes for this kind so future runs don't repeat them.
export function injectLessons(prompt: string, state: LearningState, kind: TaskKind): string {
  const ls = lessonsFor(state, kind);
  if (!ls.length) return prompt;
  return `Known failure modes for ${kind} tasks — avoid repeating these:\n${ls.map((l) => `- ${l}`).join("\n")}\n\n${prompt}`;
}

// --- stores ---------------------------------------------------------------

export interface LearningStore {
  load(): Promise<LearningState>;
  save(state: LearningState): Promise<void>;
}

// In-memory store (tests, ephemeral runs).
export function memoryStore(initial: LearningState = emptyState()): LearningStore {
  let state = cloneState(initial);
  return {
    load: async () => cloneState(state),
    save: async (s) => {
      state = cloneState(s);
    },
  };
}

// File-backed store (persists routing memory + lessons across gateway restarts).
export function fileStore(filePath: string): LearningStore {
  return {
    load: async () => {
      try {
        return JSON.parse(await fs.readFile(filePath, "utf8")) as LearningState;
      } catch {
        return emptyState();
      }
    },
    save: async (s) => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(s, null, 2));
    },
  };
}
