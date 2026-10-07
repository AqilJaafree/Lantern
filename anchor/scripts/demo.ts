/**
 * X1: run the full Lantern demo scenario on Devnet, deterministically, for recording.
 *
 *   yarn demo            # pause before each beat (press Enter), attest via CRE --broadcast
 *   yarn demo --auto     # no pauses
 *   yarn demo --relayer  # attest via the Ed25519 relayer instead of CRE (faster fallback)
 *
 * Needs the mock custodian (bun custodian/server.ts) and, for CRE, cre/.env set up.
 * Every amount is relative to the current Solana supply, so the script can be re-run.
 * Writes deployments/devnet-demo-run.json with explorer links.
 */
import { BN } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID, getMint } from "@solana/spl-token";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { Landed, Relayer, explorerTx, loadDeployment, loadKeypair } from "../client/relayer";

const ROOT = path.join(__dirname, "..");
const REPO = path.join(ROOT, "..");
const MICRO = 1_000_000;
const CUSTODIAN = process.env.CUSTODIAN_URL ?? "http://localhost:8787";
const SEPOLIA_RPC = process.env.SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";
const SEPOLIA_TOKEN = "0xb41e1D98421BbD79d6D094e48DE9BFE01393e54C";
const CRE = process.env.CRE_BIN ?? path.join(process.env.HOME ?? "", ".cre/bin/cre");

const AUTO = process.argv.includes("--auto");
const VIA_RELAYER = process.argv.includes("--relayer");

const deployment = loadDeployment("devnet");
const relayer = new Relayer(deployment, loadKeypair(path.join(ROOT, "keys", "attestor.json")));
const conn = relayer.provider.connection;

interface Step {
  beat: string;
  expect: string;
  result: string;
  signature?: string;
  explorer?: string;
}
const steps: Step[] = [];

interface Holdings {
  micro_shares: string;
  split_num: number;
  split_den: number;
}

// ---------- helpers ----------

const tokens = (micro: number | bigint) => (Number(micro) / MICRO).toLocaleString("en-US", { maximumFractionDigits: 6 });

async function pause(title: string, narration: string) {
  console.log(`\n━━ ${title}\n   ${narration}`);
  if (AUTO || !process.stdin.isTTY) return;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((r) => rl.question("   [Enter] to run ", () => (rl.close(), r())));
}

async function solanaSupply(): Promise<bigint> {
  return (await getMint(conn, relayer.mint, "confirmed", TOKEN_2022_PROGRAM_ID)).supply;
}

/** Mirror token supply on Sepolia at the finalized block (what CRE reads), in micro units, rounded up. */
async function evmSupply(): Promise<bigint> {
  const res = await fetch(SEPOLIA_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: SEPOLIA_TOKEN, data: "0x18160ddd" }, "finalized"] }),
  });
  const raw = BigInt(((await res.json()) as { result: string }).result);
  const scale = 10n ** 12n;
  return (raw + scale - 1n) / scale;
}

