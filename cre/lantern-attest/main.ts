/**
 * Lantern attestation workflow.
 *
 * Every run: read the (mock) custodian's holdings over HTTP, read the mirror
 * token's totalSupply on Ethereum Sepolia with EVMClient (simulation RPC is
 * NOWNodes, set in project.yaml), compute the Solana mint cap, and write a
 * DON-signed AttestationReport to the Lantern program's `on_report` through the
 * Keystone Forwarder. The program recomputes the cap from these inputs and
 * rejects any mismatch, so the workflow cannot sign an inflated cap.
 */
import {
  ConsensusAggregationByFields,
  CronCapability,
  EVMClient,
  HTTPClient,
  LAST_FINALIZED_BLOCK_NUMBER,
  Runner,
  SolanaClient,
  SolanaTxStatus,
  bytesToHex,
  encodeCallMsg,
  getNetwork,
  handler,
  identical,
  json,
  median,
  ok,
  solanaAccountMeta,
  type HTTPSendRequester,
  type Runtime,
} from "@chainlink/cre-sdk";
import { decodeFunctionResult, encodeFunctionData, parseAbi, zeroAddress, type Address } from "viem";
import { z } from "zod";
import { Lantern, type AttestationReport } from "./contracts/solana/ts/generated";

const configSchema = z.object({
  schedule: z.string(),
  /** MOCK custodian holdings endpoint (custodian/server.ts). */
  custodianUrl: z.string().regex(/^https?:\/\//),
  evm: z.object({
    /** CRE chain selector name, e.g. ethereum-testnet-sepolia (RPC comes from project.yaml). */
    chainSelectorName: z.string(),
    /** Mirror token (evm/src/MirrorToken.sol). Empty -> use sampleSupplyMicro (labeled sample). */
    tokenAddress: z.string().regex(/^(0x[0-9a-fA-F]{40})?$/),
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

// ---------- EVM supply via EVMClient ----------

const erc20Abi = parseAbi(["function totalSupply() view returns (uint256)"]);

/** Raw totalSupply at the last finalized block. */
const readEvmTotalSupply = (runtime: Runtime<Config>): bigint => {
  const { chainSelectorName, tokenAddress } = runtime.config.evm;
  const network = getNetwork({ chainFamily: "evm", chainSelectorName });
  if (!network) throw new Error(`Unknown selector: ${chainSelectorName}`);
  const client = new EVMClient(network.chainSelector.selector);
  const reply = client
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: tokenAddress as Address,
        data: encodeFunctionData({ abi: erc20Abi, functionName: "totalSupply" }),
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();
  return decodeFunctionResult({ abi: erc20Abi, functionName: "totalSupply", data: bytesToHex(reply.data) });
};

/** Normalize to Solana's 6 decimals, rounding UP so rounding never creates Solana capacity. */
export const toMicro = (raw: bigint, decimals: number): bigint => {
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
    otherChainSupply = toMicro(readEvmTotalSupply(runtime), cfg.evm.decimals);
    evmSource = `evm:${cfg.evm.chainSelectorName}:${cfg.evm.tokenAddress}`;
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
