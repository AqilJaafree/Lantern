#!/usr/bin/env bash
# Deploy LanternGate on Robinhood Chain testnet and wire it into the coordinator,
# the CRE workflow configs, and the dashboard. Needs testnet ETH on the deployer
# (CRE_ETH_PRIVATE_KEY in cre/.env). Prints no secrets.
set -euo pipefail
cd "$(dirname "$0")/.."
RPC=https://rpc.testnet.chain.robinhood.com
KEY="$(grep '^CRE_ETH_PRIVATE_KEY=' cre/.env | cut -d= -f2-)"
ME="$(cast wallet address --private-key "$KEY")"
BAL="$(cast balance "$ME" --rpc-url $RPC)"
[ "$BAL" = "0" ] && { echo "Deployer $ME has 0 ETH on Robinhood testnet — fund it first."; exit 1; }
ATT="$(python3 -c "import json;print(json.load(open('anchor/keys/evm-attestor.json'))['address'])")"
GATE="$(cd evm && forge create src/LanternGate.sol:LanternGate --rpc-url $RPC --private-key "$KEY" --broadcast \
  --constructor-args "Lantern xAAPL (Robinhood gate)" "$ATT" 180 2>&1 | awk '/Deployed to/{print $3}')"
[ -n "$GATE" ] || { echo "deploy failed"; exit 1; }
echo "Robinhood gate: $GATE"
python3 - "$GATE" <<'PY'
import json, sys
gate = sys.argv[1]
p = "anchor/deployments/chains.json"; d = json.load(open(p)); d["evm"]["robinhood"]["gate"] = gate
json.dump(d, open(p, "w"), indent=2); open(p, "a").write("\n")
for env in ("staging", "production"):
    p = f"cre/lantern-attest/config.{env}.json"; d = json.load(open(p))
    d["gates"] = [g for g in d["gates"] if g["name"] != "robinhood"] + [
        {"name": "robinhood", "address": gate, "rpcUrl": "https://rpc.testnet.chain.robinhood.com"}]
    json.dump(d, open(p, "w"), indent=2); open(p, "a").write("\n")
p = "dashboard/.env.local"; lines = [l for l in open(p).read().splitlines() if not l.startswith("NEXT_PUBLIC_ROBINHOOD_GATE=")]
lines.append(f"NEXT_PUBLIC_ROBINHOOD_GATE={gate}"); open(p, "w").write("\n".join(lines) + "\n")
print("wired into chains.json, CRE configs, dashboard/.env.local (restart the dashboard)")
PY
