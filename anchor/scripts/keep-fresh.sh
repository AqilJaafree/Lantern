#!/usr/bin/env bash
# Demo helper: run a multichain attestation round (relay-all) every 60s so all
# chains stay fresh. Reads RPC/keys from dashboard/.env.local, anchor/.env and
# cre/.env without printing them.
set -u
cd "$(dirname "$0")/.."
export ANCHOR_PROVIDER_URL="$(grep '^SOLANA_RPC=' ../dashboard/.env.local | cut -d= -f2-)"
export ANCHOR_WALLET="$HOME/.config/solana/id.json"
export NOWNODES_API_KEY="$(grep '^NOWNODES_PRIVATE_KEY=' .env | cut -d= -f2-)"
export EVM_SENDER_KEY="$(grep '^CRE_ETH_PRIVATE_KEY=' ../cre/.env | cut -d= -f2-)"
while true; do
  echo "== $(date +%H:%M:%S)"
  npx ts-node -P tsconfig.json --transpile-only scripts/relay-all.ts 2>&1 | sed "s/${NOWNODES_API_KEY}/<key>/g"
  sleep 60
done
