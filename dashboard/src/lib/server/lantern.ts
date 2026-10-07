import "server-only";
import { BorshAccountsCoder, BorshCoder, type Idl } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID, getMint, getScaledUiAmountConfig } from "@solana/spl-token";
import { Connection, PublicKey, type VersionedTransactionResponse } from "@solana/web3.js";
import idl from "@/lib/lantern-idl.json";
import { FORWARDERS, LANTERN, SEPOLIA, SOLANA_RPC } from "@/lib/config";
import type { Health, HistoryItem, LanternState } from "@/lib/types";

const connection = new Connection(SOLANA_RPC, "confirmed");
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
async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 6000) {
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

export async function readState(): Promise<LanternState> {
  const [infos, mint, custodian, evm] = await Promise.all([
    connection.getMultipleAccountsInfo([new PublicKey(LANTERN.issuerConfig), new PublicKey(LANTERN.attestation)]),
    getMint(connection, new PublicKey(LANTERN.mint), "confirmed", TOKEN_2022_PROGRAM_ID),
    readCustodian(),
    readEvmSupply(),
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
  const total = supply + evmSupply;

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
      const tx = await connection.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
      if (tx) txCache.set(sig, tx);
    } catch {
      break; // rate limited: stop and retry on the next poll
    }
  }
  return signatures.map((s) => txCache.get(s) ?? null);
}

export async function readHistory(limit = 20): Promise<HistoryItem[]> {
  const sigs = await connection.getSignaturesForAddress(new PublicKey(LANTERN.issuerConfig), { limit });
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
