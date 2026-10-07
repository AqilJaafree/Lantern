"use client";

import { useState } from "react";
import { Panel, buttonClass } from "./ui";

type Action = "drain" | "topup" | "split" | "reset";

/** MOCK custodian controls (PRD D6). Changes are picked up by the next CRE attestation run. */
export function DemoControls({ onDone }: { onDone: () => void }) {
  const [shares, setShares] = useState("10");
  const [busy, setBusy] = useState<Action | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(action: Action, body: object = {}) {
    setBusy(action);
    setMessage(null);
    try {
      const res = await fetch(`/api/custodian/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const held = (Number(data.micro_shares) / 1e6).toLocaleString("en-US");
      setMessage({ ok: true, text: `Custodian now holds ${held} shares (split ${data.split_num}/${data.split_den}). Run the CRE workflow to attest it.` });
      onDone();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setBusy(null);
    }
  }

  const sharesInvalid = !(Number(shares) > 0);
  const btn = `${buttonClass} border border-border bg-muted hover:bg-muted/70`;

  return (
    <Panel title="Demo controls" aside={<span className="rounded-sm bg-warning/15 px-2 py-0.5 font-mono text-xs text-warning">MOCK CUSTODIAN</span>}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="demo-shares" className="mb-1 block text-xs text-muted-foreground">Shares</label>
            <input
              id="demo-shares"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              autoComplete="off"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              className="h-10 w-28 rounded-md border border-input bg-background px-3 font-mono text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <button type="button" className={btn} disabled={!!busy || sharesInvalid} onClick={() => run("drain", { shares: Number(shares) })}>
            {busy === "drain" ? "Draining…" : "Drain"}
          </button>
          <button type="button" className={btn} disabled={!!busy || sharesInvalid} onClick={() => run("topup", { shares: Number(shares) })}>
            {busy === "topup" ? "Topping up…" : "Top up"}
          </button>
          <button type="button" className={btn} disabled={!!busy} onClick={() => run("split", { num: 2, den: 1 })}>
            {busy === "split" ? "Splitting…" : "2-for-1 split"}
          </button>
          <button type="button" className={btn} disabled={!!busy} onClick={() => run("reset")}>
            {busy === "reset" ? "Resetting…" : "Reset"}
          </button>
        </div>
        {message && (
          <p className={`text-xs ${message.ok ? "text-muted-foreground" : "text-destructive"}`} role={message.ok ? "status" : "alert"}>
            {message.text}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Attest with CRE:{" "}
          <code className="break-words font-mono text-foreground">
            cre workflow simulate lantern-attest --target staging-settings --broadcast
          </code>
        </p>
      </div>
    </Panel>
  );
}
