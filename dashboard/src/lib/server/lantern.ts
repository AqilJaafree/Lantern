import "server-only";
import { BorshAccountsCoder, BorshCoder, type Idl } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID, getMint, getScaledUiAmountConfig } from "@solana/spl-token";
import { Connection, PublicKey, type VersionedTransactionResponse } from "@solana/web3.js";
import idl from "@/lib/lantern-idl.json";
import { EVM_GATES, FORWARDERS, LANTERN, SEPOLIA, SOLANA_RPC_SERVER } from "@/lib/config";
import type { Health, HistoryItem, LanternState } from "@/lib/types";

/** Primary, then fallback on rate limits: public Devnet RPCs throttle per IP. */
const RPCS = [SOLANA_RPC_SERVER, "https://solana-devnet.api.onfinality.io/public"]
  .filter((u, i, all) => all.indexOf(u) === i)
  .map((u) => new Connection(u, { commitment: "confirmed", disableRetryOnRateLimit: true }));

const isRateLimit = (e: unknown) => /429|rate limit|Too many requests/i.test(e instanceof Error ? e.message : String(e));

/** Circuit breaker: after a 429, leave that RPC alone for a while so the
 * per-IP limit can recover instead of being extended by every poll. */
const COOLDOWN_MS = 30_000;
const coolUntil = new Map<Connection, number>();

async function withRpc<T>(fn: (c: Connection) => Promise<T>): Promise<T> {
  let last: unknown = new Error("All Devnet RPCs are rate-limited; retrying shortly");
  for (const c of RPCS) {
    if ((coolUntil.get(c) ?? 0) > Date.now()) continue;
    try {
      return await fn(c);
    } catch (e) {
      last = e;
      if (!isRateLimit(e)) throw e;
      coolUntil.set(c, Date.now() + COOLDOWN_MS);
    }
  }
  throw last;
}
const accounts = new BorshAccountsCoder(idl as Idl);
const coder = new BorshCoder(idl as Idl);

/** Decode every Anchor event in the logs, including ones emitted inside a CPI
 * (CRE reports reach Lantern through the Keystone Forwarder). */
function decodeEvents(logs: string[]) {
  return logs
    .filter((l) => l.startsWith("Program data: "))
    .map((l) => {
      try {
        return coder.events.decode(l.slice("Program data: ".length));
      } catch {
        return null;
      }
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);
}

const SOLANA_DECIMALS = 6;

/** Fetch with a timeout so one slow upstream can't hang the dashboard. */
async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

async function readCustodian(): Promise<LanternState["custodian"]> {
  const base = process.env.CUSTODIAN_URL ?? "http://localhost:8787";
  try {
    const res = await fetchWithTimeout(`${base}/holdings`, {}, 3000);
    if (!res.ok) return null;
    const h = await res.json();
    return { microShares: String(h.micro_shares), splitNum: h.split_num, splitDen: h.split_den, asOf: h.as_of };
  } catch {
    return null;
  }
}

/** Mirror token totalSupply on Sepolia through NOWNodes (key stays server-side). */
async function readEvmSupply(): Promise<LanternState["evm"]> {
  const key = process.env.NOWNODES_API_KEY;
  if (!key) return { error: "NOWNODES_API_KEY not set" };
  try {
    const res = await fetchWithTimeout(SEPOLIA.rpc, {
      method: "POST",
      headers: { "content-type": "application/json", "api-key": key },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: SEPOLIA.token, data: "0x18160ddd" }, "finalized"],
      }),
    });
    const body = await res.json();
    if (!res.ok || typeof body.result !== "string") return { error: body.error?.message ?? `HTTP ${res.status}` };
    const raw = BigInt(body.result === "0x" ? 0 : body.result);
    const scale = 10n ** BigInt(SEPOLIA.decimals - SOLANA_DECIMALS);
    const supply = (raw + scale - 1n) / scale; // round up, same as the CRE workflow
    return { supply: supply.toString(), rawSupply: raw.toString(), source: "Ethereum Sepolia via NOWNodes (finalized)" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "NOWNodes request failed" };
  }
}

const big = (v: unknown) => BigInt(String(v));

async function ethCall(rpc: string, headers: Record<string, string>, to: string, data: string): Promise<bigint> {
  const res = await fetchWithTimeout(rpc, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
  });
  const body = await res.json();
  if (typeof body.result !== "string") throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  return BigInt(body.result === "0x" ? 0 : body.result);
}

