/**
 * Knowledge graph extractor for OpenClaw. Outputs graphify-out/graph.json.
 * Run: pnpm exec tsx scripts/graphify.ts [OPENCLAW_RUNTIME_DIR]
 * Default runtime: ~/.openclaw
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(REPO_ROOT, "graphify-out");
const OUT_FILE = path.join(OUT_DIR, "graph.json");
const HOME = process.env.HOME ?? "";
const DEFAULT_RUNTIME = path.join(HOME, ".openclaw");

type Confidence = "high" | "medium" | "low";

type GraphEntity = {
  id: string;
  kind: string;
  label: string;
  confidence: Confidence;
  path?: string;
  meta?: Record<string, unknown>;
};

type GraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: string;
  confidence: Confidence;
  meta?: Record<string, unknown>;
};

const entities = new Map<string, GraphEntity>();
const edges: GraphEdge[] = [];
let edgeSeq = 0;

function addEntity(e: GraphEntity) {
  if (!entities.has(e.id)) entities.set(e.id, e);
}

function addEdge(
  source: string,
  target: string,
  kind: string,
  confidence: Confidence,
  meta?: Record<string, unknown>,
) {
  edges.push({
    id: `e:${++edgeSeq}`,
    source,
    target,
    kind,
    confidence,
    meta,
  });
}

function relPath(abs: string): string {
  return path.relative(REPO_ROOT, abs).split(path.sep).join("/");
}

function walkTsFiles(root: string, acc: string[]) {
  if (!fs.existsSync(root)) return;
  const st = fs.statSync(root);
  if (st.isFile()) {
    if (root.endsWith(".ts") && !root.endsWith(".d.ts")) acc.push(root);
    return;
  }
  for (const name of fs.readdirSync(root)) {
    if (name === "node_modules" || name === "dist" || name === ".git") continue;
    walkTsFiles(path.join(root, name), acc);
  }
}

function resolveImportPath(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".") && !spec.startsWith("/")) return null;
  const dir = path.dirname(fromFile);
  let base = spec;
  if (base.endsWith(".js")) {
    base = base.slice(0, -3);
  }
  const resolved = path.normalize(path.join(dir, base));
  const candidates = [
    `${resolved}.ts`,
    `${resolved}.tsx`,
    path.join(resolved, "index.ts"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && c.startsWith(REPO_ROOT)) return c;
  }
  return null;
}

function visitAst(
  sourceFile: ts.SourceFile,
  moduleId: string,
  filePath: string,
) {
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      const resolved = resolveImportPath(filePath, spec);
      if (resolved) {
        const tid = `mod:${relPath(resolved)}`;
        addEntity({
          id: tid,
          kind: "module",
          label: path.basename(resolved),
          path: relPath(resolved),
          confidence: "high",
        });
        addEdge(moduleId, tid, "imports", "high", { specifier: spec });
      } else if (!spec.startsWith(".")) {
        const pkg = spec.startsWith("@")
          ? spec.split("/").slice(0, 2).join("/")
          : spec.split("/")[0] ?? spec;
        const pid = `pkg:${pkg}`;
        addEntity({
          id: pid,
          kind: "npm_package",
          label: pkg,
          confidence: "high",
          meta: { specifier: spec },
        });
        addEdge(moduleId, pid, "imports_package", "high", { specifier: spec });
      }
    }

    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      const resolved = resolveImportPath(filePath, spec);
      if (resolved) {
        const tid = `mod:${relPath(resolved)}`;
        addEntity({
          id: tid,
          kind: "module",
          label: path.basename(resolved),
          path: relPath(resolved),
          confidence: "high",
        });
        addEdge(moduleId, tid, "reexports_from", "medium", { specifier: spec });
      }
    }

    const declName = (d: ts.DeclarationName | undefined): string | null => {
      if (!d) return null;
      if (ts.isIdentifier(d)) return d.text;
      if (ts.isStringLiteral(d)) return d.text;
      return null;
    };

    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      const sid = `fn:${relPath(filePath)}:${name}`;
      addEntity({
        id: sid,
        kind: "function",
        label: name,
        path: relPath(filePath),
        confidence: "high",
        meta: { exported: Boolean(node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) },
      });
      addEdge(moduleId, sid, "declares", "high");
    }

    if (ts.isClassDeclaration(node) && node.name) {
      const name = node.name.text;
      const cid = `class:${relPath(filePath)}:${name}`;
      addEntity({
        id: cid,
        kind: "class",
        label: name,
        path: relPath(filePath),
        confidence: "high",
        meta: { exported: Boolean(node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) },
      });
      addEdge(moduleId, cid, "declares", "high");
      for (const h of node.heritageClauses ?? []) {
        for (const t of h.types) {
          const tn = t.expression.getText(sourceFile);
          const tid = `type_ref:${relPath(filePath)}:${tn}`;
          addEntity({ id: tid, kind: "type_reference", label: tn, path: relPath(filePath), confidence: "low" });
          addEdge(
            cid,
            tid,
            h.token === ts.SyntaxKind.ExtendsKeyword ? "extends" : "implements",
            "low",
          );
        }
      }
    }

    if (ts.isInterfaceDeclaration(node)) {
      const name = node.name.text;
      const iid = `interface:${relPath(filePath)}:${name}`;
      addEntity({
        id: iid,
        kind: "interface",
        label: name,
        path: relPath(filePath),
        confidence: "high",
        meta: { exported: Boolean(node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) },
      });
      addEdge(moduleId, iid, "declares", "high");
    }

    if (ts.isTypeAliasDeclaration(node)) {
      const name = node.name.text;
      const tid = `type:${relPath(filePath)}:${name}`;
      addEntity({
        id: tid,
        kind: "type_alias",
        label: name,
        path: relPath(filePath),
        confidence: "high",
        meta: { exported: Boolean(node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) },
      });
      addEdge(moduleId, tid, "declares", "high");
    }

    if (ts.isEnumDeclaration(node)) {
      const name = node.name.text;
      const eid = `enum:${relPath(filePath)}:${name}`;
      addEntity({
        id: eid,
        kind: "enum",
        label: name,
        path: relPath(filePath),
        confidence: "high",
        meta: { exported: Boolean(node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) },
      });
      addEdge(moduleId, eid, "declares", "high");
    }

    if (ts.isModuleDeclaration(node) && node.name && ts.isStringLiteral(node.name)) {
      const mid = `namespace:${relPath(filePath)}:${node.name.text}`;
      addEntity({
        id: mid,
        kind: "namespace",
        label: node.name.text,
        path: relPath(filePath),
        confidence: "medium",
      });
      addEdge(moduleId, mid, "declares", "medium");
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function parseSimpleFrontmatter(content: string): Record<string, string> {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

function scanSkillDirs(
  label: "bundled" | "user_workspace",
  rootDir: string,
  opts?: { runtimeRoot?: string },
) {
  const hubId = `skill_hub:${label}`;
  const pathHint =
    label === "bundled"
      ? relPath(rootDir)
      : path
          .join(path.basename(opts?.runtimeRoot ?? ".openclaw"), "workspace/skills")
          .split(path.sep)
          .join("/");
  addEntity({
    id: hubId,
    kind: "skill_hub",
    label,
    path: pathHint,
    confidence: "high",
    meta: { absolute: rootDir },
  });

  if (!fs.existsSync(rootDir)) return;

  for (const name of fs.readdirSync(rootDir)) {
    const skillDir = path.join(rootDir, name);
    if (!fs.statSync(skillDir).isDirectory()) continue;
    const skillMd = path.join(skillDir, "SKILL.md");
    if (!fs.existsSync(skillMd)) continue;
    const raw = fs.readFileSync(skillMd, "utf8");
    const fm = parseSimpleFrontmatter(raw);
    const skillName = fm.name?.trim() || name;
    const sid = `skill:${label}:${skillName}`;
    const pathLabel =
      label === "bundled"
        ? path.relative(REPO_ROOT, skillMd).split(path.sep).join("/")
        : path.join(pathHint, name, "SKILL.md").split(path.sep).join("/");
    addEntity({
      id: sid,
      kind: "skill_definition",
      label: skillName,
      path: pathLabel,
      confidence: "high",
      meta: {
        hub: label,
        dirname: name,
        description: fm.description,
        openclaw: fm.openclaw,
        absolutePath: skillMd,
      },
    });
    addEdge(hubId, sid, "contains", "high");
  }
}

function parseRegisterSubclis(filePath: string): { name: string; cliModule: string }[] {
  const content = fs.readFileSync(filePath, "utf8");
  const sf = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: { name: string; cliModule: string }[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(sf) === "entries" &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      for (const el of node.initializer.elements) {
        if (!ts.isObjectLiteralExpression(el)) continue;
        let name: string | undefined;
        let registerBody: ts.Block | undefined;
        for (const p of el.properties) {
          if (!ts.isPropertyAssignment(p)) continue;
          const pn = p.name.getText(sf);
          if (pn === "name" && ts.isStringLiteral(p.initializer)) name = p.initializer.text;
          if (pn === "register" && ts.isArrowFunction(p.initializer) && ts.isBlock(p.initializer.body)) {
            registerBody = p.initializer.body;
          }
        }
        if (!name || !registerBody) continue;
        const expected = `../${name}-cli.js`;
        let cliModule: string | undefined;
        const visitRegister = (n: ts.Node) => {
          if (
            ts.isVariableDeclaration(n) &&
            n.initializer &&
            ts.isAwaitExpression(n.initializer) &&
            ts.isCallExpression(n.initializer.expression)
          ) {
            const call = n.initializer.expression;
            const expr = call.expression;
            if (expr.kind === ts.SyntaxKind.ImportKeyword && call.arguments[0] && ts.isStringLiteral(call.arguments[0])) {
              const spec = call.arguments[0].text;
              if (spec === expected || (spec.startsWith("../") && spec.endsWith("-cli.js"))) {
                cliModule = spec;
              }
            }
          }
          ts.forEachChild(n, visitRegister);
        };
        visitRegister(registerBody);
        if (cliModule) {
          out.push({ name, cliModule: cliModule.replace(/\.js$/, ".ts") });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function parseCommandRegistryIds(filePath: string): string[] {
  const content = fs.readFileSync(filePath, "utf8");
  const sf = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const ids: string[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(sf) === "commandRegistry" &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      for (const el of node.initializer.elements) {
        if (!ts.isObjectLiteralExpression(el)) continue;
        for (const p of el.properties) {
          if (!ts.isPropertyAssignment(p)) continue;
          if (p.name.getText(sf) === "id" && ts.isStringLiteral(p.initializer)) {
            ids.push(p.initializer.text);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return ids;
}

function scanPackageJson() {
  const pjPath = path.join(REPO_ROOT, "package.json");
  const pj = JSON.parse(fs.readFileSync(pjPath, "utf8")) as {
    name?: string;
    bin?: Record<string, string>;
    exports?: Record<string, string>;
  };
  const rootId = "pkg:openclaw_root";
  addEntity({
    id: rootId,
    kind: "package_manifest",
    label: pj.name ?? "openclaw",
    path: "package.json",
    confidence: "high",
  });

  if (pj.bin) {
    for (const [cmd, p] of Object.entries(pj.bin)) {
      const cid = `cli_bin:${cmd}`;
      addEntity({ id: cid, kind: "cli_binary", label: cmd, confidence: "high", meta: { script: p } });
      addEdge(rootId, cid, "defines_bin", "high");
    }
  }

  if (pj.exports) {
    for (const [subpath, target] of Object.entries(pj.exports)) {
      if (typeof target !== "string") continue;
      const eid = `export:${subpath}`;
      addEntity({
        id: eid,
        kind: "npm_export",
        label: subpath,
        confidence: "high",
        meta: { target },
      });
      addEdge(rootId, eid, "exports", "high");
    }
  }
}

function parseStringArrayConst(sf: ts.SourceFile, constName: string): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(sf) === constName &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      for (const el of node.initializer.elements) {
        if (ts.isStringLiteral(el)) out.push(el.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function scanGatewaySurface() {
  const p = path.join(REPO_ROOT, "src/gateway/server-methods-list.ts");
  if (!fs.existsSync(p)) return;
  const content = fs.readFileSync(p, "utf8");
  const sf = ts.createSourceFile(p, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const mid = `mod:${relPath(p)}`;
  const methods = parseStringArrayConst(sf, "BASE_METHODS");
  for (const m of methods) {
    const eid = `gateway_rpc:${m}`;
    addEntity({
      id: eid,
      kind: "gateway_method",
      label: m,
      confidence: "high",
      meta: { surface: "listGatewayMethods", static: true },
    });
    addEdge(mid, eid, "declares_static_method", "high");
  }
  const events = parseStringArrayConst(sf, "GATEWAY_EVENTS");
  for (const ev of events) {
    const eid = `gateway_event:${ev}`;
    addEntity({
      id: eid,
      kind: "gateway_event",
      label: ev,
      confidence: "high",
      meta: { surface: "GATEWAY_EVENTS" },
    });
    addEdge(mid, eid, "declares_event", "high");
  }
}

function tagConfigModules() {
  const cid = "concept:openclaw_config";
  addEntity({
    id: cid,
    kind: "config_surface",
    label: "openclaw_config",
    confidence: "medium",
    meta: { description: "TypeScript modules under src/config" },
  });
  for (const e of entities.values()) {
    if (e.kind !== "module") continue;
    const p = e.path ?? "";
    if (p.startsWith("src/config/")) {
      addEdge(cid, e.id, "config_module", "high");
    }
  }
}

const SECRET_KEY_RE = /apikey|api_key|authorization|bearer|password|secret|token/i;

function redactDeep(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redactDeep);
  if (typeof value !== "object") return value;
  const o = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === "vars" && v !== null && typeof v === "object" && !Array.isArray(v)) {
      const vars = v as Record<string, unknown>;
      out[k] = Object.fromEntries(Object.keys(vars).map((name) => [name, "[REDACTED]"]));
      continue;
    }
    if (SECRET_KEY_RE.test(k)) {
      if (typeof v === "string" && v.length > 0) out[k] = "[REDACTED]";
      else out[k] = redactDeep(v);
      continue;
    }
    if ((k === "message" || k === "text") && typeof v === "string" && v.length > 160) {
      out[k] = { _redacted: "long_string", charCount: v.length };
      continue;
    }
    out[k] = redactDeep(v);
  }
  return out;
}

function collectPlistsInDir(dir: string, acc: string[]) {
  if (!fs.existsSync(dir)) return;
  try {
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith(".plist")) acc.push(path.join(dir, name));
    }
  } catch {
    /* ignore */
  }
}

