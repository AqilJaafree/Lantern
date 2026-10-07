/**
 * Multichain attestation coordinator: Solana + Sepolia + Robinhood testnet.
 *
 *   yarn relay-all            # one round
 *   yarn relay-all --dry-run  # compute and print, send nothing
 *
 * Reads the (mock) custodian and every chain's supply, splits the backing into
 * per-chain caps (client/allocation.ts, Σ caps ≤ backed), then submits the
 * attestations with decreases first and increases second, so the caps are never
 * over-allocated even between transactions.
 *
 * Env: ANCHOR_PROVIDER_URL (Solana Devnet RPC), NOWNODES_API_KEY (Sepolia via
 * NOWNodes), EVM_SENDER_KEY (pays EVM gas), ROBINHOOD_RPC (optional override).
 * The EVM attestor key is keys/evm-attestor.json (gitignored).
 */
import { BN } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID, getMint } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbi,
  toBytes,
  type Address,
  type Chain,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { allocate, backedAmount } from "../client/allocation";
import { Relayer, explorerTx, loadDeployment, loadKeypair } from "../client/relayer";

const ROOT = path.join(__dirname, "..");
const DRY = process.argv.includes("--dry-run");
const CUSTODIAN = process.env.CUSTODIAN_URL ?? "http://localhost:8787";
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "deployments", "chains.json"), "utf8"));

const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
});

const gateAbi = parseAbi([
  "function totalSupply() view returns (uint256)",
  "function cap() view returns (uint256)",
  "function nonce() view returns (uint64)",
  "function observedAt() view returns (uint64)",
  "function submitAttestation(uint256 cap, uint64 nonce, uint64 observedAt, bytes sig)",
]);
const DOMAIN = keccak256(toBytes("LANTERN_EVM_ATTEST01"));

function rpcUrl(spec: string): string {
  if (spec.startsWith("nownodes:")) {
    const key = process.env.NOWNODES_API_KEY;
    if (!key) throw new Error("NOWNODES_API_KEY is required for NOWNodes RPC");
    return `${spec.slice("nownodes:".length)}/${key}`;
  }
  return spec;
}

interface EvmChain {
  name: "sepolia" | "robinhood";
  chain: Chain;
  gate: Address | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- viem's chain generics differ per chain
  client: any;
  rpc: string;
}

const evmChains: EvmChain[] = (["sepolia", "robinhood"] as const).map((name) => {
  const c = cfg.evm[name];
  const rpc = name === "robinhood" && process.env.ROBINHOOD_RPC ? process.env.ROBINHOOD_RPC : rpcUrl(c.rpc);
  const chain = name === "sepolia" ? sepolia : robinhoodTestnet;
  return { name, chain, gate: c.gate, rpc, client: createPublicClient({ chain, transport: http(rpc) }) };
});

const MICRO = 1_000_000;
const fmt = (v: bigint) => (Number(v) / MICRO).toLocaleString("en-US", { maximumFractionDigits: 6 });

