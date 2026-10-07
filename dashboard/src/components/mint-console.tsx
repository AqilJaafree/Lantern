"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Transaction } from "@solana/web3.js";
import { useState } from "react";
import { LANTERN, explorerTx } from "@/lib/config";
import { truncate } from "@/lib/format";
import { PROGRAM_ERRORS, buildMintInstructions } from "@/lib/mint";
import { ExtLink, Panel, buttonClass } from "./ui";

type Status =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "confirming"; sig: string }
  | { kind: "success"; sig: string }
  | { kind: "failed"; sig?: string; code: string; message: string };

export function MintConsole({ minter, onDone }: { minter?: string; onDone: () => void }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [amount, setAmount] = useState("1");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const parsed = Number(amount);
  const invalid = !Number.isFinite(parsed) || parsed <= 0;
  const busy = status.kind === "signing" || status.kind === "confirming";
  const notMinter = publicKey && minter && publicKey.toBase58() !== minter;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!publicKey || invalid) return;
    setStatus({ kind: "signing" });
    try {
      const raw = BigInt(Math.round(parsed * 10 ** LANTERN.decimals));
      const latest = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: publicKey, ...latest }).add(...buildMintInstructions(publicKey, raw));
      // Skip preflight so a rejected mint still lands onchain with an explorer link (PRD demo beat).
      const sig = await sendTransaction(tx, connection, { skipPreflight: true });
      setStatus({ kind: "confirming", sig });
      const res = await connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");
      if (!res.value.err) {
        setStatus({ kind: "success", sig });
      } else {
        const landed = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
        const code = landed?.meta?.logMessages?.join("\n").match(/Error Code: (\w+)/)?.[1] ?? "TransactionFailed";
        setStatus({ kind: "failed", sig, code, message: PROGRAM_ERRORS[code] ?? "The transaction failed onchain." });
      }
      onDone();
    } catch (err) {
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
            Connect the minter wallet to mint {LANTERN.symbol} on Devnet. Other wallets are rejected onchain with{" "}
            <code className="font-mono">Unauthorized</code>.
          </p>
          <WalletMultiButton />
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
            <WalletMultiButton />
          </div>
          {invalid && <p className="text-xs text-destructive">Enter an amount greater than 0.</p>}
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
