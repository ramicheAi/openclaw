#!/usr/bin/env bash
# rotate-key.sh — swap an API key in ~/.themis-env, verify it against the
# provider's API, and restart the Themis server. One command, no file editing.
#
#   ./rotate-key.sh ANTHROPIC_API_KEY          # prompts (hidden) for the new value
#   ./rotate-key.sh RESEND_API_KEY re_xxxx     # non-interactive
#   ./rotate-key.sh --all                      # walk every known key (Enter skips one)
#   ./rotate-key.sh --verify-only              # probe current keys, change nothing
#
# Keys are typed locally and written straight to ~/.themis-env (chmod 600,
# timestamped backup kept). In prompt mode they never touch shell history,
# the repo, or the clipboard. A bad key fails its probe BEFORE the server
# restarts, so a typo can't take Themis down.
#
# Where to mint new keys:
#   ANTHROPIC_API_KEY       https://console.anthropic.com/settings/keys
#   ASSEMBLYAI_API_KEY      https://www.assemblyai.com/app/account
#   RESEND_API_KEY          https://resend.com/api-keys
#   COURTLISTENER_API_TOKEN https://www.courtlistener.com/profile/api-token/
#   STRIPE_SECRET_KEY       https://dashboard.stripe.com/apikeys

set -euo pipefail

ENV_FILE="${THEMIS_ENV_FILE:-$HOME/.themis-env}"
REPO_ROOT="${THEMIS_REPO:-$HOME/themis-demo}"
KNOWN_KEYS=(ANTHROPIC_API_KEY ASSEMBLYAI_API_KEY RESEND_API_KEY COURTLISTENER_API_TOKEN STRIPE_SECRET_KEY)

say()  { printf '%s\n' "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

set_key() { # name value — replace-or-append in the env file, backup first
  local name="$1" value="$2" tmp
  [ -f "$ENV_FILE" ] || { touch "$ENV_FILE"; chmod 600 "$ENV_FILE"; }
  cp "$ENV_FILE" "$ENV_FILE.bak-$(date +%Y%m%d-%H%M%S)"
  tmp="$(mktemp)"
  grep -v "^${name}=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$name" "$value" >> "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
  say "  + $name written to $ENV_FILE (backup kept)"
}

probe_key() { # name — hit the provider's cheapest authenticated endpoint
  local name="$1" value code
  value="$(grep "^${name}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-)"
  [ -n "$value" ] || { say "  - $name: not set, skipping probe"; return 0; }
  case "$name" in
    ANTHROPIC_API_KEY)
      code=$(curl -s -o /dev/null -w '%{http_code}' -m 15 https://api.anthropic.com/v1/models \
        -H "x-api-key: $value" -H "anthropic-version: 2023-06-01") ;;
    RESEND_API_KEY)
      code=$(curl -s -o /dev/null -w '%{http_code}' -m 15 https://api.resend.com/domains \
        -H "Authorization: Bearer $value") ;;
    ASSEMBLYAI_API_KEY)
      code=$(curl -s -o /dev/null -w '%{http_code}' -m 15 "https://api.assemblyai.com/v2/transcript?limit=1" \
        -H "authorization: $value") ;;
    COURTLISTENER_API_TOKEN)
      code=$(curl -s -o /dev/null -w '%{http_code}' -m 15 "https://www.courtlistener.com/api/rest/v4/courts/?page_size=1" \
        -H "Authorization: Token $value") ;;
    STRIPE_SECRET_KEY)
      code=$(curl -s -o /dev/null -w '%{http_code}' -m 15 https://api.stripe.com/v1/account -u "$value:") ;;
    *) say "  ? $name: no probe defined, treating as OK"; return 0 ;;
  esac
  if [ "$code" = "200" ]; then
    say "  OK $name: provider accepted it (HTTP 200)"
  else
    say "  XX $name: provider returned HTTP $code — key looks bad"
    return 1
  fi
}

restart_server() {
  say "Restarting Themis server..."
  # Same recipe as themis-watch.sh so the two never fight.
  pkill -f "tsx.*themis/server" 2>/dev/null || true
  pkill -f "themis/server/src/index.ts" 2>/dev/null || true
  sleep 2
  set -a; . "$ENV_FILE"; set +a
  ( cd "$REPO_ROOT/themis/server" && nohup npm run dev > /tmp/themis-server.log 2>&1 & )
  local i
  for i in $(seq 1 15); do
    sleep 2
    if curl -s -m 3 http://localhost:8787/api/health 2>/dev/null | grep -q '"ok":true'; then
      say "  OK server healthy on :8787"
      return 0
    fi
  done
  fail "server did not come back — check /tmp/themis-server.log"
}

case "${1:-}" in
  --verify-only)
    say "Probing current keys in $ENV_FILE:"
    rc=0; for k in "${KNOWN_KEYS[@]}"; do probe_key "$k" || rc=1; done; exit "$rc"
    ;;
  --all)
    changed=0
    for k in "${KNOWN_KEYS[@]}"; do
      printf 'New value for %s (Enter to skip): ' "$k"
      read -rs v; printf '\n'
      if [ -n "${v:-}" ]; then
        set_key "$k" "$v"
        probe_key "$k" || fail "$k failed its probe — fix the key and re-run (server NOT restarted)"
        changed=1
      fi
    done
    if [ "$changed" = "1" ]; then restart_server; else say "Nothing changed."; exit 0; fi
    ;;
  ""|--help|-h)
    sed -n '2,21p' "$0"; exit 1
    ;;
  *)
    name="$1"
    if [ $# -ge 2 ]; then v="$2"; else printf 'New value for %s: ' "$name"; read -rs v; printf '\n'; fi
    [ -n "${v:-}" ] || fail "empty value"
    set_key "$name" "$v"
    probe_key "$name" || fail "$name failed its probe — fix the key and re-run (server NOT restarted)"
    restart_server
    ;;
esac

say "Done. Now revoke the OLD key in the provider dashboard (links in the header of this script)."