async function custodian(action: string, body: object = {}) {
  const res = await fetch(`${CUSTODIAN}/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`custodian /${action}: HTTP ${res.status} ${await res.text()}`);
  const h = (await res.json()) as Holdings;
  console.log(`   custodian (MOCK): ${tokens(BigInt(h.micro_shares))} shares, split ${h.split_num}/${h.split_den}`);
  return h;
}

function record(beat: string, expect: string, landed: Landed) {
  const result = landed.ok ? "ok" : landed.errorCode ?? "failed";
  const pass = expect === result;
  const explorer = explorerTx(landed.signature, deployment.cluster);
  steps.push({ beat, expect, result, signature: landed.signature, explorer });
  console.log(`   ${pass ? "✔" : "✘"} ${result}  ${explorer}`);
  if (!pass) throw new Error(`${beat}: expected ${expect}, got ${result}`);
}

/** Attest the custodian's current holdings: CRE workflow broadcast (default) or the relayer. */
async function attest(beat: string) {
  if (VIA_RELAYER) {
    const h = (await (await fetch(`${CUSTODIAN}/holdings`)).json()) as Holdings;
    const res = await relayer.submit({
      sharesHeld: new BN(h.micro_shares),
      splitNum: h.split_num,
      splitDen: h.split_den,
      otherChainSupply: new BN((await evmSupply()).toString()),
    });
    return record(beat, "ok", res);
  }
  for (let attempt = 1; ; attempt++) {
    try {
      return await creAttestOnce(beat);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt >= 3 || !/429|Too Many Requests/i.test(msg)) throw e;
      console.log(`   public RPC rate-limited CRE (attempt ${attempt}); retrying in 15s…`);
      await new Promise((r) => setTimeout(r, 15_000));
    }
  }
}

async function creAttestOnce(beat: string) {
  console.log("   running CRE workflow (simulate --broadcast)…");
  let out: string;
  try {
    out = execFileSync(
      CRE,
      ["workflow", "simulate", "lantern-attest", "--target", "staging-settings", "--non-interactive", "--trigger-index", "0", "--broadcast"],
      { cwd: path.join(REPO, "cre"), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (e: any) {
    out = `${String(e.stdout ?? "")}${String(e.stderr ?? "")}`;
    // Under public-RPC rate limits the CLI can time out waiting for a tx that did land.
    const pending = out.match(/unable to find transaction within timeout \(sig: (\w+)\)/)?.[1];
    if (pending) return confirmLanded(beat, pending);
    throw new Error(`CRE run failed:\n${out}`.slice(-2000));
  }
  const log = out.match(/\[USER LOG\] custodian\(MOCK\).*$/m)?.[0];
  if (log) console.log(`   ${log.replace(/^.*\[USER LOG\] /, "CRE: ")}`);
  const sig = out.match(/solana write: status=SUCCESS .*tx=(\w+)/)?.[1];
  if (!sig || sig === "none") throw new Error(`CRE did not land a transaction:\n${out.slice(-1500)}`);
  record(beat, "ok", { signature: sig, ok: true });
}

/** Confirm a CRE transaction ourselves; record it only if it succeeded onchain. */
async function confirmLanded(beat: string, sig: string) {
  console.log(`   CLI timed out confirming ${sig.slice(0, 8)}…, checking onchain`);
  for (let i = 0; i < 20; i++) {
    const st = (await conn.getSignatureStatuses([sig], { searchTransactionHistory: true })).value[0];
    if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") {
      if (st.err) throw new Error(`${beat}: CRE tx ${sig} failed onchain: ${JSON.stringify(st.err)}`);
      return record(beat, "ok", { signature: sig, ok: true });
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`${beat}: CRE tx ${sig} not found onchain`);
}

async function state() {
  const cfg = await relayer.program.account.issuerConfig.fetch(relayer.issuer);
  const att = await relayer.program.account.attestation.fetch(relayer.attestation);
  const s = await solanaSupply();
  console.log(
    `   onchain: supply ${tokens(s)} · cap ${tokens(BigInt(att.maxSupply.toString()))} · ` +
      `${cfg.autoPaused ? "AUTO-PAUSED" : cfg.adminPaused ? "ADMIN-PAUSED" : "minting enabled"}`,
  );
  return { supply: s, cap: BigInt(att.maxSupply.toString()), autoPaused: cfg.autoPaused };
}

// ---------- scenario ----------

async function main() {
  console.log(`Lantern demo · Devnet · attest via ${VIA_RELAYER ? "relayer (Ed25519)" : "Chainlink CRE (forwarder)"}`);
  await fetch(`${CUSTODIAN}/holdings`).catch(() => {
    throw new Error(`mock custodian not reachable at ${CUSTODIAN} — start it with: bun custodian/server.ts`);
  });

  const E = await evmSupply();
  let S = await solanaSupply();
  console.log(`   Sepolia mirror supply ${tokens(E)} · Solana supply ${tokens(S)}`);

  // 0. One-time setup: bring total supply to ~100 so 102 shares reads as ~102%.
  const target = 98n * BigInt(MICRO);
  if (S < target) {
    await pause("Setup", `Mint Solana supply up to 98 (one time) so the demo opens at ~102% backing.`);
    await custodian("set", { shares: Number(target + E + 4n * BigInt(MICRO)) / MICRO });
    await attest("setup attestation");
    record("setup mint", "ok", await relayer.mintTokens(new BN((target - S).toString())));
    S = await solanaSupply();
  }

  // 1. Healthy: shares = supply + EVM + 2  (≈102%), cap = supply + 2.
  const healthy = Number(S + E) / MICRO + 2;
  await pause("1 · Healthy", `Custodian holds ${healthy} shares for ${tokens(S + E)} tokens across Solana + Sepolia (~102%).`);
  await custodian("set", { shares: healthy, num: 1, den: 1 });
  await attest("attest healthy");
  await state();

  await pause("2 · Mint succeeds", "Mint 1 xAAPL within attested backing.");
  record("mint within backing", "ok", await relayer.mintTokens(new BN(MICRO)));
  await state();

  await pause("3 · Custodian drain", "Custodian loses 5 shares. CRE attests the shortfall and Lantern auto-pauses.");
  await custodian("drain", { shares: 5 });
  await attest("attest shortfall");
  const drained = await state();
  if (!drained.autoPaused) throw new Error("expected auto-pause after drain");

  await pause("4 · Mint blocked onchain", "Try to mint 1 xAAPL while backing is short.");
  record("mint while unbacked", "AutoPaused", await relayer.mintTokens(new BN(MICRO)));

  await pause("5 · Top-up and recovery", "Custodian adds 6 shares. CRE attests, minting resumes with no manual action.");
  await custodian("topup", { shares: 6 });
  await attest("attest recovery");
  await state();
  record("mint after recovery", "ok", await relayer.mintTokens(new BN(MICRO)));
  await state();

  await pause("6 · 2-for-1 split", "Shares double, but they belong to existing holders: displayed balances double, mint capacity does not.");
  await custodian("split", { num: 2, den: 1 });
  await attest("attest split");
  const after = await state();
  const mintInfo = await getMint(conn, relayer.mint, "confirmed", TOKEN_2022_PROGRAM_ID);
  const { getScaledUiAmountConfig } = await import("@solana/spl-token");
  console.log(`   Token-2022 UI multiplier: ×${getScaledUiAmountConfig(mintInfo)?.multiplier ?? "n/a"}`);
  const overMint = after.cap - after.supply + 10n * BigInt(MICRO); // only fits if the split had added capacity
  record("mint against split shares", "ExceedsBacking", await relayer.mintTokens(new BN(overMint.toString())));

  const out = path.join(ROOT, "deployments", "devnet-demo-run.json");
  fs.writeFileSync(
    out,
    JSON.stringify({ programId: deployment.programId, attestedVia: VIA_RELAYER ? "relayer" : "cre", recordedAt: new Date().toISOString(), steps }, null, 2) + "\n",
  );
  console.log(`\n✔ Demo complete. Wrote ${path.relative(process.cwd(), out)}`);
}

main().catch((e) => {
  console.error(`\n✘ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
