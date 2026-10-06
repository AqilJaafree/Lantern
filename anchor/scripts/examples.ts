/**
 * Record the Solana-track example transactions on Devnet: successful and
 * rejected mints, with a fresh attestation before each step.
 *
 *   yarn examples
 *
 * Writes deployments/devnet-examples.json with explorer links.
 */
import { BN } from "@coral-xyz/anchor";
import { getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import { Landed, Relayer, explorerTx, loadDeployment, loadKeypair } from "../client/relayer";

const MICRO = 1_000_000;
const tokens = (n: number) => new BN(Math.round(n * MICRO));
const EVM = tokens(2); // mirrored supply on the EVM chain (monitored, not gated)

interface Step {
  step: string;
  expect: "ok" | string;
  ok: boolean;
  errorCode?: string;
  signature: string;
  explorer: string;
}

async function main() {
  const deployment = loadDeployment("devnet");
  const attestor = loadKeypair(path.join(__dirname, "..", "keys", "attestor.json"));
  const relayer = new Relayer(deployment, attestor);
  const conn = relayer.provider.connection;
  const steps: Step[] = [];

  const supply = async () =>
    Number((await getMint(conn, relayer.mint, "confirmed", TOKEN_2022_PROGRAM_ID)).supply) / MICRO;

  async function record(step: string, expect: string, p: Promise<Landed>) {
    const res = await p;
    const pass = expect === "ok" ? res.ok : !res.ok && res.errorCode === expect;
    const s: Step = {
      step,
      expect,
      ok: res.ok,
      errorCode: res.errorCode,
      signature: res.signature,
      explorer: explorerTx(res.signature, deployment.cluster),
    };
    steps.push(s);
    console.log(`${pass ? "✔" : "✘"} ${step} -> ${res.ok ? "ok" : res.errorCode}`);
    console.log(`  ${s.explorer}`);
    if (!pass) throw new Error(`${step}: expected ${expect}, got ${res.ok ? "ok" : res.errorCode}`);
  }

  // Everything is relative to current supply so the script can be re-run.
  let s = await supply();
  console.log(`start supply ${s}`);

  // Healthy: backing leaves 10 tokens of headroom.
  const healthy = s + 12; // shares; cap = shares - EVM = s + 10
  await record("attest healthy", "ok", relayer.submit({ sharesHeld: tokens(healthy), splitNum: 1, splitDen: 1, otherChainSupply: EVM }));
  await record("mint within backing", "ok", relayer.mintTokens(tokens(5)));
  await record("mint past the cap", "ExceedsBacking", relayer.mintTokens(tokens(6)));

  // Custodian drain: cap falls below supply, program auto-pauses.
  s = await supply();
  await record("attest after drain", "ok", relayer.submit({ sharesHeld: tokens(s - 2), splitNum: 1, splitDen: 1, otherChainSupply: EVM }));
  await record("mint while auto-paused", "AutoPaused", relayer.mintTokens(tokens(1)));

  // Top-up: backing restored, minting resumes with no manual action.
  await record("attest after top-up", "ok", relayer.submit({ sharesHeld: tokens(s + 12), splitNum: 1, splitDen: 1, otherChainSupply: EVM }));
  await record("mint after recovery", "ok", relayer.mintTokens(tokens(1)));

  console.log(`end supply ${await supply()}`);

  const out = path.join(__dirname, "..", "deployments", "devnet-examples.json");
  fs.writeFileSync(
    out,
    JSON.stringify({ programId: deployment.programId, recordedAt: new Date().toISOString(), steps }, null, 2) + "\n"
  );
  console.log(`wrote ${path.relative(process.cwd(), out)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