function scanNpmScripts() {
  const pjPath = path.join(REPO_ROOT, "package.json");
  const pj = JSON.parse(fs.readFileSync(pjPath, "utf8")) as { scripts?: Record<string, string> };
  const hubId = "npm_scripts:package.json";
  addEntity({
    id: hubId,
    kind: "npm_script_hub",
    label: "package.json scripts",
    path: "package.json",
    confidence: "high",
  });
  addEdge("pkg:openclaw_root", hubId, "defines_scripts", "high");
  if (!pj.scripts) return;
  for (const [name, cmd] of Object.entries(pj.scripts)) {
    const sid = `npm_script:${name}`;
    addEntity({
      id: sid,
      kind: "npm_script",
      label: name,
      confidence: "high",
      meta: { command: cmd },
    });
    addEdge(hubId, sid, "script", "high");
  }
}

function scanOpenclawRuntime(runtimeRoot: string) {
  const rtId = "runtime:openclaw_home";
  let configEntityId: string | null = null;
  addEntity({
    id: rtId,
    kind: "openclaw_runtime",
    label: path.basename(runtimeRoot) || "openclaw",
    path: runtimeRoot.split(path.sep).join("/"),
    confidence: fs.existsSync(runtimeRoot) ? "high" : "low",
    meta: { scanned: fs.existsSync(runtimeRoot) },
  });

  if (!fs.existsSync(runtimeRoot)) return;

  const cfgPath = path.join(runtimeRoot, "openclaw.json");
  if (fs.existsSync(cfgPath)) {
    const raw = JSON.parse(fs.readFileSync(cfgPath, "utf8")) as Record<string, unknown>;
    const safe = redactDeep(raw) as Record<string, unknown>;
    const cfgEntity = "runtime_config:openclaw.json";
    configEntityId = cfgEntity;
    addEntity({
      id: cfgEntity,
      kind: "runtime_config",
      label: "openclaw.json",
      path: path.join(path.basename(runtimeRoot), "openclaw.json").split(path.sep).join("/"),
      confidence: "high",
      meta: {
        absolutePath: cfgPath,
        topLevelKeys: Object.keys(safe),
        summary: {
          meta: safe.meta,
          wizard: safe.wizard,
          diagnostics: safe.diagnostics,
          browser: safe.browser,
          hasEnvVars: Boolean((safe.env as { vars?: unknown })?.vars),
          agentListCount: Array.isArray((safe.agents as { list?: unknown })?.list)
            ? (safe.agents as { list: unknown[] }).list.length
            : 0,
          modelProviders: Object.keys(
            ((safe.models as { providers?: Record<string, unknown> })?.providers ?? {}) as object,
          ),
        },
      },
    });
    addEdge(rtId, cfgEntity, "contains", "high");

    const agentsBlock = safe.agents as
      | {
          list?: Array<{
            id?: string;
            name?: string;
            workspace?: string;
            model?: { primary?: string; fallbacks?: string[] };
            default?: boolean;
          }>;
        }
      | undefined;
    const list = agentsBlock?.list ?? [];
    for (const a of list) {
      if (!a?.id) continue;
      const aid = `configured_agent:${a.id}`;
      addEntity({
        id: aid,
        kind: "configured_agent",
        label: a.name ?? a.id,
        confidence: "high",
        meta: {
          agentId: a.id,
          displayName: a.name,
          defaultAgent: a.default === true,
          workspace: a.workspace,
          modelPrimary: a.model?.primary,
          modelFallbacks: a.model?.fallbacks,
        },
      });
      addEdge(cfgEntity, aid, "configures", "high");
      if (a.model?.primary) {
        const mid = `model_ref:${a.model.primary}`;
        addEntity({
          id: mid,
          kind: "model_ref",
          label: a.model.primary,
          confidence: "high",
        });
        addEdge(aid, mid, "primary_model", "high");
      }
      if (a.workspace && typeof a.workspace === "string") {
        const wid = `workspace_path:${a.workspace}`;
        addEntity({
          id: wid,
          kind: "agent_workspace",
          label: a.workspace,
          path: a.workspace.split(path.sep).join("/"),
          confidence: "high",
        });
        addEdge(aid, wid, "uses_workspace", "high");
      }
    }
  }

  const agentsDir = path.join(runtimeRoot, "agents");
  if (fs.existsSync(agentsDir)) {
    const adHub = "runtime_dir:agents";
    addEntity({
      id: adHub,
      kind: "runtime_agents_dir",
      label: "agents/",
      path: path.join(path.basename(runtimeRoot), "agents").split(path.sep).join("/"),
      confidence: "high",
      meta: { absolutePath: agentsDir },
    });
    addEdge(rtId, adHub, "contains", "high");

    for (const name of fs.readdirSync(agentsDir)) {
      const sub = path.join(agentsDir, name);
      if (!fs.statSync(sub).isDirectory()) continue;
      if (name.startsWith(".")) continue;
      const fsId = `fs_agent:${name}`;
      addEntity({
        id: fsId,
        kind: "filesystem_agent",
        label: name,
        path: path.join(path.basename(runtimeRoot), "agents", name).split(path.sep).join("/"),
        confidence: "high",
        meta: { absolutePath: sub },
      });
      addEdge(adHub, fsId, "entry", "high");

      const soul = path.join(sub, "SOUL.md");
      const agentsMd = path.join(sub, "AGENTS.md");
      const agentAgents = path.join(sub, "agent", "AGENTS.md");
      for (const [p, kind] of [
        [soul, "SOUL.md"],
        [agentsMd, "AGENTS.md"],
        [agentAgents, "agent/AGENTS.md"],
      ] as const) {
        if (!fs.existsSync(p)) continue;
        const pid = `persona_file:${path.relative(runtimeRoot, p).split(path.sep).join("/")}`;
        addEntity({
          id: pid,
          kind: "persona_file",
          label: kind,
          path: path.relative(runtimeRoot, p).split(path.sep).join("/"),
          confidence: "high",
          meta: { absolutePath: p },
        });
        addEdge(fsId, pid, "has_persona", "high");
      }

      const cfgAgentId = `configured_agent:${name}`;
      if (entities.has(cfgAgentId)) {
        addEdge(fsId, cfgAgentId, "same_id_as", "high");
      } else if (configEntityId) {
        addEdge(fsId, configEntityId, "filesystem_only_agent", "medium", {
          note: "agents/ entry not matched in agents.list",
        });
      }
    }
  }

  const jobsPath = path.join(runtimeRoot, "cron", "jobs.json");
  if (fs.existsSync(jobsPath)) {
    const doc = JSON.parse(fs.readFileSync(jobsPath, "utf8")) as {
      jobs?: Array<{
        id?: string;
        name?: string;
        agentId?: string;
        enabled?: boolean;
        schedule?: { kind?: string; expr?: string; tz?: string; at?: string };
        sessionTarget?: string;
        payload?: { kind?: string; model?: string };
      }>;
    };
    const cronHub = "runtime_cron:jobs.json";
    addEntity({
      id: cronHub,
      kind: "cron_store",
      label: "cron/jobs.json",
      path: path.join(path.basename(runtimeRoot), "cron", "jobs.json").split(path.sep).join("/"),
      confidence: "high",
      meta: { absolutePath: jobsPath, jobCount: doc.jobs?.length ?? 0 },
    });
    addEdge(rtId, cronHub, "contains", "high");

    for (const job of doc.jobs ?? []) {
      if (!job.id) continue;
      const safeJob = redactDeep(job) as Record<string, unknown>;
      const jid = `cron_job:${job.id}`;
      addEntity({
        id: jid,
        kind: "cron_job",
        label: job.name ?? job.id,
        confidence: "high",
        meta: {
          jobId: job.id,
          agentId: job.agentId,
          enabled: job.enabled,
          schedule: job.schedule,
          sessionTarget: job.sessionTarget,
          payloadKind: job.payload?.kind,
          cronModel: job.payload && "model" in job.payload ? (job.payload as { model?: string }).model : undefined,
          redacted: safeJob,
        },
      });
      addEdge(cronHub, jid, "job", "high");
      if (job.agentId) {
        const aid = `configured_agent:${job.agentId}`;
        if (entities.has(aid)) addEdge(jid, aid, "targets_agent", "high");
        else {
          const fsFallback = `fs_agent:${job.agentId}`;
          if (entities.has(fsFallback)) addEdge(jid, fsFallback, "targets_fs_agent", "medium");
          else addEdge(jid, rtId, "targets_unknown_agent", "low", { agentId: job.agentId });
        }
      }
      if (job.payload && "model" in job.payload && typeof (job.payload as { model?: string }).model === "string") {
        const m = (job.payload as { model: string }).model;
        const mid = `model_ref:${m}`;
        addEntity({ id: mid, kind: "model_ref", label: m, confidence: "high" });
        addEdge(jid, mid, "cron_uses_model", "medium");
      }
    }
  }

  const plists: string[] = [];
  collectPlistsInDir(runtimeRoot, plists);
  collectPlistsInDir(path.join(runtimeRoot, "workspace-triage"), plists);
  collectPlistsInDir(path.join(runtimeRoot, "workspace-triage", "scripts"), plists);
  for (const p of plists) {
    const rel = path.relative(runtimeRoot, p).split(path.sep).join("/");
    const pid = `launch_plist:${rel}`;
    addEntity({
      id: pid,
      kind: "launch_agent_plist",
      label: path.basename(p),
      path: rel,
      confidence: "medium",
      meta: { absolutePath: p },
    });
    addEdge(rtId, pid, "may_register_launchd", "medium");
  }
}

