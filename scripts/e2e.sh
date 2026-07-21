#!/usr/bin/env bash
#
# End-to-end test script for the Money Transfer API.
#
# Builds the project, boots the compiled server as a real HTTP process on a
# dedicated port, drives it purely over HTTP with curl (no in-process test
# harness), and asserts on status codes and response bodies. This is a
# black-box complement to the Jest/Supertest unit-level tests in tests/.
#
# Usage: ./scripts/e2e.sh
# Requires: curl, jq, npm/node. Exits non-zero if any check fails.

set -u

PORT="${E2E_PORT:-4123}"
BASE_URL="http://localhost:${PORT}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_LOG="$(mktemp)"
SERVER_PID=""
PASS_COUNT=0
FAIL_COUNT=0

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
  fi
  rm -f "$SERVER_LOG"
}
trap cleanup EXIT

fail() {
  echo "  FAIL: $1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
}

# assert_status <label> <expected_status> <actual_status>
assert_status() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    pass
  else
    fail "$label — expected status $expected, got $actual"
  fi
}

# assert_eq <label> <expected> <actual>
assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    pass
  else
    fail "$label — expected '$expected', got '$actual'"
  fi
}

echo "==> Building project"
(cd "$ROOT_DIR" && npm run build --silent) || { echo "Build failed"; exit 1; }

echo "==> Starting server on port ${PORT}"
(cd "$ROOT_DIR" && exec env PORT="$PORT" node dist/server.js > "$SERVER_LOG" 2>&1) &
SERVER_PID=$!

echo "==> Waiting for the server to become healthy"
READY=0
for _ in $(seq 1 30); do
  if curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/health" 2>/dev/null | grep -q "200"; then
    READY=1
    break
  fi
  sleep 0.3
done
if [ "$READY" -ne 1 ]; then
  echo "Server did not become healthy in time. Log:"
  cat "$SERVER_LOG"
  exit 1
fi
echo "Server is up (pid ${SERVER_PID})"
echo

# ---------------------------------------------------------------------------
# 1. Account creation
# ---------------------------------------------------------------------------
echo "==> Test: create account with valid balance"
RES=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/accounts" \
  -H "Content-Type: application/json" -d '{"balance": 100}')
BODY=$(echo "$RES" | sed '$d')
STATUS=$(echo "$RES" | tail -n1)
assert_status "create account (valid)" "201" "$STATUS"
FROM_ID=$(echo "$BODY" | jq -r '.id')
assert_eq "create account balance" "100" "$(echo "$BODY" | jq -r '.balance')"

echo "==> Test: create second account"
RES=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/accounts" \
  -H "Content-Type: application/json" -d '{"balance": 50}')
BODY=$(echo "$RES" | sed '$d')
STATUS=$(echo "$RES" | tail -n1)
assert_status "create account (valid, second)" "201" "$STATUS"
TO_ID=$(echo "$BODY" | jq -r '.id')

echo "==> Test: reject negative initial balance"
RES=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/accounts" \
  -H "Content-Type: application/json" -d '{"balance": -10}')
STATUS=$(echo "$RES" | tail -n1)
assert_status "create account (negative balance)" "400" "$STATUS"

echo "==> Test: reject missing balance"
RES=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/accounts" \
  -H "Content-Type: application/json" -d '{}')
STATUS=$(echo "$RES" | tail -n1)
assert_status "create account (missing balance)" "400" "$STATUS"

# ---------------------------------------------------------------------------
# 2. Account retrieval
# ---------------------------------------------------------------------------
echo "==> Test: get existing account"
RES=$(curl -s -w "\n%{http_code}" "${BASE_URL}/accounts/${FROM_ID}")
BODY=$(echo "$RES" | sed '$d')
STATUS=$(echo "$RES" | tail -n1)
assert_status "get account (existing)" "200" "$STATUS"
assert_eq "get account balance" "100" "$(echo "$BODY" | jq -r '.balance')"

echo "==> Test: get unknown account returns 404"
RES=$(curl -s -w "\n%{http_code}" "${BASE_URL}/accounts/does-not-exist")
STATUS=$(echo "$RES" | tail -n1)
assert_status "get account (unknown)" "404" "$STATUS"

echo "==> Test: list accounts includes both created accounts"
RES=$(curl -s -w "\n%{http_code}" "${BASE_URL}/accounts")
BODY=$(echo "$RES" | sed '$d')
STATUS=$(echo "$RES" | tail -n1)
assert_status "list accounts" "200" "$STATUS"
COUNT=$(echo "$BODY" | jq 'length')
if [ "$COUNT" -ge 2 ]; then pass; else fail "list accounts — expected at least 2, got $COUNT"; fi

# ---------------------------------------------------------------------------
# 3. Transfers
# ---------------------------------------------------------------------------
echo "==> Test: successful transfer updates both balances"
RES=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/transfers" \
  -H "Content-Type: application/json" \
  -d "{\"fromAccountId\": \"${FROM_ID}\", \"toAccountId\": \"${TO_ID}\", \"amount\": 30}")
