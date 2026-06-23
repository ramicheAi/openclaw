#!/usr/bin/env node
// Batch-render Remotion compositions from a CSV or JSON jobs file.
// The volume engine: one file in -> N branded MP4s out, no per-clip hand work.
//
// Usage:
//   node batch.mjs --studio <dir> <input.csv>  --composition QuoteReel [opts]
//   node batch.mjs --studio <dir> <jobs.json>  [opts]
// Options: --out-dir <d> --jobs <n> --prefix <name> --codec <c> --scale <n>
//
// CSV: first row = header (prop names). Each row = one render. Special columns:
//   __out         output filename for that row
//   __composition override composition per row
// CSV is best for flat props (QuoteReel, TitleCard, LowerThird). For nested props
// (CaptionedClip captions) use a JSON jobs file.
//
// JSON: array of { composition?, out?, props } (composition falls back to --composition).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function parseArgs(argv) {
  const opts = { jobs: 2, _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--studio") opts.studio = argv[++i];
    else if (a === "--composition") opts.composition = argv[++i];
    else if (a === "--out-dir") opts.outDir = argv[++i];
    else if (a === "--jobs") opts.jobs = parseInt(argv[++i], 10) || 1;
    else if (a === "--prefix") opts.prefix = argv[++i];
    else if (a === "--codec") opts.codec = argv[++i];
    else if (a === "--scale") opts.scale = argv[++i];
    else if (a === "-h" || a === "--help") opts.help = true;
    else opts._.push(a);
  }
  return opts;
}

// CSV line parser handling quoted fields and escaped quotes ("").
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function loadJobs(input, opts) {
  const ext = path.extname(input).toLowerCase();
  const raw = fs.readFileSync(input, "utf8");
  if (ext === ".json") {
    const data = JSON.parse(raw);
    const arr = Array.isArray(data) ? data : data.jobs;
    if (!Array.isArray(arr)) throw new Error("JSON must be an array of jobs or { jobs: [...] }");
    return arr.map((j, i) => ({
      composition: j.composition || opts.composition,
      props: j.props ?? {},
      out: j.out,
      index: i,
    }));
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("CSV needs a header row and at least one data row");
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line, i) => {
    const cells = parseCsvLine(line);
    const props = {};
    let out;
    let composition;
    header.forEach((h, idx) => {
      const v = cells[idx] ?? "";
      if (h === "__out") out = v;
      else if (h === "__composition") composition = v;
      else props[h] = v;
    });
    return { composition: composition || opts.composition, props, out, index: i };
  });
}

function renderJob(job, opts) {
  const comp = job.composition;
  if (!comp) {
    return Promise.resolve({
      comp,
      code: 1,
      err: `job ${job.index}: no composition (use --composition or a __composition column)`,
    });
  }
  const outDir = opts.outDir || path.join(opts.studio, "out");
  fs.mkdirSync(outDir, { recursive: true });
  const base = job.out || `${opts.prefix || comp}-${String(job.index + 1).padStart(3, "0")}.mp4`;
  const outPath = path.isAbsolute(base) ? base : path.join(outDir, base);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rm-batch-"));
  const propsFile = path.join(tmp, "props.json");
  fs.writeFileSync(propsFile, JSON.stringify(job.props ?? {}));

  const bin = path.join(opts.studio, "node_modules", ".bin", "remotion");
  const args = ["render", "src/index.ts", comp, outPath, `--props=${propsFile}`];
  if (opts.codec) args.push(`--codec=${opts.codec}`);
  if (opts.scale) args.push(`--scale=${opts.scale}`);

  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd: opts.studio });
    let err = "";
    child.stderr.on("data", (d) => (err += d.toString()));
    const finish = (code, extra) => {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {
        // ignore
      }
      resolve({ outPath, comp, code, err: extra ?? err });
    };
    child.on("close", (code) => finish(code ?? 1));
    child.on("error", (e) => finish(1, String(e)));
  });
}

async function pool(items, n, worker) {
  const results = [];
  let i = 0;
  const runners = Array.from({ length: Math.max(1, n) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || opts._.length === 0 || !opts.studio) {
    console.log(
      "usage: batch.mjs --studio <dir> <input.csv|jobs.json> [--composition Id] [--out-dir d] [--jobs n] [--prefix name] [--codec c] [--scale n]",
    );
    process.exit(opts.help ? 0 : 1);
  }
  const jobs = loadJobs(opts._[0], opts);
  console.log(`Batch: ${jobs.length} job(s), concurrency ${opts.jobs}`);
  const started = Date.now();
  let done = 0;
  const results = await pool(jobs, opts.jobs, async (job) => {
    const r = await renderJob(job, opts);
    done++;
    if (r.code === 0) {
      console.log(`  [${done}/${jobs.length}] ok  ${r.comp} -> ${r.outPath}`);
    } else {
      console.log(
        `  [${done}/${jobs.length}] FAIL ${r.comp} (exit ${r.code})\n${String(r.err).split("\n").slice(-4).join("\n")}`,
      );
    }
    return r;
  });
  const ok = results.filter((r) => r.code === 0).length;
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\nDone: ${ok}/${jobs.length} rendered in ${secs}s -> ${opts.outDir || path.join(opts.studio, "out")}`);
  if (ok < jobs.length) process.exit(1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
