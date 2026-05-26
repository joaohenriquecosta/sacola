#!/usr/bin/env bash
# Smoke test for the deployed auth foundation.
#
# Usage:
#   BASE_URL=https://sacola.vercel.app ./infra/scripts/smoke-prod.sh
#   ./infra/scripts/smoke-prod.sh https://sacola.vercel.app
#
# When Vercel Deployment Protection is on, pass the bypass secret so every
# request goes through:
#   VERCEL_AUTOMATION_BYPASS_SECRET=<secret> ./infra/scripts/smoke-prod.sh <url>
# (create the secret under Project Settings → Deployment Protection →
#  Protection Bypass for Automation.)
#
# Exits 0 if all checks pass, 1 otherwise. Generates a unique username per
# run (suffixed with epoch) so it can be rerun without manual cleanup.
# The smoke user persists in the database — drop it manually if needed:
#   DELETE FROM users WHERE username LIKE 'smoke%';

set -uo pipefail

BASE_URL="${1:-${BASE_URL:-}}"
if [ -z "$BASE_URL" ]; then
  echo "Usage: $0 <base_url>  (or set BASE_URL env var)" >&2
  exit 1
fi
BASE_URL="${BASE_URL%/}"

command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }

BYPASS_ARGS=()
if [ -n "${VERCEL_AUTOMATION_BYPASS_SECRET:-}" ]; then
  BYPASS_ARGS=(-H "x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET")
fi

SUFFIX=$(date +%s)
USERNAME="smoke${SUFFIX}"
EMAIL="smoke${SUFFIX}@example.com"
PASSWORD="SmokeProd!2026"

COOKIE_JAR=$(mktemp)
BODY_FILE=$(mktemp)
HDR_FILE=$(mktemp)
trap "rm -f $COOKIE_JAR $BODY_FILE $HDR_FILE" EXIT

PASS=0
FAIL=0

pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; [ -n "${2:-}" ] && echo "    $2"; FAIL=$((FAIL+1)); }
section() { echo; echo "▶ $1"; }

# curl wrapper: stores body in $BODY_FILE, headers in $HDR_FILE,
# echoes "<status>:<time_total>" so callers can read both.
req() {
  local method="$1"; shift
  local url="$1"; shift
  curl -s -o "$BODY_FILE" -D "$HDR_FILE" \
       -w "%{http_code}:%{time_total}" \
       -X "$method" "${BYPASS_ARGS[@]}" "$@" "$url"
}

section "1. Sanity"

resp=$(req GET "$BASE_URL/api/v1/status")
status="${resp%%:*}"
if [ "$status" = "200" ]; then
  pass "GET /api/v1/status → 200"
else
  fail "GET /api/v1/status → $status" "$(cat $BODY_FILE)"
fi

# Migrations endpoint is gated to 404 in production (build-time migrations
# only; the route can't bundle `infra/migrations/*.js` in the serverless
# function). The golden path below validates migrations actually applied.
resp=$(req GET "$BASE_URL/api/v1/migrations")
status="${resp%%:*}"
if [ "$status" = "404" ]; then
  pass "GET /api/v1/migrations → 404 (gated in production)"
else
  fail "GET /api/v1/migrations → $status / $(cat $BODY_FILE)" \
       "expected 404 — migrations endpoint should be disabled in prod"
fi

section "2. Registration + activation gating"

