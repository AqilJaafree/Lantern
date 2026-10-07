"use client";

import { AlertTriangle, CheckCircle2, Inbox, PauseCircle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { LANTERN, OPEN_MINTER, SEPOLIA, etherscanAddress, explorerAddress, explorerTx } from "@/lib/config";
import { ago, formatAmount, formatRatio, truncate } from "@/lib/format";
import type { HistoryItem, LanternState } from "@/lib/types";
import { DemoControls } from "./demo-controls";
import { MintConsole } from "./mint-console";
import { ExtLink, Panel, Skeleton, Stat, buttonClass } from "./ui";

function usePoll<T>(url: string, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setData(body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  }, [url]);
  useEffect(() => {
    load();
    const id = setInterval(load, intervalMs);
    return () => clearInterval(id);
  }, [load, intervalMs]);
  return { data, error, reload: load };
}

export function Dashboard() {
  const state = usePoll<LanternState>("/api/state", 4000);
  const history = usePoll<HistoryItem[]>("/api/history", 15000);
  const reloadAll = () => {
    state.reload();
    history.reload();
  };
  const s = state.data;

  return (
    <main className="mx-auto max-w-7xl space-y-4 overflow-x-hidden px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold tracking-tight">
            LANTERN <span className="text-muted-foreground">/ {LANTERN.symbol} backing desk</span>
          </h1>
          <p className="text-xs text-muted-foreground">Never more tokens than shares. Mints gated onchain by CRE-signed attestations.</p>
        </div>
        <div className="flex items-center gap-2">
          {s?.solana.minter === OPEN_MINTER && (
            <span className="rounded-sm bg-info/15 px-2 py-1 font-mono text-xs text-info">OPEN MINTING</span>
          )}
          <span className="rounded-sm bg-warning/15 px-2 py-1 font-mono text-xs text-warning">SOLANA DEVNET</span>
          <span className="rounded-sm bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">SEPOLIA</span>
        </div>
      </header>

      {state.error && !s ? (
        <ErrorBox title="Couldn't load Lantern state" detail={state.error} onRetry={state.reload} />
      ) : (
        <StatusBanner s={s} />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <BackingPanel s={s} />
        <SupplyPanel s={s} />
        <AttestationPanel s={s} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MintConsole minter={s?.solana.minter} onDone={reloadAll} />
        <DemoControls onDone={reloadAll} />
      </div>

      <HistoryPanel items={history.data} error={history.error} onRetry={history.reload} />

      <footer className="flex flex-wrap gap-x-4 gap-y-1 pb-4 text-xs text-muted-foreground">
        <span>Program <ExtLink href={explorerAddress(LANTERN.programId)}>{truncate(LANTERN.programId)}</ExtLink></span>
        <span>Mint <ExtLink href={explorerAddress(LANTERN.mint)}>{truncate(LANTERN.mint)}</ExtLink></span>
        <span>Sepolia mirror <ExtLink href={etherscanAddress(SEPOLIA.token)}>{truncate(SEPOLIA.token, 6)}</ExtLink></span>
        <span>Custodian data is a MOCK. Lantern gates Solana mints; other chains are monitored.</span>
      </footer>
    </main>
  );
}

function StatusBanner({ s }: { s: LanternState | null }) {
  if (!s) return <Skeleton className="h-14 w-full" />;
  const enabled = s.mintingEnabled;
  const Icon = enabled ? CheckCircle2 : PauseCircle;
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 ${
        enabled ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10"
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon className={`h-5 w-5 ${enabled ? "text-success" : "text-destructive"}`} aria-hidden />
        <div>
          <p className={`font-mono text-sm font-semibold ${enabled ? "text-success" : "text-destructive"}`}>
            {enabled ? "MINTING ENABLED" : "MINTING PAUSED"}
          </p>
          {!enabled && <p className="text-xs text-foreground">{s.blockers.join(" · ")}</p>}
        </div>
      </div>
      <p className="min-w-0 break-words font-mono text-xs tabular-nums text-muted-foreground">
        Last attestation {ago(s.attestation.ageSecs)} · window {s.solana.stalenessSecs}s · nonce {s.attestation.nonce}
      </p>
    </div>
  );
}

function BackingPanel({ s }: { s: LanternState | null }) {
  const tone = !s ? "" : s.backing.health === "healthy" ? "text-success" : s.backing.health === "warning" ? "text-warning" : "text-destructive";
  const bar = !s ? "" : s.backing.health === "healthy" ? "bg-success" : s.backing.health === "warning" ? "bg-warning" : "bg-destructive";
  const pct = s?.backing.ratioBps == null ? 0 : Math.min(100, s.backing.ratioBps / 150); // 150% fills the bar
  return (
    <Panel title="Backing ratio">
      {!s ? (
        <div className="space-y-3"><Skeleton className="h-10 w-32" /><Skeleton className="h-2 w-full" /><Skeleton className="h-10 w-full" /></div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-baseline gap-2">
            <span className={`font-mono text-4xl font-semibold tabular-nums ${tone}`}>{formatRatio(s.backing.ratioBps)}</span>
            <span className={`font-mono text-xs uppercase ${tone}`}>{s.backing.health}</span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded bg-muted" aria-hidden>
            <div className={`h-full ${bar} transition-[width] duration-300`} style={{ width: `${pct}%` }} />
            <div className="absolute inset-y-0 w-px bg-foreground/60" style={{ left: `${100 / 1.5}%` }} title="100%" />
          </div>
          <dl className="grid grid-cols-2 gap-3">
            <Stat label="Backed (shares)" value={formatAmount(s.backing.backed)} sub={s.backing.basis} />
            <Stat label="Tokens outstanding" value={formatAmount(s.backing.total)} sub="Solana + Sepolia" />
          </dl>
        </div>
      )}
    </Panel>
  );
}

function SupplyPanel({ s }: { s: LanternState | null }) {
  const evmOk = s && "supply" in s.evm;
  const headroom = s ? BigInt(s.attestation.maxSupply) - BigInt(s.solana.supply) : 0n;
  return (
    <Panel title="Supply by chain">
      {!s ? (
        <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
      ) : (
        <dl className="space-y-3">
          <Row label="Solana Devnet" tag="GATED" tagClass="bg-success/15 text-success" value={formatAmount(s.solana.supply)}
            sub={s.solana.uiMultiplier && s.solana.uiMultiplier !== 1 ? `UI multiplier ×${s.solana.uiMultiplier}` : "Token-2022, mint authority = Lantern PDA"} />
          <Row label="Ethereum Sepolia" tag="MONITORED" tagClass="bg-info/15 text-info"
            value={evmOk ? formatAmount((s.evm as { supply: string }).supply) : "—"}
            sub={evmOk ? (s.evm as { source: string }).source : `Unavailable: ${(s.evm as { error: string }).error}`} />
          <div className="border-t border-border pt-3">
            <Row label="Total outstanding" value={formatAmount(s.backing.total)} />
          </div>
          <Row label="Solana mint cap" value={formatAmount(s.attestation.maxSupply)}
            sub={headroom >= 0n ? `${formatAmount(headroom)} headroom` : `${formatAmount(-headroom)} over cap`} />
        </dl>
      )}
    </Panel>
  );
}

function Row({ label, value, sub, tag, tagClass }: { label: string; value: string; sub?: string; tag?: string; tagClass?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <dt className="flex items-center gap-2 text-sm">
          {label}
          {tag && <span className={`rounded-sm px-1.5 py-0.5 font-mono text-[10px] ${tagClass}`}>{tag}</span>}
        </dt>
        {sub && <dd className="truncate text-xs text-muted-foreground">{sub}</dd>}
      </div>
      <dd className="font-mono text-sm tabular-nums">{value}</dd>
    </div>
  );
}

function AttestationPanel({ s }: { s: LanternState | null }) {
  return (
    <Panel title="Latest attestation" aside={s && <span className={`font-mono text-xs ${s.attestation.fresh ? "text-success" : "text-destructive"}`}>{s.attestation.fresh ? "FRESH" : "STALE"}</span>}>
      {!s ? (
        <div className="grid grid-cols-2 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
      ) : (
        <dl className="grid grid-cols-2 gap-3">
          <Stat label="Observed" value={new Date(s.attestation.observedAt * 1000).toLocaleTimeString()} sub={ago(s.attestation.ageSecs)} />
          <Stat label="Nonce" value={s.attestation.nonce} />
          <Stat label="Shares held" value={formatAmount(s.attestation.sharesHeld)} />
          <Stat label="Split factor" value={`${s.attestation.splitNum}/${s.attestation.splitDen}`} />
          <Stat label="Other chains" value={formatAmount(s.attestation.otherChainSupply)} />
          <Stat label="Max supply (cap)" value={formatAmount(s.attestation.maxSupply)} />
          {s.custodian && (
            <div className="col-span-2 border-t border-border pt-2 text-xs text-muted-foreground">
              Custodian now (mock): <span className="font-mono text-foreground">{formatAmount(s.custodian.microShares)}</span> shares, split {s.custodian.splitNum}/{s.custodian.splitDen}
              {(s.custodian.microShares !== s.attestation.sharesHeld || s.custodian.splitNum !== s.attestation.splitNum) && (
                <span className="text-warning"> · not yet attested</span>
              )}
            </div>
          )}
        </dl>
      )}
    </Panel>
  );
}

const KIND_STYLE: Record<HistoryItem["kind"], string> = {
  attestation: "text-info",
  mint: "text-success",
  "corporate-action": "text-primary",
  pause: "text-muted-foreground",
  failed: "text-destructive",
};

function HistoryPanel({ items, error, onRetry }: { items: HistoryItem[] | null; error: string | null; onRetry: () => void }) {
  return (
    <Panel title="Attestation & mint history" aside={<button type="button" onClick={onRetry} className={`${buttonClass} h-8 px-2 text-xs text-muted-foreground hover:text-foreground`} aria-label="Refresh history"><RefreshCw className="h-3.5 w-3.5" aria-hidden /></button>}>
      {error && !items ? (
        <ErrorBox title="Couldn't load history" detail={error} onRetry={onRetry} />
      ) : !items ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm">No activity yet</p>
          <p className="text-xs text-muted-foreground">Attestations and mints appear here once they land on Devnet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="font-mono text-xs uppercase text-muted-foreground">
              <tr><th className="py-2 pr-3 font-normal">Time</th><th className="py-2 pr-3 font-normal">Event</th><th className="py-2 pr-3 font-normal">Detail</th><th className="py-2 pr-3 font-normal">Path</th><th className="py-2 font-normal">Tx</th></tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.signature} className="border-t border-border">
                  <td className="py-2 pr-3 font-mono text-xs tabular-nums text-muted-foreground">{it.time ? new Date(it.time * 1000).toLocaleString() : "—"}</td>
                  <td className={`py-2 pr-3 font-mono text-xs uppercase ${KIND_STYLE[it.kind]}`}>{it.kind === "failed" ? it.summary : it.kind}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{it.kind === "failed" ? <span className="text-destructive">{it.error}</span> : it.summary}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{it.path}</td>
                  <td className="py-2 text-xs"><ExtLink href={explorerTx(it.signature)}>{truncate(it.signature)}</ExtLink></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function ErrorBox({ title, detail, onRetry }: { title: string; detail: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4" role="alert">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" aria-hidden />
        <div>
          <p className="text-sm font-medium text-destructive">{title}</p>
          <p className="text-xs text-muted-foreground">{detail}. Devnet RPC can be slow; try again.</p>
        </div>
      </div>
      <button type="button" onClick={onRetry} className={`${buttonClass} border border-border bg-muted hover:bg-muted/70`}>Retry</button>
    </div>
  );
}
