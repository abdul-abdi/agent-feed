#!/usr/bin/env bash
# Full end-to-end demo: spin up fixture publisher + aggregator, drive both,
# show the agentic address system + search engine working together.
set -euo pipefail
cd "$(dirname "$0")/.."

DB=/tmp/agent-feed-demo.sqlite
rm -f "$DB"

bun examples/publisher-fixture.ts > /tmp/fixture.log 2>&1 &
FIXTURE_PID=$!
PORT=4200 DB_PATH="$DB" bun apps/aggregator/src/server.ts > /tmp/aggregator.log 2>&1 &
AGG_PID=$!
trap 'kill $FIXTURE_PID $AGG_PID 2>/dev/null || true; rm -f "$DB"' EXIT

sleep 1.5

echo "=================================================================="
echo "  agent-feed v0  ·  end-to-end demo"
echo "=================================================================="
echo
echo "  fixture publisher: http://localhost:4242"
echo "  aggregator UI:     http://localhost:4200"
echo

echo "[1/6] consumer-demo: agent surviving a schema change"
echo "------------------------------------------------------------------"
bun examples/consumer-demo.ts || true
echo

echo "[2/6] aggregator crawls the fixture"
echo "------------------------------------------------------------------"
curl -sS -X POST http://localhost:4200/api/crawl \
  -H 'content-type: application/json' \
  -d '{"origin":"http://localhost:4242"}'
echo
echo

echo "[3/6] search 'currency' (the schema-change announcement)"
echo "------------------------------------------------------------------"
curl -sS 'http://localhost:4200/api/search?q=currency&type=schema-change' | head -50
echo
echo

echo "[4/6] origins indexed"
echo "------------------------------------------------------------------"
curl -sS http://localhost:4200/api/origins
echo
echo

echo "[5/6] lint the fixture"
echo "------------------------------------------------------------------"
bun src/cli.ts lint -o http://localhost:4242 || true
echo

echo "[6/6] origin stats"
echo "------------------------------------------------------------------"
curl -sS "http://localhost:4200/api/origins/$(printf 'http://localhost:4242' | jq -sRr @uri)"
echo
echo
echo "=================================================================="
echo "  ✓ end-to-end demo complete"
echo "=================================================================="
