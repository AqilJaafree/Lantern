"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { useState } from "react";
import { LANTERN, OPEN_MINTER, explorerTx } from "@/lib/config";
import { truncate } from "@/lib/format";
import { PROGRAM_ERRORS, buildMintInstructions } from "@/lib/mint";
import { ExtLink, Panel, buttonClass } from "./ui";
import { WalletButton } from "./wallet-button";

type Status =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "confirming"; sig: string }
  | { kind: "success"; sig: string }
  | { kind: "failed"; sig?: string; code: string; message: string };

export function MintConsole({
  minter,
  blockers = [],
  onDone,
}: {
  minter?: string;
  /** Why minting would be rejected right now (stale attestation, paused, …). */
  blockers?: string[];
  onDone: () => void;
}) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, signTransaction } = useWallet();
  const [amount, setAmount] = useState("1");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const parsed = Number(amount);
  const invalid = !Number.isFinite(parsed) || parsed <= 0;
  const busy = status.kind === "signing" || status.kind === "confirming";
  const open = minter === OPEN_MINTER;
  const notMinter = publicKey && minter && !open && publicKey.toBase58() !== minter;

  /** Poll our server for the signature (up to ~90s). The browser itself makes no
   * Solana RPC calls, so a rate-limited public RPC can't break minting. */
  async function waitForSignature(sig: string): Promise<{ failed: boolean; code?: string }> {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      const res = await fetch(`/api/tx?sig=${sig}`, { cache: "no-store" });
      if (!res.ok) continue;
      const body = await res.json();
      if (body.status === "confirmed" || body.status === "finalized") return body;
    }
    throw new Error(`Transaction ${sig} was not seen on Devnet within 90s. It may have been dropped; try again.`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!publicKey || invalid) return;
    setStatus({ kind: "signing" });
    try {
      const raw = BigInt(Math.round(parsed * 10 ** LANTERN.decimals));
      const bh = await fetch("/api/blockhash", { cache: "no-store" });
      const latest = await bh.json();
      if (!bh.ok) throw new Error(latest.error ?? "Could not get a recent blockhash");
      const tx = new Transaction({ feePayer: publicKey, ...latest }).add(...buildMintInstructions(publicKey, raw));
      // The wallet only signs; our server broadcasts through its Devnet RPC (and reports
      // exactly which cluster the wallet signed for if the blockhash isn't Devnet's).
      let sig: string;
      if (signTransaction) {
        const signed = await signTransaction(tx);
        const res = await fetch("/api/send", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tx: btoa(String.fromCharCode(...signed.serialize())), blockhash: latest.blockhash }),
        });
        const body = await res.json();
        if (!res.ok) {
          setStatus({ kind: "failed", code: body.code ?? "SendFailed", message: body.error ?? "Send failed" });
          return;
        }
        sig = body.signature;
      } else {
        sig = await sendTransaction(tx, connection, { skipPreflight: true, maxRetries: 5 });
      }
      setStatus({ kind: "confirming", sig });
      const result = await waitForSignature(sig);
      if (!result.failed) {
        setStatus({ kind: "success", sig });
      } else {
        const code = result.code ?? "TransactionFailed";
        setStatus({ kind: "failed", sig, code, message: PROGRAM_ERRORS[code] ?? "The transaction failed onchain." });
      }
      onDone();
    } catch (err) {
      console.error("[lantern] mint failed", err);
      const msg = err instanceof Error ? err.message : String(err);
      // A wallet rejection is a user choice, not an error.
      if (/reject|denied|cancel/i.test(msg)) setStatus({ kind: "idle" });
      else setStatus({ kind: "failed", code: "SendFailed", message: msg });
    }
  }

  return (
    <Panel title="Mint console" aside={<span className="font-mono text-xs text-muted-foreground">mint_gated</span>}>
      {!publicKey ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">
            {open ? (
              <>Open minting is on: any Devnet wallet can mint {LANTERN.symbol}, within attested backing.</>
            ) : (
              <>
                Connect the minter wallet to mint {LANTERN.symbol} on Devnet. Other wallets are rejected onchain with{" "}
                <code className="font-mono">Unauthorized</code>.
              </>
            )}
          </p>
          <WalletButton />
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1">
              <label htmlFor="mint-amount" className="mb-1 block text-xs text-muted-foreground">
                Amount ({LANTERN.symbol})
              </label>
              <input
                id="mint-amount"
                name="amount"
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
              {status.kind === "signing" ? "Approve in wallet…" : status.kind === "confirming" ? "Confirming…" : "Mint"}
            </button>
            <WalletButton />
          </div>
          {invalid && <p className="text-xs text-destructive">Enter an amount greater than 0.</p>}
          {blockers.length > 0 && (
            <p className="text-xs text-warning" role="status">
              Minting will be rejected onchain right now: {blockers.join(" · ")}.
              {blockers.some((b) => b.startsWith("Attestation stale")) && " Run a fresh attestation (CRE or relayer), then mint within 3 minutes."}
            </p>
          )}
          {open && (
            <p className="text-xs text-muted-foreground">
              Open minting (demo mode): mints go to your wallet. The cap, freshness and pause checks still apply.
            </p>
          )}
          {notMinter && (
            <p className="text-xs text-warning">
              Connected wallet {truncate(publicKey.toBase58())} is not the minter ({truncate(minter!)}). The program will reject this mint.
            </p>
          )}
          <MintStatus status={status} />
        </form>
      )}
    </Panel>
  );
}

function MintStatus({ status }: { status: Status }) {
  if (status.kind === "confirming")
    return (
      <p className="text-xs text-muted-foreground" role="status">
        Submitted. Waiting for confirmation… <ExtLink href={explorerTx(status.sig)}>View</ExtLink>
      </p>
    );
  if (status.kind === "success")
    return (
      <p className="text-sm text-success" role="status">
        Minted within attested backing. <ExtLink href={explorerTx(status.sig)}>View transaction</ExtLink>
      </p>
    );
  if (status.kind === "failed")
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3" role="alert">
        <p className="font-mono text-sm text-destructive">{status.code}</p>
        <p className="text-xs text-foreground">{status.message}</p>
        {status.sig && (
          <p className="mt-1 text-xs">
            Rejected onchain — <ExtLink href={explorerTx(status.sig)}>view transaction</ExtLink>
          </p>
        )}
      </div>
    );
  return null;
}
