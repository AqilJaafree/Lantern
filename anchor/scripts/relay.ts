/**
 * Relay one attestation (the CRE fallback path from PRD 5.3).
 *
 *   yarn relay --shares 102 --evm 2 [--split 2/1]
 *
 * --shares and --evm are whole shares/tokens (decimals allowed); they are
 * converted to 6-decimal raw units. --split is the cumulative split factor.
 */
import { BN } from "@coral-xyz/anchor";
import * as path from "path";
import { Relayer, explorerTx, loadDeployment, loadKeypair } from "../client/relayer";

const MICRO = 1_000_000;

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

const micro = (v: string) => new BN(Math.round(Number(v) * MICRO));

async function main() {
  const [splitNum, splitDen] = arg("split", "1/1").split("/").map(Number);
  const deployment = loadDeployment(arg("cluster", "devnet"));
  const attestor = loadKeypair(path.join(__dirname, "..", "keys", "attestor.json"));
  const relayer = new Relayer(deployment, attestor);

  const res = await relayer.submit({
    sharesHeld: micro(arg("shares")),
    splitNum,
    splitDen,
    otherChainSupply: micro(arg("evm", "0")),
  });
  const r = res.report;
  console.log(
    `nonce ${r.nonce} shares ${r.sharesHeld.toNumber() / MICRO} split ${r.splitNum}/${r.splitDen} ` +
      `evm ${r.otherChainSupply.toNumber() / MICRO} -> cap ${r.maxSupply.toNumber() / MICRO}`
  );
  console.log(res.ok ? "ok" : `FAILED ${res.errorCode ?? ""}`, explorerTx(res.signature, deployment.cluster));
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
