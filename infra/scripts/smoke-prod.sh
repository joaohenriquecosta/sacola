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

resp=$(req GET "$BASE_URL/api/v1/migrations")
status="${resp%%:*}"
if [ "$status" = "200" ] && [ "$(jq 'length' < $BODY_FILE)" = "0" ]; then
  pass "GET /api/v1/migrations → 200 + []"
else
  fail "GET /api/v1/migrations → $status / $(cat $BODY_FILE)" \
       "if non-empty, migrations did not apply on deploy"
fi

section "2. Golden path (register → login → user → logout)"

resp=$(req POST "$BASE_URL/api/v1/users" \
       -H "Content-Type: application/json" \
       -d "{\"username\":\"$USERNAME\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
status="${resp%%:*}"
if [ "$status" = "201" ]; then
  has_password=$(jq 'has("password")' < $BODY_FILE)
  has_features=$(jq '.features | type == "array" and length > 0' < $BODY_FILE)
  if [ "$has_password" = "false" ] && [ "$has_features" = "true" ]; then
    pass "POST /api/v1/users → 201, no password leak, features present"
  else
    fail "POST /api/v1/users payload off" "$(cat $BODY_FILE)"
  fi
else
  fail "POST /api/v1/users → $status" "$(cat $BODY_FILE)"
fi

resp=$(req POST "$BASE_URL/api/v1/sessions" \
       -H "Content-Type: application/json" \
       -c "$COOKIE_JAR" \
       -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
status="${resp%%:*}"
if [ "$status" = "201" ]; then
  pass "POST /api/v1/sessions → 201"
  if grep -qi "HttpOnly" "$HDR_FILE"; then pass "  cookie has HttpOnly"; else fail "  cookie missing HttpOnly"; fi
  if grep -qi "SameSite=Lax" "$HDR_FILE"; then pass "  cookie has SameSite=Lax"; else fail "  cookie missing SameSite=Lax"; fi
  if echo "$BASE_URL" | grep -q "^https"; then
    if grep -qi "Secure" "$HDR_FILE"; then pass "  cookie has Secure (https)"; else fail "  cookie missing Secure on https"; fi
  fi
else
  fail "POST /api/v1/sessions → $status" "$(cat $BODY_FILE)"
fi

resp=$(req GET "$BASE_URL/api/v1/user" -b "$COOKIE_JAR")
status="${resp%%:*}"
if [ "$status" = "200" ]; then
  got_username=$(jq -r '.username' < $BODY_FILE)
  if [ "$got_username" = "$USERNAME" ]; then
    pass "GET /api/v1/user → 200, correct user"
  else
    fail "GET /api/v1/user wrong username" "expected $USERNAME got $got_username"
  fi
else
  fail "GET /api/v1/user → $status" "$(cat $BODY_FILE)"
fi

resp=$(req DELETE "$BASE_URL/api/v1/sessions" -b "$COOKIE_JAR")
status="${resp%%:*}"
if [ "$status" = "200" ] && grep -qi "Max-Age=0" "$HDR_FILE"; then
  pass "DELETE /api/v1/sessions → 200 + Max-Age=0"
else
  fail "DELETE /api/v1/sessions broken" "$(cat $HDR_FILE)"
fi

resp=$(req GET "$BASE_URL/api/v1/user" -b "$COOKIE_JAR")
status="${resp%%:*}"
if [ "$status" = "401" ]; then
  pass "GET /api/v1/user post-logout → 401"
else
  fail "GET /api/v1/user post-logout → $status (should be 401)"
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
