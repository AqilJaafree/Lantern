/**
 * Per-chain backing allocation. One custodian balance backs xAAPL on several
 * chains; each chain enforces its own cap, so the caps must never sum to more
 * than the backed amount, or two chains minting at the same moment could
 * jointly over-mint.
 *
 *   backed = floor(shares × split_den / split_num)        (raw 6-decimal units)
 *   avail  = backed − legacy                               (ungated supply is counted first)
 *   free   = avail − Σ supply_i
 *
 *   free ≥ 0 (healthy):   cap_i = supply_i + floor(free × w_i / Σw)
 *   free < 0 (shortfall): cap_i = floor(supply_i × avail / Σ supply)  (every chain ≤ its
 *                          supply, so every chain is paused)
 *
 * Either way Σ cap_i ≤ avail ≤ backed. Minting on one chain only consumes that
 * chain's headroom, so caps attested at slightly different times stay safe.
 *
 * Solana's program checks max_supply == backed − other_chain_supply, so the
 * Solana report sets other_chain_supply = backed − cap_solana (≥ the other caps).
 */
export interface ChainSupply {
  name: string;
  supply: bigint;
  weight: number;
}

export interface Allocation {
  backed: bigint;
  legacy: bigint;
  avail: bigint;
  free: bigint;
  healthy: boolean;
  caps: Record<string, bigint>;
}

export function backedAmount(sharesHeld: bigint, splitNum: bigint, splitDen: bigint): bigint {
  if (splitNum <= 0n || splitDen <= 0n) throw new Error("invalid split factor");
  return (sharesHeld * splitDen) / splitNum;
}

export function allocate(backed: bigint, legacy: bigint, chains: ChainSupply[]): Allocation {
  const avail = backed > legacy ? backed - legacy : 0n;
  const used = chains.reduce((a, c) => a + c.supply, 0n);
  const free = avail - used;
  const caps: Record<string, bigint> = {};
  if (free >= 0n) {
    const W = BigInt(chains.reduce((a, c) => a + c.weight, 0));
    for (const c of chains) caps[c.name] = c.supply + (W === 0n ? 0n : (free * BigInt(c.weight)) / W);
  } else {
    for (const c of chains) caps[c.name] = used === 0n ? 0n : (c.supply * avail) / used;
  }
  const sum = Object.values(caps).reduce((a, b) => a + b, 0n);
  if (sum > avail) throw new Error(`allocation invariant violated: Σcaps ${sum} > avail ${avail}`);
  return { backed, legacy, avail, free, healthy: free >= 0n, caps };
}
