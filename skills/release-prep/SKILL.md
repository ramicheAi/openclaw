---
name: release-prep
description: Prepare an OpenClaw release — bump every version location, update the changelog, and run the gate — without publishing. Use when cutting a release or bumping the version. Version bumps and npm publish are gated to operator consent; this skill stages and verifies, it does not publish.
metadata: {"openclaw":{"emoji":"🚀","requires":{"bins":["git","pnpm"]}}}
---

# release-prep — stage a release (publishing stays gated)

**Hard gate:** never change version numbers or run `npm publish` without the operator's explicit
consent. This skill *prepares and verifies* a release; it does not execute the bump or publish on
its own. Read `docs/reference/RELEASING.md` and `docs/platforms/mac/release.md` first — they answer
the routine questions.

## Version locations (bump ALL of them, in lockstep)
- `package.json` (CLI)
- `apps/android/app/build.gradle.kts` (`versionName` / `versionCode`)
- `apps/ios/Sources/Info.plist` + `apps/ios/Tests/Info.plist` (`CFBundleShortVersionString` /
  `CFBundleVersion`)
- `apps/macos/Sources/OpenClaw/Resources/Info.plist` (`CFBundleShortVersionString` /
  `CFBundleVersion`)
- `docs/install/updating.md` (pinned npm version)
- `docs/platforms/mac/release.md` (`APP_VERSION` / `APP_BUILD` examples)
- Peekaboo Xcode projects / Info.plists (`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`)
- Extension `package.json` versions if they track the repo version.

## Changelog workflow
- Keep the latest **released** version at the top (no `Unreleased` section).
- After publishing, bump the version and start a new top section.
- Include PR numbers + contributor thanks for landed PRs.

## Release-channel naming
- **stable:** tagged `vYYYY.M.D`, npm dist-tag `latest`.
- **beta:** prerelease `vYYYY.M.D-beta.N`, npm dist-tag `beta` (may ship without the mac app).
- **dev:** moving head on `main`, no tag.

## Gate before the final commit
`pnpm lint && pnpm build && pnpm test` must pass locally before committing the bump.

## Publish (operator-run, gated)
Only on explicit consent, via the 1Password + npm flow in CLAUDE.md: `op signin` in a fresh tmux
session, read the OTP, `npm publish --access public --otp="<otp>"` from the package dir, verify
with `npm view <pkg> version --userconfig "$(mktemp)"`, then kill the tmux session. **Do not rebuild
the macOS app over SSH** — mac builds run on the Mac directly.
