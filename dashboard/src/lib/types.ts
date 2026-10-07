/** Shapes returned by the API routes. Amounts are decimal strings in raw 6-decimal units. */

export type Health = "healthy" | "warning" | "breached";

export interface LanternState {
  fetchedAt: number;
  /** True when the RPC was unavailable and this is the last good snapshot. */
  cached?: boolean;
  solana: {
    supply: string;
    uiMultiplier: number | null;
    autoPaused: boolean;
    adminPaused: boolean;
    stalenessSecs: number;
    minter: string;
    attestor: string;
  };
  attestation: {
    nonce: string;
    observedAt: number;
    ageSecs: number;
    fresh: boolean;
    sharesHeld: string;
    splitNum: number;
    splitDen: number;
    otherChainSupply: string;
    maxSupply: string;
  };
  /** MOCK custodian, read live. Null when unreachable (e.g. not running). */
  custodian: { microShares: string; splitNum: number; splitDen: number; asOf: string } | null;
  /** Mirror token supply on Sepolia via NOWNodes, normalized to 6 decimals (rounded up). */
  evm: { supply: string; rawSupply: string; source: string } | { error: string };
  /** Lantern-gated mirror tokens on EVM chains (per-chain attested caps). */
  gates: Array<{
    name: string;
    label: string;
    chainId: number;
    gate: string | null;
    via: string;
    explorer: string;
    supply: string | null;
    cap: string | null;
    observedAt: number | null;
    fresh: boolean;
    error?: string;
  }>;
  backing: {
    /** Backed tokens (raw), from live custodian if available, else the last attestation. */
    backed: string;
    basis: "custodian (live, mock)" | "last attestation";
    /** Solana supply + EVM supply (raw). */
    total: string;
    /** backed / total in basis points; null when total is 0. */
    ratioBps: number | null;
    health: Health;
  };
  mintingEnabled: boolean;
  blockers: string[];
}

export type HistoryKind = "attestation" | "mint" | "pause" | "corporate-action" | "failed";

export interface HistoryItem {
  signature: string;
  slot: number;
  time: number | null;
  kind: HistoryKind;
  path: string;
  summary: string;
  error?: string;
}