async function main() {
  const deployment = loadDeployment("devnet");
  const relayer = new Relayer(deployment, loadKeypair(path.join(ROOT, "keys", "attestor.json")));
  const attestor = privateKeyToAccount(JSON.parse(fs.readFileSync(path.join(ROOT, "keys", "evm-attestor.json"), "utf8")).privateKey as Hex);
  if (attestor.address.toLowerCase() !== String(cfg.evmAttestor).toLowerCase()) throw new Error("EVM attestor key mismatch");

  // 1. Observe.
  const h = (await (await fetch(`${CUSTODIAN}/holdings`)).json()) as { micro_shares: string; split_num: number; split_den: number };
  const shares = BigInt(h.micro_shares);
  const backed = backedAmount(shares, BigInt(h.split_num), BigInt(h.split_den));

  const solSupply = (await getMint(relayer.provider.connection, relayer.mint, "confirmed", TOKEN_2022_PROGRAM_ID)).supply;
  const evmSupply: Record<string, bigint> = {};
  for (const c of evmChains) {
    evmSupply[c.name] = c.gate ? ((await c.client.readContract({ address: c.gate, abi: gateAbi, functionName: "totalSupply" })) as bigint) : 0n;
  }
  const legacyRaw = (await evmChains[0].client.readContract({
    address: cfg.legacy.token,
    abi: gateAbi,
    functionName: "totalSupply",
    blockTag: "finalized",
  })) as bigint;
  const scale = 10n ** BigInt(cfg.legacy.decimals - 6);
  const legacy = (legacyRaw + scale - 1n) / scale;

  // 2. Allocate (chains without a deployed gate get no allocation).
  const active = [
    { name: "solana", supply: solSupply, weight: cfg.weights.solana },
    ...evmChains.filter((c) => c.gate).map((c) => ({ name: c.name, supply: evmSupply[c.name], weight: cfg.weights[c.name] })),
  ];
  const a = allocate(backed, legacy, active);

  console.log(
    `custodian(MOCK) ${fmt(shares)} sh, split ${h.split_num}/${h.split_den} → backed ${fmt(backed)} | legacy Sepolia mirror ${fmt(legacy)} | avail ${fmt(a.avail)} | ${a.healthy ? "healthy" : "SHORTFALL"}`,
  );
  for (const c of active) console.log(`  ${c.name.padEnd(9)} supply ${fmt(c.supply).padStart(10)} → cap ${fmt(a.caps[c.name])}`);
  if (DRY) return;

  // 3. Current caps, so decreases go first.
  const att = await relayer.program.account.attestation.fetch(relayer.attestation);
  const current: Record<string, bigint> = { solana: BigInt(att.maxSupply.toString()) };
  for (const c of evmChains) {
    if (c.gate) current[c.name] = (await c.client.readContract({ address: c.gate, abi: gateAbi, functionName: "cap" })) as bigint;
  }
  const order = active.map((c) => c.name).sort((x, y) => Number(a.caps[x] - current[x] > 0n) - Number(a.caps[y] - current[y] > 0n));

  const sender = privateKeyToAccount(process.env.EVM_SENDER_KEY as Hex);
  const now = BigInt(Math.floor(Date.now() / 1000));
  for (const name of order) {
    if (name === "solana") {
      const res = await relayer.submit({
        sharesHeld: new BN(shares.toString()),
        splitNum: h.split_num,
        splitDen: h.split_den,
        otherChainSupply: new BN((backed - a.caps.solana).toString()),
      });
      console.log(`  solana    ${res.ok ? "ok" : "FAILED " + (res.errorCode ?? "")} ${explorerTx(res.signature, "devnet")}`);
      continue;
    }
    const c = evmChains.find((e) => e.name === name)!;
    const prevNonce = (await c.client.readContract({ address: c.gate!, abi: gateAbi, functionName: "nonce" })) as bigint;
    const prevObs = (await c.client.readContract({ address: c.gate!, abi: gateAbi, functionName: "observedAt" })) as bigint;
    const nonce = now > prevNonce ? now : prevNonce + 1n;
    const observedAt = now > prevObs ? now : prevObs + 1n;
    const digest = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "uint64" }, { type: "uint64" }, { type: "uint256" }],
        [DOMAIN, BigInt(c.chain.id), c.gate!, nonce, observedAt, a.caps[name]],
      ),
    );
    const sig = await attestor.signMessage({ message: { raw: digest } });
    const wallet = createWalletClient({ account: sender, chain: c.chain, transport: http(c.rpc) });
    const hash = await (wallet as any).writeContract({ address: c.gate!, abi: gateAbi, functionName: "submitAttestation", args: [a.caps[name], nonce, observedAt, sig] });
    const rcpt = await c.client.waitForTransactionReceipt({ hash });
    console.log(`  ${name.padEnd(9)} ${rcpt.status === "success" ? "ok" : "FAILED"} ${cfg.evm[name].explorer}/tx/${hash}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