resp=$(req POST "$BASE_URL/api/v1/users" \
       -H "Content-Type: application/json" \
       -d "{\"username\":\"$USERNAME\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
status="${resp%%:*}"
if [ "$status" = "201" ]; then
  has_password=$(jq 'has("password")' < $BODY_FILE)
  features=$(jq -c '.features' < $BODY_FILE)
  if [ "$has_password" = "false" ] && [ "$features" = '["read:activation_token"]' ]; then
    pass "POST /api/v1/users → 201, unactivated features, no password leak"
  else
    fail "POST /api/v1/users payload off" "$(cat $BODY_FILE)"
  fi
else
  fail "POST /api/v1/users → $status" "$(cat $BODY_FILE)"
fi

# Login while unactivated must be rejected with the activation message.
# We can't reach the activation link in prod from the smoke runner (no DB
# access, no mailbox), so the post-activation login/logout/cookie path is
# only exercised by integration tests in CI.
resp=$(req POST "$BASE_URL/api/v1/sessions" \
       -H "Content-Type: application/json" \
       -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
status="${resp%%:*}"
msg=$(jq -r '.message // ""' < $BODY_FILE)
if [ "$status" = "401" ] && echo "$msg" | grep -qi "ativada"; then
  pass "POST /api/v1/sessions while unactivated → 401 with activation message"
else
  fail "POST /api/v1/sessions while unactivated → $status / $msg"
fi

section "3. Anti-enumeration"

resp_wrong=$(req POST "$BASE_URL/api/v1/sessions" \
             -H "Content-Type: application/json" \
             -d "{\"email\":\"$EMAIL\",\"password\":\"wrong!12345\"}")
status_wrong="${resp_wrong%%:*}"
time_wrong="${resp_wrong##*:}"
body_wrong=$(cat $BODY_FILE)

resp_ghost=$(req POST "$BASE_URL/api/v1/sessions" \
             -H "Content-Type: application/json" \
             -d "{\"email\":\"ghost${SUFFIX}@nope.com\",\"password\":\"wrong!12345\"}")
status_ghost="${resp_ghost%%:*}"
time_ghost="${resp_ghost##*:}"
body_ghost=$(cat $BODY_FILE)

if [ "$status_wrong" = "401" ] && [ "$status_ghost" = "401" ]; then
  pass "wrong password and ghost email both → 401"
else
  fail "expected both 401, got wrong=$status_wrong ghost=$status_ghost"
fi

msg_wrong=$(echo "$body_wrong" | jq -r '.message')
msg_ghost=$(echo "$body_ghost" | jq -r '.message')
if [ "$msg_wrong" = "$msg_ghost" ]; then
  pass "identical error message (no enumeration via body)"
else
  fail "different messages" "wrong=$msg_wrong ghost=$msg_ghost"
fi

# Anti-timing check: ghost should be roughly as slow as wrong-pw
# because of the dummy bcrypt compare. Allow 500ms window.
diff_ms=$(echo "$time_wrong $time_ghost" | awk '{ d=$1-$2; if(d<0) d=-d; printf "%d", d*1000 }')
if [ "$diff_ms" -lt 500 ]; then
  pass "timing within 500ms (wrong=${time_wrong}s ghost=${time_ghost}s — dummy bcrypt is firing)"
else
  fail "timing diff $diff_ms ms > 500ms (wrong=${time_wrong}s ghost=${time_ghost}s)" \
       "ghost-email branch may be skipping the dummy bcrypt compare"
fi

section "4. Validation (400s)"

check_400() {
  local label="$1"
  local body="$2"
  resp=$(req POST "$BASE_URL/api/v1/users" \
         -H "Content-Type: application/json" -d "$body")
  status="${resp%%:*}"
  name=$(jq -r '.name' < $BODY_FILE)
  if [ "$status" = "400" ] && [ "$name" = "ValidationError" ]; then
    pass "$label → 400 ValidationError"
  else
    fail "$label → $status / $name" "$(cat $BODY_FILE)"
  fi
}

check_400 "short username" '{"username":"ab","email":"x@y.com","password":"ValidSenha!2026"}'
check_400 "malformed email" '{"username":"validname","email":"not-an-email","password":"ValidSenha!2026"}'
check_400 "short password"  '{"username":"validname2","email":"a@b.com","password":"Curta!1"}'
check_400 "no special pw"   '{"username":"validname3","email":"c@d.com","password":"abcdef1234567890"}'
check_400 "duplicate username" "{\"username\":\"$USERNAME\",\"email\":\"other-${SUFFIX}@x.com\",\"password\":\"ValidSenha!2026\"}"
check_400 "duplicate email"    "{\"username\":\"other${SUFFIX}\",\"email\":\"$EMAIL\",\"password\":\"ValidSenha!2026\"}"

echo
echo "────────────────────────────────"
echo "Passed: $PASS    Failed: $FAIL"
echo "────────────────────────────────"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