/** Lantern gates on EVM chains: Sepolia via NOWNodes, Robinhood testnet via its RPC. */
async function readGates(): Promise<LanternState["gates"]> {
  const now = Math.floor(Date.now() / 1000);
  return Promise.all(
    EVM_GATES.map(async (g) => {
      const base = { name: g.name, label: g.label, chainId: g.chainId, gate: g.gate, via: g.via, explorer: g.explorer };
      if (!g.gate) return { ...base, supply: null, cap: null, observedAt: null, fresh: false, error: "Gate not deployed yet" };
      const key = process.env.NOWNODES_API_KEY;
      // Sepolia: NOWNodes first, public RPC as a labeled fallback. Robinhood: its public RPC.
      const sources: [string, Record<string, string>, string][] =
        g.name === "sepolia" && key
          ? [[SEPOLIA.rpc, { "api-key": key }, "NOWNodes"], [g.publicRpc, {}, "public RPC (NOWNodes timed out)"]]
          : [[g.publicRpc, {}, g.via]];
      let last: unknown;
      for (const [rpc, headers, via] of sources) {
        try {
          const [supply, cap, observedAt] = await Promise.all([
            ethCall(rpc, headers, g.gate, "0x18160ddd"), // totalSupply()
            ethCall(rpc, headers, g.gate, "0x355274ea"), // cap()
            ethCall(rpc, headers, g.gate, "0x9be7dadb"), // observedAt()
          ]);
          const obs = Number(observedAt);
          return { ...base, via, supply: supply.toString(), cap: cap.toString(), observedAt: obs, fresh: obs > 0 && now - obs <= 180 };
        } catch (e) {
          last = e;
        }
      }
      return { ...base, supply: null, cap: null, observedAt: null, fresh: false, error: last instanceof Error ? last.message : "read failed" };
    }),
  );
}

let lastState: LanternState | null = null;
let inflight: Promise<LanternState> | null = null;

/** Cached for 3s, concurrent callers share one RPC round, and on RPC failure the
 * last good state is served (flagged `cached`) instead of an error. */
export async function readState(): Promise<LanternState> {
  if (lastState && Date.now() - lastState.fetchedAt < 3000) return lastState;
  inflight ??= loadState()
    .then((s) => (lastState = s))
    .catch((e) => {
      if (lastState) return { ...lastState, cached: true };
      throw e;
    })
    .finally(() => (inflight = null));
  return inflight;
}

async function loadState(): Promise<LanternState> {
  const [infos, mint, custodian, evm, gates] = await Promise.all([
    withRpc((c) => c.getMultipleAccountsInfo([new PublicKey(LANTERN.issuerConfig), new PublicKey(LANTERN.attestation)])),
    withRpc((c) => getMint(c, new PublicKey(LANTERN.mint), "confirmed", TOKEN_2022_PROGRAM_ID)),
    readCustodian(),
    readEvmSupply(),
    readGates(),
  ]);
  const [cfgInfo, attInfo] = infos;
  if (!cfgInfo || !attInfo) throw new Error("Lantern accounts not found on Devnet");

  const cfg = accounts.decode("IssuerConfig", cfgInfo.data);
  const att = accounts.decode("Attestation", attInfo.data);

  const now = Math.floor(Date.now() / 1000);
  const observedAt = Number(att.observed_at.toString());
  const ageSecs = Math.max(0, now - observedAt);
  const stalenessSecs = Number(cfg.staleness_secs);
  const fresh = Number(att.nonce.toString()) > 0 && ageSecs <= stalenessSecs;

  const supply = mint.supply;
  const evmSupply = "supply" in evm ? BigInt(evm.supply) : 0n;
  const gatedSupply = gates.reduce((a, g) => a + (g.supply ? BigInt(g.supply) : 0n), 0n);
  const total = supply + evmSupply + gatedSupply;

  const live = custodian !== null;
  const shares = live ? BigInt(custodian.microShares) : big(att.shares_held);
  const num = BigInt(live ? custodian.splitNum : att.split_num);
  const den = BigInt(live ? custodian.splitDen : att.split_den);
  const backed = (shares * den) / num;

  const ratioBps = total === 0n ? null : Number((backed * 10_000n) / total);
  const health: Health =
    ratioBps === null || ratioBps >= 10_100 ? "healthy" : ratioBps >= 10_000 ? "warning" : "breached";

  const blockers: string[] = [];
  if (cfg.admin_paused) blockers.push("Paused by admin");
  if (cfg.auto_paused) blockers.push("Auto-paused: supply exceeds attested backing");
  if (!fresh) blockers.push(`Attestation stale (${ageSecs}s old, window ${stalenessSecs}s)`);

  const scaled = getScaledUiAmountConfig(mint);

  return {
    fetchedAt: Date.now(),
    solana: {
      supply: supply.toString(),
      uiMultiplier: scaled ? Number(scaled.multiplier) : null,
      autoPaused: cfg.auto_paused,
      adminPaused: cfg.admin_paused,
      stalenessSecs,
      minter: cfg.minter.toBase58(),
      attestor: cfg.attestor.toBase58(),
    },
    attestation: {
      nonce: att.nonce.toString(),
      observedAt,
      ageSecs,
      fresh,
      sharesHeld: att.shares_held.toString(),
      splitNum: att.split_num,
      splitDen: att.split_den,
      otherChainSupply: att.other_chain_supply.toString(),
      maxSupply: att.max_supply.toString(),
    },
    custodian,
    evm,
    gates,
    backing: {
      backed: backed.toString(),
      basis: live ? "custodian (live, mock)" : "last attestation",
      total: total.toString(),
      ratioBps,
      health,
    },
    mintingEnabled: blockers.length === 0,
    blockers,
  };
}