BODY=$(echo "$RES" | sed '$d')
STATUS=$(echo "$RES" | tail -n1)
assert_status "transfer (valid)" "201" "$STATUS"
TRANSFER_ID=$(echo "$BODY" | jq -r '.id')

FROM_BALANCE=$(curl -s "${BASE_URL}/accounts/${FROM_ID}" | jq -r '.balance')
TO_BALANCE=$(curl -s "${BASE_URL}/accounts/${TO_ID}" | jq -r '.balance')
assert_eq "source balance after transfer" "70" "$FROM_BALANCE"
assert_eq "destination balance after transfer" "80" "$TO_BALANCE"

echo "==> Test: reject transfer from a non-existent source account"
RES=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/transfers" \
  -H "Content-Type: application/json" \
  -d "{\"fromAccountId\": \"missing-account\", \"toAccountId\": \"${TO_ID}\", \"amount\": 10}")
STATUS=$(echo "$RES" | tail -n1)
assert_status "transfer (missing source account)" "404" "$STATUS"

echo "==> Test: reject transfer to a non-existent destination account"
RES=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/transfers" \
  -H "Content-Type: application/json" \
  -d "{\"fromAccountId\": \"${FROM_ID}\", \"toAccountId\": \"missing-account\", \"amount\": 10}")
STATUS=$(echo "$RES" | tail -n1)
assert_status "transfer (missing destination account)" "404" "$STATUS"

echo "==> Test: reject transfer with insufficient funds"
RES=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/transfers" \
  -H "Content-Type: application/json" \
  -d "{\"fromAccountId\": \"${FROM_ID}\", \"toAccountId\": \"${TO_ID}\", \"amount\": 100000}")
STATUS=$(echo "$RES" | tail -n1)
assert_status "transfer (insufficient funds)" "400" "$STATUS"

echo "==> Test: reject transfer with a negative amount"
RES=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/transfers" \
  -H "Content-Type: application/json" \
  -d "{\"fromAccountId\": \"${FROM_ID}\", \"toAccountId\": \"${TO_ID}\", \"amount\": -5}")
STATUS=$(echo "$RES" | tail -n1)
assert_status "transfer (negative amount)" "400" "$STATUS"

echo "==> Test: reject transfer with a zero amount"
RES=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/transfers" \
  -H "Content-Type: application/json" \
  -d "{\"fromAccountId\": \"${FROM_ID}\", \"toAccountId\": \"${TO_ID}\", \"amount\": 0}")
STATUS=$(echo "$RES" | tail -n1)
assert_status "transfer (zero amount)" "400" "$STATUS"

echo "==> Test: reject transfer to the same account"
RES=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/transfers" \
  -H "Content-Type: application/json" \
  -d "{\"fromAccountId\": \"${FROM_ID}\", \"toAccountId\": \"${FROM_ID}\", \"amount\": 5}")
STATUS=$(echo "$RES" | tail -n1)
assert_status "transfer (same account)" "400" "$STATUS"

echo "==> Test: transfer history includes the successful transfer"
RES=$(curl -s -w "\n%{http_code}" "${BASE_URL}/transfers")
BODY=$(echo "$RES" | sed '$d')
STATUS=$(echo "$RES" | tail -n1)
assert_status "list transfers" "200" "$STATUS"
FOUND=$(echo "$BODY" | jq --arg id "$TRANSFER_ID" '[.[] | select(.id == $id)] | length')
assert_eq "transfer appears in history" "1" "$FOUND"

# ---------------------------------------------------------------------------
# 4. Ledger
# ---------------------------------------------------------------------------
echo "==> Test: source account ledger has an INITIAL_DEPOSIT and a DEBIT entry"
RES=$(curl -s -w "\n%{http_code}" "${BASE_URL}/accounts/${FROM_ID}/ledger")
BODY=$(echo "$RES" | sed '$d')
STATUS=$(echo "$RES" | tail -n1)
assert_status "get ledger (existing account)" "200" "$STATUS"
assert_eq "ledger entry count" "2" "$(echo "$BODY" | jq 'length')"
assert_eq "ledger first entry reason" "INITIAL_DEPOSIT" "$(echo "$BODY" | jq -r '.[0].reason')"
assert_eq "ledger second entry type" "DEBIT" "$(echo "$BODY" | jq -r '.[1].type')"
assert_eq "ledger second entry balanceAfter" "70" "$(echo "$BODY" | jq -r '.[1].balanceAfter')"

echo "==> Test: ledger for unknown account returns 404"
RES=$(curl -s -w "\n%{http_code}" "${BASE_URL}/accounts/does-not-exist/ledger")
STATUS=$(echo "$RES" | tail -n1)
assert_status "get ledger (unknown account)" "404" "$STATUS"

# ---------------------------------------------------------------------------
echo
echo "==> Results: ${PASS_COUNT} passed, ${FAIL_COUNT} failed"
if [ "$FAIL_COUNT" -ne 0 ]; then
  echo "Server log:"
  cat "$SERVER_LOG"
  exit 1
fi
exit 0
