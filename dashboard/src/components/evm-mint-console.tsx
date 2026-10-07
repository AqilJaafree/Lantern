"use client";

import { useState } from "react";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  http,
  parseAbi,
  type Address,
  type EIP1193Provider,
} from "viem";
import { EVM_GATES } from "@/lib/config";
import type { LanternState } from "@/lib/types";
import { ExtLink, Panel, buttonClass } from "./ui";

const gateAbi = parseAbi([
  "function mint(address to, uint256 amount)",
  "error Unauthorized()",
  "error StaleAttestation()",
  "error ExceedsBacking()",
]);

const ERRORS: Record<string, string> = {
  ExceedsBacking: "Mint would exceed this chain's attested backing allocation.",
  StaleAttestation: "This chain's attestation is stale. Run an attestation round, then mint again.",
  Unauthorized: "Minting on this chain is restricted to one minter.",
};

type Gate = (typeof EVM_GATES)[number];
type Status =
  | { kind: "idle" }
  | { kind: "busy"; text: string }
  | { kind: "success"; hash: string; gate: Gate }
  | { kind: "failed"; code: string; message: string; hash?: string; gate?: Gate };

function chainFor(g: Gate) {
  return defineChain({
    id: g.chainId,
    name: g.label,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [g.publicRpc] } },
    blockExplorers: { default: { name: "Explorer", url: g.explorer } },
  });
}

/** Mint the gated xAAPL on an EVM chain with an injected wallet (MetaMask etc.). */
export function EvmMintConsole({ gates, onDone }: { gates?: LanternState["gates"]; onDone: () => void }) {
  const deployed = EVM_GATES.filter((g) => g.gate);
  const [chain, setChain] = useState<string>(deployed[0]?.name ?? "");
  const [amount, setAmount] = useState("1");
  const [account, setAccount] = useState<Address | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const g = deployed.find((x) => x.name === chain);
  const live = gates?.find((x) => x.name === chain);
  const headroom = live?.cap && live.supply ? (BigInt(live.cap) - BigInt(live.supply)) : null;
  const parsed = Number(amount);
  const invalid = !Number.isFinite(parsed) || parsed <= 0;
  const busy = status.kind === "busy";

  const eth = () => (typeof window !== "undefined" ? (window as unknown as { ethereum?: EIP1193Provider }).ethereum : undefined);

  async function connect() {
    const provider = eth();
    if (!provider) {
      setStatus({ kind: "failed", code: "NoWallet", message: "No EVM wallet found. Install MetaMask (or another injected wallet)." });
      return;
    }
    const [addr] = (await provider.request({ method: "eth_requestAccounts" })) as Address[];
    setAccount(addr);
  }

  async function ensureChain(provider: EIP1193Provider, gate: Gate) {
    const hex = `0x${gate.chainId.toString(16)}` as const;
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    } catch (e) {
      if ((e as { code?: number }).code !== 4902) throw e;
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId: hex, chainName: gate.label, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: [gate.publicRpc], blockExplorerUrls: [gate.explorer] }],
      });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const provider = eth();
    if (!provider || !account || !g || invalid) return;
    try {
      setStatus({ kind: "busy", text: `Switching wallet to ${g.label}…` });
      await ensureChain(provider, g);
      const c = chainFor(g);
      const pub = createPublicClient({ chain: c, transport: http(g.publicRpc) });
      const raw = BigInt(Math.round(parsed * 1e6));
      setStatus({ kind: "busy", text: "Checking against the attested cap…" });
      // Simulate first: a gate revert (over cap, stale) is shown decoded instead of a wallet error.
      const { request } = await pub.simulateContract({ address: g.gate!, abi: gateAbi, functionName: "mint", args: [account, raw], account });
      setStatus({ kind: "busy", text: "Approve in your wallet…" });
      const wallet = createWalletClient({ chain: c, transport: custom(provider), account });
      const hash = await wallet.writeContract(request);
      setStatus({ kind: "busy", text: "Confirming…" });
      const rcpt = await pub.waitForTransactionReceipt({ hash });
      setStatus(rcpt.status === "success" ? { kind: "success", hash, gate: g } : { kind: "failed", code: "Reverted", message: "The transaction reverted.", hash, gate: g });
      onDone();
    } catch (err) {
      console.error("[lantern] evm mint failed", err);
      if (err instanceof BaseError) {
        const revert = err.walk((x) => x instanceof ContractFunctionRevertedError);
        if (revert instanceof ContractFunctionRevertedError) {
          const name = revert.data?.errorName ?? "Reverted";
          setStatus({ kind: "failed", code: name, message: ERRORS[name] ?? revert.shortMessage });
          return;
        }
        if (/reject|denied/i.test(err.shortMessage)) return setStatus({ kind: "idle" });
        setStatus({ kind: "failed", code: "Error", message: err.shortMessage });
        return;
      }
      setStatus({ kind: "failed", code: "Error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <Panel title="EVM mint console" aside={<span className="font-mono text-xs text-muted-foreground">LanternGate.mint</span>}>
      {deployed.length === 0 ? (
        <p className="text-sm text-muted-foreground">No EVM gates deployed yet.</p>
      ) : !account ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">
            Mint xAAPL on {deployed.map((x) => x.label).join(" or ")} with an EVM wallet. Each chain mints only within its own attested allocation.
          </p>
          <button type="button" onClick={connect} className={`${buttonClass} bg-primary text-primary-foreground hover:bg-primary/90`}>
            Connect EVM wallet
          </button>
          {status.kind === "failed" && <p className="text-xs text-destructive">{status.message}</p>}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="evm-chain" className="mb-1 block text-xs text-muted-foreground">Chain</label>
              <select
                id="evm-chain"
                value={chain}
                onChange={(e) => setChain(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {deployed.map((x) => <option key={x.name} value={x.name}>{x.label}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label htmlFor="evm-amount" className="mb-1 block text-xs text-muted-foreground">Amount (xAAPL)</label>
              <input
                id="evm-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={invalid}
                className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <button type="submit" disabled={busy || invalid} className={`${buttonClass} bg-primary text-primary-foreground hover:bg-primary/90`}>
              {busy ? "Working…" : "Mint"}
            </button>
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {account.slice(0, 6)}…{account.slice(-4)} · room on this chain:{" "}
            {headroom === null ? "—" : `${(Number(headroom) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 })} xAAPL`}
            {live && !live.fresh && <span className="text-warning"> · attestation stale</span>}
          </p>
          {invalid && <p className="text-xs text-destructive">Enter an amount greater than 0.</p>}
          {status.kind === "busy" && <p className="text-xs text-muted-foreground" role="status">{status.text}</p>}
          {status.kind === "success" && (
            <p className="text-sm text-success" role="status">
              Minted within {status.gate.label}&apos;s allocation. <ExtLink href={`${status.gate.explorer}/tx/${status.hash}`}>View transaction</ExtLink>
            </p>
          )}
          {status.kind === "failed" && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3" role="alert">
              <p className="font-mono text-sm text-destructive">{status.code}</p>
              <p className="text-xs text-foreground">{status.message}</p>
              {status.hash && status.gate && <ExtLink href={`${status.gate.explorer}/tx/${status.hash}`}>View transaction</ExtLink>}
            </div>
          )}
        </form>
      )}
    </Panel>
  );
}