const fmt = (raw: unknown) => (Number(String(raw)) / 10 ** SOLANA_DECIMALS).toLocaleString("en-US", { maximumFractionDigits: 6 });

/** Recent Lantern activity, decoded from program events in each transaction's logs. */
/** Confirmed transactions never change, so each is fetched from the RPC once. */
const txCache = new Map<string, VersionedTransactionResponse | null>();

async function getTransactionsCached(signatures: string[], maxNew = 3) {
  // The public Devnet RPC rate-limits getTransaction per call type, so fetch a few
  // new ones per request, one at a time; the rest fill in on later polls.
  const missing = signatures.filter((s) => !txCache.has(s)).slice(0, maxNew);
  for (const sig of missing) {
    try {
      const tx = await withRpc((c) => c.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }));
      if (tx) txCache.set(sig, tx);
    } catch {
      break; // rate limited: stop and retry on the next poll
    }
  }
  return signatures.map((s) => txCache.get(s) ?? null);
}

export async function readHistory(limit = 20): Promise<HistoryItem[]> {
  const sigs = await withRpc((c) => c.getSignaturesForAddress(new PublicKey(LANTERN.issuerConfig), { limit }));
  const txs = await getTransactionsCached(sigs.map((s) => s.signature));

  return sigs.flatMap((s, i): HistoryItem[] => (txs[i] ? [toItem(s, txs[i]!)] : []));
}

function toItem(
  s: { signature: string; slot: number; blockTime?: number | null; err: unknown },
  tx: VersionedTransactionResponse,
): HistoryItem {
  {
    const logs = tx?.meta?.logMessages ?? [];
    const keys = tx?.transaction.message.staticAccountKeys?.map((k) => k.toBase58()) ?? [];
    const forwarder = keys.find((k) => FORWARDERS[k]);
    const isMint = logs.some((l) => l.includes("Instruction: MintGated"));
    const path = forwarder
      ? FORWARDERS[forwarder]
      : keys.includes("Ed25519SigVerify111111111111111111111111111")
        ? "Relayer (Ed25519)"
        : isMint
          ? "Minter wallet"
          : "Admin";
    const base = { signature: s.signature, slot: s.slot, time: s.blockTime ?? null, path };

    if (s.err) {
      const code = logs.join("\n").match(/Error Code: (\w+)/)?.[1] ?? "Transaction failed";
      const what = isMint ? "Mint rejected" : "Rejected";
      return { ...base, kind: "failed", summary: what, error: code };
    }

    const events = decodeEvents(logs);
    const att = events.find((e) => e.name === "AttestationSubmitted" || e.name === "attestationSubmitted");
    const mint = events.find((e) => e.name === "Minted" || e.name === "minted");
    const split = events.find((e) => e.name === "CorporateAction" || e.name === "corporateAction");
    const pause = events.find((e) => e.name === "PauseChanged" || e.name === "pauseChanged");
    const minterChange = events.find((e) => e.name === "MinterChanged" || e.name === "minterChanged");

    if (minterChange) {
      const d = minterChange.data as Record<string, unknown>;
      const who = String(d.new_minter);
      return {
        ...base,
        kind: "pause",
        summary: d.open ? "Minting opened to any wallet" : `Minter set to ${who.slice(0, 4)}…${who.slice(-4)}`,
      };
    }

    if (split) {
      const d = split.data as Record<string, unknown>;
      return { ...base, kind: "corporate-action", summary: `Split ${d.old_split_num}/${d.old_split_den} → ${d.new_split_num}/${d.new_split_den}` };
    }
    if (att) {
      const d = att.data as Record<string, unknown>;
      const p = pause ? (pause.data as Record<string, unknown>) : null;
      const pauseNote = p ? (p.auto_paused ? " · auto-paused" : " · resumed") : "";
      return {
        ...base,
        kind: "attestation",
        summary: `Cap ${fmt(d.max_supply)} · shares ${fmt(d.shares_held)} · split ${d.split_num}/${d.split_den} · EVM ${fmt(d.other_chain_supply)}${pauseNote}`,
      };
    }
    if (mint) {
      const d = mint.data as Record<string, unknown>;
      return { ...base, kind: "mint", summary: `Minted ${fmt(d.amount)} → supply ${fmt(d.new_supply)} / cap ${fmt(d.max_supply)}` };
    }
    if (pause) {
      const d = pause.data as Record<string, unknown>;
      return { ...base, kind: "pause", summary: d.admin_paused ? "Admin paused" : "Admin unpaused" };
    }
    return { ...base, kind: "pause", summary: logs.some((l) => l.includes("SetCreConfig")) ? "CRE config updated" : "Config change" };
  }
}

