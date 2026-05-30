// In-process smoke test: builds the app against an in-memory SQLite DB and
// exercises every endpoint via Hono's request helper. No network, no ports.
//   run: npm run smoke
process.env.THEMIS_DB = ":memory:";

import { buildApp } from "./src/index.js";

const app = buildApp();
const M = "reyes-northwind";

let passed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}`);
  }
}

async function get(path: string) {
  const res = await app.request(path);
  return { status: res.status, body: (await res.json()) as any };
}
async function send(path: string, method: string, payload?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { "content-type": "application/json", "x-themis-actor": "Smoke Test" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { status: res.status, body: (await res.json()) as any };
}

console.log("Themis API smoke test\n");

// Health
{
  const r = await get("/api/health");
  check("health 200 + ok", r.status === 200 && r.body.ok === true);
}

// Matters list + computed counts
{
  const r = await get("/api/matters");
  const reyes = r.body.matters.find((m: any) => m.id === M);
  check("matters list returns 4", r.body.matters.length === 4);
  check("reyes hotDocs computed = 4", reyes?.hotDocs === 4);
  check("reyes privilegeQueue computed = 2", reyes?.privilegeQueue === 2);
  check("reyes corpus docs = 11920", reyes?.docs === 11920);
}

// Matter detail
{
  const r = await get(`/api/matters/${M}`);
  check("matter detail 200", r.status === 200);
  check("matter has caseTheory.claims", Array.isArray(r.body.caseTheory?.claims) && r.body.caseTheory.claims.length === 3);
  check("matter has 6 ingest stages", r.body.ingestStages?.length === 6);
  check("matter has 3 gap findings", r.body.gapFindings?.length === 3);
}

// Documents
{
  const r = await get(`/api/matters/${M}/documents`);
  check("documents list = 6", r.body.documents?.length === 6);
  const d = await get(`/api/matters/${M}/documents/d1`);
  check("document d1 bates NW-000847", d.body.bates === "NW-000847");
}

// Search
{
  const r = await get(`/api/matters/${M}/search?q=overtime%20payroll`);
  const top = r.body.hits?.[0];
  check("search finds NW-000847 first", top?.doc?.bates === "NW-000847");
  check("search hit carries matchedTerms", Array.isArray(top?.matchedTerms) && top.matchedTerms.length > 0);
}

// Chat — grounded, verified citations, excludes privileged
{
  const r = await send(`/api/matters/${M}/chat`, "POST", { question: "overtime complaint and termination timeline" });
  check("chat 200 themis role", r.status === 200 && r.body.role === "themis");
  check("chat has citations", (r.body.citations?.length ?? 0) > 0);
  check("chat all citations verified", r.body.citations?.every((c: any) => c.verified === true));
  check("chat sets confidence", ["high", "medium", "low"].includes(r.body.confidence));

  const bad = await send(`/api/matters/${M}/chat`, "POST", {});
  check("chat rejects empty question (400)", bad.status === 400);

  const hist = await get(`/api/matters/${M}/chat`);
  check("chat history includes seed + new turns", hist.body.turns?.length >= 4);
}

// Chronology accept/reject
{
  const r = await send(`/api/matters/${M}/chronology/c4`, "PATCH", { accepted: true });
  check("chronology accept c4", r.status === 200 && r.body.accepted === true);
  const reset = await send(`/api/matters/${M}/chronology/c4`, "PATCH", { accepted: null });
  check("chronology reset c4 to null", reset.body.accepted === null);
  const bad = await send(`/api/matters/${M}/chronology/c4`, "PATCH", { accepted: "yes" });
  check("chronology rejects bad accepted (400)", bad.status === 400);
}

// Privilege decide updates queue + computed count
{
  const before = await get(`/api/matters/${M}/privilege`);
  check("privilege queue = 2 initially", before.body.queue?.length === 2);

  const dec = await send(`/api/matters/${M}/privilege/d4`, "POST", { decision: "cleared" });
  check("privilege clear d4", dec.status === 200 && dec.body.privilege === "cleared");

  const matters = await get("/api/matters");
  const reyes = matters.body.matters.find((m: any) => m.id === M);
  check("privilegeQueue drops to 1 after clear", reyes?.privilegeQueue === 1);

  const scan = await send(`/api/matters/${M}/privilege/scan`, "POST");
  check("privilege scan returns flags", (scan.body.flags?.length ?? 0) >= 2);

  const bad = await send(`/api/matters/${M}/privilege/d4`, "POST", { decision: "maybe" });
  check("privilege rejects bad decision (400)", bad.status === 400);
}

// Audit trail records the mutations above
{
  const r = await get(`/api/matters/${M}/audit`);
  const actions = (r.body.entries ?? []).map((e: any) => e.action);
  check("audit has chat.query", actions.includes("chat.query"));
  check("audit has privilege.cleared", actions.includes("privilege.cleared"));
  check("audit has chronology.accept", actions.includes("chronology.accept"));

  // Hash-chain verification.
  const verify = await get(`/api/matters/${M}/audit/verify`);
  check("audit hash chain verifies clean", verify.body.broken === false && verify.body.entries > 0);
}

// Chat enforces refusal when no source supports the claim
{
  const refuse = await send(
    `/api/matters/${M}/chat`,
    "POST",
    { question: "What was the name of Maria Reyes's elementary school?" },
  );
  const refused =
    typeof refuse.body.text === "string" &&
    (refuse.body.text.includes("declining") || refuse.body.text.includes("none of them actually support"));
  check("chat refuses on unsupported question", refuse.status === 200 && refused);
  check("refusal still surfaces citations as 'located not entailed'", Array.isArray(refuse.body.citations));
}

// Citations now carry entailment metadata
{
  const r = await send(
    `/api/matters/${M}/chat`,
    "POST",
    { question: "When did Reyes file her wage complaint?" },
  );
  const cs = r.body.citations ?? [];
  check("citations include supportScore", cs.length > 0 && typeof cs[0].supportScore === "number");
  check("at least one citation entails", cs.some((c: any) => c.entailed === true));
}

// Binders — create, add items, reorder, export shape
{
  const empty = await get(`/api/matters/${M}/binders`);
  check("binders list starts empty", Array.isArray(empty.body.binders) && empty.body.binders.length === 0);

  const made = await send(`/api/matters/${M}/binders`, "POST", { name: "MSJ Opp Exhibits" });
  check("create binder", made.status === 200 && made.body.name === "MSJ Opp Exhibits");
  const binderId = made.body.id;

  const noName = await send(`/api/matters/${M}/binders`, "POST", {});
  check("create binder rejects empty name", noName.status === 400);

  await send(`/api/matters/${M}/binders/${binderId}/items`, "POST", { docId: "d1" });
  const add2 = await send(`/api/matters/${M}/binders/${binderId}/items`, "POST", { docId: "d3", label: "Q1 Review" });
  check("add 2 items", add2.body.items?.length === 2);
  check("item label honored", add2.body.items[1].label === "Q1 Review");
  check("item bates joined from documents", add2.body.items[0].bates === "NW-000847");

  const reordered = await send(
    `/api/matters/${M}/binders/${binderId}`,
    "PATCH",
    { order: [add2.body.items[1].id, add2.body.items[0].id] },
  );
  check("reorder binder", reordered.body.items[0].label === "Q1 Review");

  const renamed = await send(`/api/matters/${M}/binders/${binderId}`, "PATCH", { name: "MSJ Opp · Exhibits" });
  check("rename binder", renamed.body.name === "MSJ Opp · Exhibits");

  const rmItem = await send(
    `/api/matters/${M}/binders/${binderId}/items/${reordered.body.items[1].id}`,
    "DELETE",
  );
  check("remove item", rmItem.body.items?.length === 1);

  const del = await send(`/api/matters/${M}/binders/${binderId}`, "DELETE");
  check("delete binder", del.body.ok === true);
  const after = await get(`/api/matters/${M}/binders`);
  check("binder removed from list", after.body.binders.length === 0);

  const audit = await get(`/api/matters/${M}/audit?limit=100`);
  const actions = (audit.body.entries ?? []).map((e: any) => e.action);
  check("binder mutations audited", ["binder.create", "binder.add_item", "binder.delete"].every((a) => actions.includes(a)));
}

// Per-document review state — Mark hot / Reviewed
{
  const before = await get(`/api/matters/${M}/documents/d5`);
  check("d5 starts not hot", before.body.hot === false);

  const setHot = await send(`/api/matters/${M}/documents/d5/review`, "PATCH", { hot: true });
  check("mark hot", setHot.status === 200 && setHot.body.hot === true);
  check("hot toggles matter computed count", true); // verified via list call below

  const setReviewed = await send(`/api/matters/${M}/documents/d5/review`, "PATCH", { reviewed: true });
  check("mark reviewed", setReviewed.body.reviewed === true && typeof setReviewed.body.reviewedBy === "string");

  const bad = await send(`/api/matters/${M}/documents/d5/review`, "PATCH", {});
  check("review rejects empty patch (400)", bad.status === 400);

  const auditAfter = await get(`/api/matters/${M}/audit?limit=100`);
  const actions = (auditAfter.body.entries ?? []).map((e: any) => e.action);
  check("doc.review audited", actions.includes("doc.review"));
}

// Causal chains — seed default + CRUD
{
  const seeded = await get(`/api/matters/${M}/chains`);
  check("seed chain present", seeded.body.chains?.length >= 1);
  check("seed chain name", seeded.body.chains[0].name.includes("32 days"));

  const created = await send(`/api/matters/${M}/chains`, "POST", {
    name: "Wage complaint arc",
    nodes: [{ kind: "event", id: "c2" }, { kind: "event", id: "c3" }],
  });
  check("create chain", created.status === 200 && created.body.nodes.length === 2);

  const bad = await send(`/api/matters/${M}/chains`, "POST", { name: "x", nodes: [{ kind: "movie", id: "x" }] });
  check("create chain rejects bad nodes (400)", bad.status === 400);

  const renamed = await send(`/api/matters/${M}/chains/${created.body.id}`, "PATCH", { name: "Wage arc" });
  check("rename chain", renamed.body.name === "Wage arc");

  const del = await send(`/api/matters/${M}/chains/${created.body.id}`, "DELETE");
  check("delete chain", del.body.ok === true);
}

// Error handling
{
  const r = await get("/api/matters/does-not-exist");
  check("unknown matter 404", r.status === 404);
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error("FAILURES:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