function wireSkillRoutingCode() {
  const workspaceTs = path.join(REPO_ROOT, "src/agents/skills/workspace.ts");
  const bundledTs = path.join(REPO_ROOT, "src/agents/skills/bundled-dir.ts");
  const modWs = `mod:src/agents/skills/workspace.ts`;
  const modBd = `mod:src/agents/skills/bundled-dir.ts`;

  addEntity({
    id: "routing:skill_load_pipeline",
    kind: "routing_concept",
    label: "skill_load_pipeline",
    confidence: "medium",
    meta: {
      sources: [
        "openclaw-bundled",
        "openclaw-extra",
        "openclaw-managed",
        "openclaw-workspace",
      ],
    },
  });
  if (fs.existsSync(workspaceTs)) {
    addEdge(modWs, "routing:skill_load_pipeline", "implements", "medium");
  }
  if (fs.existsSync(bundledTs)) {
    addEdge(modBd, "skill_hub:bundled", "resolves_path_for", "medium");
  }
  addEdge("routing:skill_load_pipeline", "skill_hub:bundled", "loads_from", "high");
  addEdge("routing:skill_load_pipeline", "skill_hub:user_workspace", "loads_from", "high");
}

function main() {
  const runtimeRootArg = process.argv[2];
  const RUNTIME_ROOT = runtimeRootArg ? path.resolve(runtimeRootArg) : DEFAULT_RUNTIME;

  const tsRoots: string[] = [];
  walkTsFiles(path.join(REPO_ROOT, "src"), tsRoots);
  walkTsFiles(path.join(REPO_ROOT, "scripts"), tsRoots);
  walkTsFiles(path.join(REPO_ROOT, "packages"), tsRoots);
  walkTsFiles(path.join(REPO_ROOT, "ui/src"), tsRoots);
  for (const ext of fs.readdirSync(path.join(REPO_ROOT, "extensions"))) {
    const extSrc = path.join(REPO_ROOT, "extensions", ext, "src");
    walkTsFiles(extSrc, tsRoots);
  }

  for (const filePath of tsRoots) {
    const content = fs.readFileSync(filePath, "utf8");
    const sf = ts.createSourceFile(
      relPath(filePath),
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const moduleId = `mod:${relPath(filePath)}`;
    addEntity({
      id: moduleId,
      kind: "module",
      label: path.basename(filePath),
      path: relPath(filePath),
      confidence: "high",
      meta: { isTest: filePath.includes(".test.ts") },
    });
    visitAst(sf, moduleId, filePath);
  }

  scanPackageJson();
  scanNpmScripts();

  const subclisPath = path.join(REPO_ROOT, "src/cli/program/register.subclis.ts");
  if (fs.existsSync(subclisPath)) {
    for (const { name, cliModule } of parseRegisterSubclis(subclisPath)) {
      const cid = `cli:${name}`;
      addEntity({
        id: cid,
        kind: "cli_command",
        label: name,
        confidence: "high",
        meta: { registration: "register.subclis.ts" },
      });
      const cliFile = path.join(REPO_ROOT, "src/cli", path.basename(cliModule));
      if (fs.existsSync(cliFile)) {
        const mid = `mod:${relPath(cliFile)}`;
        addEdge(cid, mid, "registered_via_lazy_import", "high", { importSpecifier: cliModule });
      }
    }
  }

  const cmdRegPath = path.join(REPO_ROOT, "src/cli/program/command-registry.ts");
  if (fs.existsSync(cmdRegPath)) {
    const ids = parseCommandRegistryIds(cmdRegPath);
    for (const id of ids) {
      const rid = `cli_registry:${id}`;
      addEntity({
        id: rid,
        kind: "cli_registry_group",
        label: id,
        confidence: "high",
        meta: { file: "command-registry.ts" },
      });
      addEdge("pkg:openclaw_root", rid, "cli_registry", "high");
    }
  }

  const bundledSkills = path.join(REPO_ROOT, "skills");
  scanSkillDirs("bundled", bundledSkills);

  const workspaceSkills = path.join(RUNTIME_ROOT, "workspace/skills");
  scanSkillDirs("user_workspace", workspaceSkills, { runtimeRoot: RUNTIME_ROOT });

  scanOpenclawRuntime(RUNTIME_ROOT);

  wireSkillRoutingCode();
  scanGatewaySurface();
  tagConfigModules();

  addEdge("runtime:openclaw_home", "routing:skill_load_pipeline", "runtime_skills_workspace", "medium");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const payload = {
    meta: {
      generator: "scripts/graphify.ts",
      version: 2,
      generatedAt: new Date().toISOString(),
      repoRoot: REPO_ROOT,
      openclawRuntimeRoot: RUNTIME_ROOT,
      skillsScan: {
        bundled: path.join(REPO_ROOT, "skills"),
        userWorkspace: workspaceSkills,
      },
      privacyNote:
        "Runtime openclaw.json and cron jobs are summarized with redacted secrets and truncated long strings; do not disable redaction when publishing.",
      confidenceSemantics: {
        high: "TypeScript AST, package.json, parsed CLI registries, SKILL.md frontmatter, static gateway method lists, filesystem scans with verified paths",
        medium: "Synthetic routing concepts, namespace declarations, re-exports, plist→launchd intent, cron→agent when id matches config",
        low: "Class/interface heritage type references (unresolved to defining module), cron targeting unknown agent ids",
      },
      entityKinds: [
        "module",
        "function",
        "class",
        "interface",
        "type_alias",
        "enum",
        "namespace",
        "type_reference",
        "npm_package",
        "package_manifest",
        "npm_export",
        "npm_script_hub",
        "npm_script",
        "cli_binary",
        "cli_command",
        "cli_registry_group",
        "skill_hub",
        "skill_definition",
        "routing_concept",
        "gateway_method",
        "gateway_event",
        "config_surface",
        "openclaw_runtime",
        "runtime_config",
        "configured_agent",
        "filesystem_agent",
        "persona_file",
        "agent_workspace",
        "model_ref",
        "cron_store",
        "cron_job",
        "runtime_agents_dir",
        "launch_agent_plist",
      ],
      stats: {
        entityCount: entities.size,
        edgeCount: edges.length,
        scannedTsFiles: tsRoots.length,
      },
    },
    entities: [...entities.values()],
    edges,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Wrote ${OUT_FILE} (${entities.size} entities, ${edges.length} edges)`);
}

main();
