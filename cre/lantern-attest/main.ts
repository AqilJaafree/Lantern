/**
 * Lantern attestation workflow.
 *
 * Every run: read the (mock) custodian's holdings, read mirrored-token supply
 * on the EVM chain through NOWNodes, compute the Solana mint cap, and write a
 * DON-signed AttestationReport to the Lantern program's `on_report` through the
 * Keystone Forwarder. The program recomputes the cap from these inputs and
 * rejects any mismatch, so the workflow cannot sign an inflated cap.
 */
import {
  ConsensusAggregationByFields,
  CronCapability,
  HTTPClient,
  Runner,
  SolanaClient,
  SolanaTxStatus,
  bytesToBase64,
  consensusMedianAggregation,
  handler,
  identical,
  json,
  median,
  ok,
  solanaAccountMeta,
  type HTTPSendRequester,
  type Runtime,
} from "@chainlink/cre-sdk";
import { z } from "zod";
import { Lantern, type AttestationReport } from "./contracts/solana/ts/generated";

const configSchema = z.object({
  schedule: z.string(),
  /** MOCK custodian holdings endpoint (custodian/server.ts). */
  custodianUrl: z.string().regex(/^https?:\/\//),
  evm: z.object({
    /** NOWNodes EVM JSON-RPC endpoint; the API key comes from the NOWNODES_API_KEY secret. */
    rpcUrl: z.string().regex(/^https?:\/\//),
    /** Mirrored stock token on the EVM chain. Empty -> use sampleSupplyMicro (labeled sample). */
    tokenAddress: z.string(),
    decimals: z.number().int().min(0).max(36),
    sampleSupplyMicro: z.string().regex(/^\d+$/),
  }),
  solana: z.object({
    clusterId: z.number().int().min(0).max(255),
    forwarderState: z.string(),
    forwarderAuthority: z.string(),
    issuerConfig: z.string(),
    creConfig: z.string(),
    attestation: z.string(),
    mint: z.string(),
    tokenProgram: z.string(),
  }),
});
type Config = z.infer<typeof configSchema>;

/** Token decimals on Solana; holdings are micro-shares, so raw units line up 1:1 pre-split. */
const SOLANA_DECIMALS = 6;

// ---------- Custodian (MOCK) ----------

const holdingsSchema = z.object({
  micro_shares: z.string().regex(/^\d+$/),
  split_num: z.number().int().positive(),
  split_den: z.number().int().positive(),
});
type Holdings = { microShares: number; splitNum: number; splitDen: number };

const fetchHoldings = (sender: HTTPSendRequester, url: string): Holdings => {
  const res = sender.sendRequest({ url, method: "GET", cacheSettings: { store: false } }).result();
  if (!ok(res)) throw new Error(`custodian HTTP ${res.statusCode}`);
  const h = holdingsSchema.parse(json(res));
  const microShares = Number(h.micro_shares);
  if (!Number.isSafeInteger(microShares)) throw new Error("micro_shares exceeds safe integer range");
  return { microShares, splitNum: h.split_num, splitDen: h.split_den };
};

// ---------- EVM supply via NOWNodes ----------

const TOTAL_SUPPLY_SELECTOR = "0x18160ddd"; // totalSupply()

const fetchEvmSupplyMicro = (
  sender: HTTPSendRequester,
  rpcUrl: string,
  apiKey: string,
  token: string,
  decimals: number,
): bigint => {
  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to: token, data: TOTAL_SUPPLY_SELECTOR }, "finalized"],
  };
  const res = sender
    .sendRequest({
      url: rpcUrl,
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: bytesToBase64(new TextEncoder().encode(JSON.stringify(payload))),
      cacheSettings: { store: false },
    })
    .result();
  if (!ok(res)) throw new Error(`NOWNodes HTTP ${res.statusCode}`);
  const body = z.object({ result: z.string().regex(/^0x[0-9a-fA-F]*$/) }).parse(json(res));
  const raw = BigInt(body.result === "0x" ? "0x0" : body.result);
  // Normalize to 6 decimals, rounding UP so rounding never creates Solana capacity.
  if (decimals <= SOLANA_DECIMALS) return raw * 10n ** BigInt(SOLANA_DECIMALS - decimals);
  const scale = 10n ** BigInt(decimals - SOLANA_DECIMALS);
  return (raw + scale - 1n) / scale;
};

// ---------- Report ----------

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** Base58 for logging the Solana transaction signature (no Node/web3 in WASM). */
const bytesToBase58 = (bytes: Uint8Array): string => {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
};

