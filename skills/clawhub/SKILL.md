---
name: clawhub
description: Use the ClawHub CLI to search, install, update, and publish agent skills from clawhub.com. Use when you need to fetch new skills on the fly, sync installed skills to latest or a specific version, or publish new/updated skill folders with the npm-installed clawhub CLI. Publish is a terminal action — it pushes a skill publicly to clawhub.com for others to install, so publish only skills the user asked to release; search/install/update are safe.
metadata: {"openclaw":{"requires":{"bins":["clawhub"]},"install":[{"id":"node","kind":"node","package":"clawhub","bins":["clawhub"],"label":"Install ClawHub CLI (npm)"}]}}
---

# ClawHub CLI

> **🚀 Publish is terminal and public.** `clawhub publish` pushes a skill to clawhub.com where anyone can install it; you can't fully un-ship a published version. When to use: release a skill the user explicitly asked to publish. When NOT to use: don't publish drafts, secrets, or work the user hasn't approved; search/install/update are safe. GOOD: publish the reviewed skill folder the user finalized. BAD: publishing a half-finished skill to "test" the flow.

Install
```bash
npm i -g clawhub
```

Auth (publish)
```bash
clawhub login
clawhub whoami
```

Search
```bash
clawhub search "postgres backups"
```

Install
```bash
clawhub install my-skill
clawhub install my-skill --version 1.2.3
```

Update (hash-based match + upgrade)
```bash
clawhub update my-skill
clawhub update my-skill --version 1.2.3
clawhub update --all
clawhub update my-skill --force
clawhub update --all --no-input --force
```

List
```bash
clawhub list
```

Publish
```bash
clawhub publish ./my-skill --slug my-skill --name "My Skill" --version 1.2.0 --changelog "Fixes + docs"
```

Notes
- Default registry: https://clawhub.com (override with CLAWHUB_REGISTRY or --registry)
- Default workdir: cwd (falls back to OpenClaw workspace); install dir: ./skills (override with --workdir / --dir / CLAWHUB_WORKDIR)
- Update command hashes local files, resolves matching version, and upgrades to latest unless --version is set
