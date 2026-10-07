/** Raw 6-decimal amount -> display string. */
export function formatAmount(raw: string | bigint, maxFrac = 2): string {
  const n = Number(BigInt(raw)) / 1e6;
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: maxFrac });
}

export function formatRatio(bps: number | null): string {
  return bps === null ? "—" : `${(bps / 100).toFixed(2)}%`;
}

export function truncate(addr: string, chars = 4): string {
  return addr.length <= chars * 2 + 3 ? addr : `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

export function ago(secs: number): string {
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}