/** Same rule the program enforces: floor(shares × den / num) − other chains, floored at 0. */
export const backedMaxSupply = (shares: bigint, num: bigint, den: bigint, other: bigint): bigint => {
  const backed = (shares * den) / num;
  return backed > other ? backed - other : 0n;
};

export const onCronTrigger = (runtime: Runtime<Config>): string => {
  const cfg = runtime.config;
  const http = new HTTPClient();

  const holdings = http
    .sendRequest(
      runtime,
      fetchHoldings,
      ConsensusAggregationByFields<Holdings>({ microShares: median, splitNum: identical, splitDen: identical }),
    )(cfg.custodianUrl)
    .result();

  let otherChainSupply: bigint;
  let evmSource: string;
  if (cfg.evm.tokenAddress) {
    const apiKey = runtime.getSecret({ id: "NOWNODES_API_KEY" }).result().value;
    otherChainSupply = http
      .sendRequest(runtime, fetchEvmSupplyMicro, consensusMedianAggregation<bigint>())(
        cfg.evm.rpcUrl,
        apiKey,
        cfg.evm.tokenAddress,
        cfg.evm.decimals,
      )
      .result();
    evmSource = `nownodes:${cfg.evm.tokenAddress}`;
  } else {
    otherChainSupply = BigInt(cfg.evm.sampleSupplyMicro);
    evmSource = "SAMPLE (no EVM token configured)";
  }

  const sharesHeld = BigInt(holdings.microShares);
  const splitNum = holdings.splitNum;
  const splitDen = holdings.splitDen;
  const maxSupply = backedMaxSupply(sharesHeld, BigInt(splitNum), BigInt(splitDen), otherChainSupply);

  // CRE cannot read Solana yet, so the onchain nonce is unknown here. The
  // program requires nonce and observed_at to strictly increase; DON time in
  // seconds satisfies both.
  const now = BigInt(Math.floor(runtime.now().getTime() / 1000));
  const report: AttestationReport = {
    clusterId: cfg.solana.clusterId,
    nonce: now,
    observedAt: now,
    sharesHeld,
    splitNum,
    splitDen,
    otherChainSupply,
    maxSupply,
  };

  runtime.log(
    `custodian(MOCK) micro_shares=${sharesHeld} split=${splitNum}/${splitDen} | ` +
      `evm supply(micro)=${otherChainSupply} [${evmSource}] | cap(micro)=${maxSupply}`,
  );

  // Keystone Forwarder layout: [forwarderState, forwarderAuthority, ...on_report receiver accounts].
  // Receiver accounts must match `OnReport` in programs/lantern/src/instructions/on_report.rs.
  const s = cfg.solana;
  const remainingAccounts = [
    solanaAccountMeta(s.forwarderState),
    solanaAccountMeta(s.forwarderAuthority),
    solanaAccountMeta(s.issuerConfig, true),
    solanaAccountMeta(s.creConfig),
    solanaAccountMeta(s.attestation, true),
    solanaAccountMeta(s.mint, true),
    solanaAccountMeta(s.tokenProgram),
  ];

  const lantern = new Lantern(new SolanaClient(SolanaClient.SUPPORTED_CHAIN_SELECTORS["solana-devnet"]));
  const reply = lantern.writeReportFromAttestationReport(runtime, report, remainingAccounts, {
    computeLimit: 300_000,
  });
  const sig = reply.txSignature ? bytesToBase58(reply.txSignature) : "none";
  runtime.log(
    `solana write: status=${SolanaTxStatus[reply.txStatus]} receiver=${reply.receiverContractExecutionStatus ?? "n/a"} tx=${sig}`,
  );
  // Fail closed: anything but a successful forwarder transaction is an error.
  if (reply.txStatus !== SolanaTxStatus.SUCCESS) {
    throw new Error(`Solana write failed: ${SolanaTxStatus[reply.txStatus]} ${reply.errorMessage ?? ""}`.trim());
  }

  return JSON.stringify({
    nonce: now.toString(),
    sharesHeld: sharesHeld.toString(),
    split: `${splitNum}/${splitDen}`,
    otherChainSupply: otherChainSupply.toString(),
    maxSupply: maxSupply.toString(),
    txStatus: SolanaTxStatus[reply.txStatus],
    txSignature: sig,
  });
};

export const initWorkflow = (config: Config) => [
  handler(new CronCapability().trigger({ schedule: config.schedule }), onCronTrigger),
];

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}