/** Finalized blockhash: every Devnet node knows it, so the wallet's own RPC won't
 * reject it as "not found"; still valid for ~45s+. Served by the server so the
 * browser makes no Solana RPC calls (and can't be rate-limited by them). */
export async function readBlockhash() {
  return withRpc((c) => c.getLatestBlockhash("confirmed"));
}

/** Status of a signature, with the decoded Lantern error code if it failed. */
export async function readTxStatus(sig: string) {
  const st = (await withRpc((c) => c.getSignatureStatuses([sig], { searchTransactionHistory: true }))).value[0];
  const status = st?.confirmationStatus ?? null;
  if (!st || !st.err || (status !== "confirmed" && status !== "finalized")) {
    return { status, failed: false as const };
  }
  const tx = await withRpc((c) => c.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }));
  const code = tx?.meta?.logMessages?.join("\n").match(/Error Code: (\w+)/)?.[1] ?? "TransactionFailed";
  return { status, failed: true as const, code };
}

const OTHER_CLUSTERS: [string, Connection][] = [
  ["MAINNET", new Connection("https://api.mainnet-beta.solana.com", "confirmed")],
  ["TESTNET", new Connection("https://api.testnet.solana.com", "confirmed")],
];

export class SendError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Broadcast a wallet-signed transaction through our Devnet RPC. Checks which
 * cluster its blockhash belongs to first, so a wallet signing for the wrong
 * network gets a definite answer instead of a silent drop. */
export async function sendSigned(base64: string, expectedBlockhash?: string): Promise<string> {
  const raw = Buffer.from(base64, "base64");
  const { Transaction } = await import("@solana/web3.js");
  const tx = Transaction.from(raw);
  const bh = tx.recentBlockhash;
  if (!bh) throw new SendError("NoBlockhash", "Signed transaction has no blockhash.");

  const onDevnet = (await withRpc((c) => c.isBlockhashValid(bh, { commitment: "processed" }))).value;
  if (!onDevnet) {
    const replaced = expectedBlockhash !== undefined && bh !== expectedBlockhash;
    for (const [name, conn] of OTHER_CLUSTERS) {
      const valid = await conn.isBlockhashValid(bh, { commitment: "processed" }).then((r) => r.value).catch(() => false);
      if (valid) {
        throw new SendError(
          `WalletOn${name[0]}${name.slice(1).toLowerCase()}`,
          `Your wallet replaced the blockhash with a Solana ${name} one, so it is signing for ${name}, not Devnet. In Phantom: Settings → Developer Settings → Testnet Mode → choose "Solana Devnet" (not Testnet), then disconnect and reconnect this site.`,
        );
      }
    }
    throw new SendError(
      replaced ? "UnknownBlockhash" : "BlockhashExpired",
      replaced
        ? "Your wallet replaced the blockhash with one that is not valid on Devnet, Testnet or Mainnet. Disconnect this site in Phantom (Settings → Connected Apps), reconnect on Solana Devnet, and try again."
        : "The blockhash expired before the wallet approved. Mint again and approve within ~45s.",
    );
  }

  let sig: string;
  try {
    sig = await withRpc((c) => c.sendRawTransaction(raw, { preflightCommitment: "processed", maxRetries: 0 }));
  } catch (e) {
    // A Lantern program error (stale, over cap, paused): send anyway so the rejection
    // lands onchain with an explorer link (PRD demo beat).
    if (!/custom program error/i.test(e instanceof Error ? e.message : String(e))) throw e;
    sig = await withRpc((c) => c.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }));
  }
  // Devnet drops transactions: rebroadcast a few times in the background.
  let n = 0;
  const timer = setInterval(() => {
    if (++n > 10) return clearInterval(timer);
    withRpc((c) => c.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 })).catch(() => {});
  }, 2000);
  return sig;
}
