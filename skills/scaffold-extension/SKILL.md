---
name: scaffold-extension
description: Scaffold a new OpenClaw extension (workspace package under extensions/) with the dependency rules that keep npm install from breaking. Use when creating a plugin/extension or fixing an extension whose install fails. Covers the openclaw manifest block, dependency placement, and labeler coverage.
metadata: {"openclaw":{"emoji":"🧩","requires":{"bins":["git"]}}}
---

# scaffold-extension — new workspace plugin, install-safe

Extensions live under `extensions/*` as workspace packages. The install path is
`npm install --omit=dev` **in the plugin dir**, which makes dependency placement load-bearing.

## package.json shape
```jsonc
{
  "name": "@openclaw/<id>",
  "version": "<match repo version>",
  "type": "module",
  "description": "OpenClaw <X> plugin",
  "openclaw": {
    "extensions": ["./index.ts"],
    "channel": {                       // only for channel plugins
      "id": "<id>", "label": "<Label>", "selectionLabel": "...",
      "docsPath": "/channels/<id>", "docsLabel": "<id>", "blurb": "...",
      "aliases": ["<short>"], "order": 80, "quickstartAllowFrom": true
    },
    "install": { "npmSpec": "@openclaw/<id>", "localPath": "extensions/<id>", "defaultChoice": "npm" }
  },
  "dependencies": { /* runtime deps ONLY, real versions */ }
}
```

## Dependency rules (the part that breaks installs)
- **Runtime deps go in `dependencies`** of the extension's own `package.json` — they're installed
  with `--omit=dev`. Keep plugin-only deps out of the root `package.json` unless core uses them.
- **Avoid `workspace:*` in `dependencies`** — `npm install` breaks on it. Put `openclaw` in
  `devDependencies` or `peerDependencies` instead; the runtime resolves `openclaw/plugin-sdk` via
  the jiti alias. *(Some older extensions still carry `openclaw: workspace:*` in `dependencies` —
  don't copy that; follow this rule for anything npm-installed.)*
- Any dep with `pnpm.patchedDependencies` must be pinned to an **exact** version (no `^`/`~`).
- Patching deps (pnpm patches/overrides/vendoring) requires **explicit approval** — don't by default.

## Don't forget
- **Labeler:** add coverage in `.github/labeler.yml` for `extensions/<id>/**` (+ docs path).
- **Docs:** `docs/channels/<id>.md` for channel plugins; generic content only.
- Keep `pnpm-lock.yaml` + Bun patching in sync if you touch deps.

## Verify
`pnpm install` clean, `pnpm build`, and a fresh `npm install --omit=dev` inside `extensions/<id>`
succeeds (the real install path).
