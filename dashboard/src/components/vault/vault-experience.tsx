"use client";

import {
  ArrowLeft,
  Check,
  Copy,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { LANTERN, explorerTx } from "@/lib/config";
import { formatAmount, formatRatio, truncate } from "@/lib/format";
import type { HistoryItem, LanternState } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";
import { DemoControls } from "../demo-controls";
import { MintConsole } from "../mint-console";
import { LACQUER, Stick } from "./fortune-sticks";
import { HangingSign, WoodBoard } from "./hanging-sign";
import { InkPoster } from "./ink-poster";
import { IntroScene } from "./intro-scene";
import { webglAvailable } from "./scene";
import { setMuted, sfx, unlock } from "./sfx";
import type { ChainRing, VaultEvent, VaultTarget } from "./types";

const VaultScene = dynamic(() => import("./scene"), { ssr: false });

const CRE_CMD = "cre workflow simulate lantern-attest --target staging-settings --non-interactive --trigger-index 0 --broadcast";
const MAX_BARS = 360;

type Action = "drain" | "topup" | "split" | "reset";
type FeedItem = { id: number; tone: "gold" | "red" | "blue" | "muted"; text: string; sig?: string; at: number };

/** Feed text colours on rice paper. */
const INK: Record<FeedItem["tone"], string> = {
  gold: "text-[#e8c77d]",
  red: "text-[#ec6a52]",
  blue: "text-[#9cbcec]",
  muted: "text-[#d8ccb4]",
};


type StickName = Action | "attest" | "mint";
type Toast = { id: number; tone: FeedItem["tone"]; text: string; kanji: string; title: string; open: boolean };

/** Default sign lettering per tone. */
const SIGN: Record<FeedItem["tone"], { kanji: string; title: string; ink: string }> = {
  red: { kanji: "警告", title: "WARNING", ink: "#8f1d14" },
  gold: { kanji: "完了", title: "DONE", ink: "#22150a" },
  blue: { kanji: "通知", title: "NOTICE", ink: "#1f3a6b" },
  muted: { kanji: "通知", title: "NOTICE", ink: "#22150a" },
};

function ToastBody({ toast }: { toast: Toast }) {
  const ink = SIGN[toast.tone].ink;
  return (
    <div className="flex items-center gap-4">
      <p className="brush shrink-0 text-4xl leading-[1.05] [writing-mode:vertical-rl]" style={{ color: ink }}>
        {toast.kanji}
      </p>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] tracking-[0.3em]" style={{ color: ink }}>{toast.title}</p>
        <p className="mt-1 text-[13px] leading-snug text-[#2c1b0c]">{toast.text}</p>
      </div>
      {toast.tone === "red" && <span className="hanko brush shrink-0 text-xl" aria-hidden>否</span>}
    </div>
  );
}

const noop = () => () => {};
let glCached: boolean | null = null;
const glSnapshot = () => (glCached ??= webglAvailable());
const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (cb: () => void) => {
  const m = window.matchMedia(REDUCED);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const reducedSnapshot = () => window.matchMedia(REDUCED).matches;

export function VaultExperience() {
  const state = usePoll<LanternState>("/api/state", 5000);
  const history = usePoll<HistoryItem[]>("/api/history", 30000);
  const s = state.data;

  const [started, setStarted] = useState(false);
  const [introGone, setIntroGone] = useState(false);
  const gl = useSyncExternalStore(noop, glSnapshot, () => null);
  const reduced = useSyncExternalStore(subscribeReduced, reducedSnapshot, () => false);
  const [muted, setMutedState] = useState(false);
  const [hud, setHud] = useState(true);
  const [shares, setShares] = useState("10");
  const [busy, setBusy] = useState<Action | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [attestOpen, setAttestOpen] = useState(false);
  const [mintOpen, setMintOpen] = useState(false);
  /** Per-stick counter; each bump replays that stick's pop animation. */
  const [pulse, setPulse] = useState<Record<StickName, number>>({ drain: 0, topup: 0, split: 0, reset: 0, attest: 0, mint: 0 });
  const [copied, setCopied] = useState(false);
  /** Custodian holdings from the last action response, used until a newer poll arrives. */
  const [pendingOverride, setOverride] = useState<{ micro: string; num: number; den: number; at: number } | null>(null);
  // Trust it until the poll carries a custodian reading taken after the action. (A poll that
  // started before the action can finish after it, so fetchedAt alone isn't enough.)
  const readAt = s ? (s.custodian ? Date.parse(s.custodian.asOf) : s.fetchedAt - 1000) : 0;
  const override = pendingOverride && !(readAt > pendingOverride.at) ? pendingOverride : null;

  const events = useRef<VaultEvent[]>([]);
  const feedId = useRef(0);
  const prevNonce = useRef<string | null>(null);
  const prevEnabled = useRef<boolean | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const push = useCallback((tone: FeedItem["tone"], text: string, sig?: string) => {
    setFeed((f) => [{ id: ++feedId.current, tone, text, sig, at: Date.now() }, ...f].slice(0, 7));
  }, []);
  const toastId = useRef(0);
  const say = useCallback((tone: FeedItem["tone"], text: string, kanji?: string, title?: string) => {
    const id = ++toastId.current;
    setToast({ id, tone, text, kanji: kanji ?? SIGN[tone].kanji, title: title ?? SIGN[tone].title, open: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => (t && t.id === id ? { ...t, open: false } : t)), 5200);
  }, []);
  const dismissToast = () => setToast((t) => (t ? { ...t, open: false } : t));

  // Onchain transitions -> choreography + feed.
  useEffect(() => {
    if (!s) return;
    if (prevNonce.current !== null && s.attestation.nonce !== prevNonce.current) {
      events.current.push({ kind: "attest" });
      push("blue", `Attestation landed onchain · nonce ${s.attestation.nonce} · ${formatAmount(s.attestation.sharesHeld)} shares`);
      say("blue", "CRE attestation verified onchain. The gate now enforces the new backing.", "認証", "CRE ATTESTATION");
      setAttestOpen(false);
    }
    prevNonce.current = s.attestation.nonce;
    if (prevEnabled.current !== null && s.mintingEnabled !== prevEnabled.current) {
      if (s.mintingEnabled) {
        push("gold", "Minting re-enabled by the program");
        say("gold", "Backing is attested and fresh. The program accepts mints again.", "営業中", "MINTING OPEN");
      } else {
        push("red", `Minting paused onchain: ${s.blockers.join(" · ")}`);
        say("red", `The program paused minting: ${s.blockers.join(" · ")}.`, "準備中", "MINTING PAUSED");
      }
    }
    prevEnabled.current = s.mintingEnabled;
  }, [s, push, say]);

  const view = useMemo(() => {
    if (!s) return null;
    const live = override ?? (s.custodian ? { micro: s.custodian.microShares, num: s.custodian.splitNum, den: s.custodian.splitDen } : null);
    const micro = BigInt(live ? live.micro : s.attestation.sharesHeld);
    const num = BigInt(live ? live.num : s.attestation.splitNum);
    const den = BigInt(live ? live.den : s.attestation.splitDen);
    const backed = (micro * den) / num;
    const total = BigInt(s.backing.total);
    const ratioBps = total === 0n ? null : Number((backed * 10_000n) / total);
    const sharesN = Number(micro) / 1e6;
    const unit = sharesN <= MAX_BARS ? 1 : Math.ceil(sharesN / MAX_BARS);
    const chains: ChainRing[] = [
      { key: "solana", label: "Solana Devnet", color: "#b48cff", supply: Number(s.solana.supply) / 1e6, gated: true },
      ...s.gates.map((g) => ({
        key: g.name,
        label: g.label,
        color: g.name === "robinhood" ? "#7dffa8" : "#7cb6ff",
        supply: g.supply ? Number(g.supply) / 1e6 : 0,
        gated: true,
      })),
      { key: "mirror", label: "Sepolia mirror", color: "#5fd4ff", supply: "supply" in s.evm ? Number(s.evm.supply) / 1e6 : 0, gated: false },
    ];
    const pending = !!s.custodian && (s.custodian.microShares !== s.attestation.sharesHeld || s.custodian.splitNum !== s.attestation.splitNum);
    return { backed, total, ratioBps, sharesN, unit, chains, pending: pending || !!override };
  }, [s, override]);

  // Dev-only rehearsal hook: window.__vault.fire("attest") / .gate(false) to preview choreography
  // without waiting for Devnet. Never shipped: it is stripped from production builds.
  const [devGate, setDevGate] = useState<boolean | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { __vault?: object };
    w.__vault = { fire: (kind: VaultEvent["kind"]) => events.current.push({ kind }), gate: (open: boolean | null) => setDevGate(open) };
    return () => void delete w.__vault;
  }, []);

  const target: VaultTarget = useMemo(
    () => ({
      bars: view ? Math.round(view.sharesN / view.unit) : 0,
      ratio: view ? (view.ratioBps === null ? 1 : view.ratioBps / 10_000) : 0.5,
      gateOpen: devGate ?? s?.mintingEnabled ?? true,
      chains: view?.chains ?? [],
    }),
    [view, s?.mintingEnabled, devGate],
  );

  const enter = useCallback(() => {
    unlock();
    sfx.enter();
    setStarted(true);
    setTimeout(() => setIntroGone(true), 2600);
  }, []);

  const run = useCallback(
    async (action: Action) => {
      if (busy) return;
      const amount = Number(shares);
      if ((action === "drain" || action === "topup") && !(amount > 0)) {
        say("red", "Enter a share amount greater than 0.");
        return;
      }
      sfx.click();
      setBusy(action);
      events.current.push({ kind: action });
      try {
        const body = action === "split" ? { num: 2, den: 1 } : action === "reset" ? {} : { shares: amount };
        const res = await fetch(`/api/custodian/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setOverride({ micro: data.micro_shares, num: data.split_num, den: data.split_den, at: Date.now() });
        const held = (Number(data.micro_shares) / 1e6).toLocaleString("en-US");
        const verb = { drain: `Drained ${amount}`, topup: `Topped up ${amount}`, split: "2-for-1 split", reset: "Reset" }[action];
        push(action === "drain" ? "red" : "gold", `${verb} · custodian holds ${held} shares (split ${data.split_num}/${data.split_den})`);
        say("muted", "The custodian changed, but the chain hasn't seen it yet. Attest with CRE to enforce it.", "通知", "CUSTODIAN CHANGED");
        state.reload();
      } catch (e) {
        sfx.reject();
        say("red", e instanceof Error ? e.message : "Request failed");
      } finally {
        setBusy(null);
      }
    },
    [busy, shares, push, say, state],
  );

  const onMint = useCallback(
    (r: { ok: boolean; code?: string }) => {
      events.current.push({ kind: r.ok ? "mint-ok" : "mint-fail" });
      if (r.ok) {
        push("gold", `Minted ${LANTERN.symbol} within attested backing`);
        say("gold", `Minted ${LANTERN.symbol} within attested backing.`, "鋳造", "MINTED");
      } else {
        push("red", `Mint rejected onchain · ${r.code}`);
        say("red", `The program rejected the mint: ${r.code}.`, "拒否", "REJECTED ONCHAIN");
      }
      state.reload();
      history.reload();
    },
    [push, say, state, history],
  );

  /** A stick was clicked or its key pressed: pop it, then act. */
  const press = useCallback(
    (name: StickName) => {
      const action = name !== "attest" && name !== "mint";
      if (action && busy) return;
      setPulse((p) => ({ ...p, [name]: p[name] + 1 }));
      if (name === "attest") setAttestOpen((o) => !o);
      else if (name === "mint") setMintOpen((o) => !o);
      else run(name);
    },
    [busy, run],
  );

  // Keyboard: D drain · T top up · S split · R reset · A attest · M mint · H hide HUD.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!started) {
        if (e.key === "Enter") enter();
        return;
      }
      const k = e.key.toLowerCase();
      const keyed: Record<string, StickName> = { d: "drain", t: "topup", s: "split", r: "reset", a: "attest", m: "mint" };
      if (keyed[k]) press(keyed[k]);
      else if (k === "h") setHud((h) => !h);
      else if (k === "escape") {
        setAttestOpen(false);
        setMintOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, enter, press]);

  // While the attest panel is open, poll faster so the beam fires soon after the tx lands.
  useEffect(() => {
    if (!attestOpen) return;
    const id = setInterval(() => state.reload(), 2500);
    return () => clearInterval(id);
  }, [attestOpen, state]);

  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`cd cre && ${CRE_CMD}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      say("red", "Couldn't copy. Select the command and copy it manually.");
    }
  };

  if (gl === false) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-10">
        <h1 className="font-mono text-lg">LANTERN / vault</h1>
        <p className="text-sm text-muted-foreground">This browser can&apos;t run WebGL, so the 3D vault is unavailable. The demo controls still work.</p>
        <DemoControls onDone={state.reload} />
        <Link href="/" className="text-sm text-info underline">Back to the backing desk</Link>
      </main>
    );
  }

  const ratio = view?.ratioBps ?? null;
  // Ink colours on the paper poster: black ink when backed, cinnabar when not.
  const healthTone = !s ? "text-[#a8987f]" : ratio === null || ratio >= 10_100 ? "text-[#f0d9a8]" : ratio >= 10_000 ? "text-[#e9b25c]" : "text-[#ec5f45]";
  const healthWord = !s ? "…" : ratio === null || ratio >= 10_100 ? "FULLY BACKED" : ratio >= 10_000 ? "AT THE LINE" : "UNDER-BACKED";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#04050a] text-white">
      <div className="absolute inset-0">{gl && <VaultScene target={target} events={events} started={started} reduced={reduced} />}</div>

      {/* ── Intro ─────────────────────────────────────────────── */}
      {!introGone && (
        <div className={`absolute inset-0 z-30 overflow-hidden ${started ? "pointer-events-none" : ""}`}>
          {/* Background only: dark silhouette scene; dissolves into the vault on Enter. */}
          <IntroScene leaving={started} />
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(4,5,10,0.7)_0%,rgba(4,5,10,0.35)_55%,rgba(4,5,10,0.6)_100%)] px-6 text-center transition-opacity duration-1000 ${started ? "pointer-events-none opacity-0" : "opacity-100"}`}
          >
            <p className="mb-6 font-mono text-[11px] tracking-[0.4em] text-white/50">SOLANA · CHAINLINK CRE · NOWNODES</p>
            <h1 className="lantern-glow font-mono text-5xl font-semibold tracking-[0.35em] text-amber-200 sm:text-7xl">LANTERN</h1>
            <p className="lantern-type mt-6 overflow-hidden whitespace-nowrap border-r-2 border-amber-200/70 font-mono text-sm text-white/80 sm:text-base">
              Never more tokens than shares.
            </p>
            <p className="mt-8 max-w-md text-sm leading-relaxed text-white/55">
              Every gold bar is a real share in custody. Every light in orbit is a token. When the bars run out, the lantern dims, and the chain itself refuses to mint.
            </p>
            <button
              type="button"
              onClick={enter}
              className="group mt-10 inline-flex items-center gap-3 rounded-full border border-amber-200/40 bg-amber-200/10 px-7 py-3 font-mono text-sm tracking-[0.25em] text-amber-100 shadow-[0_0_40px_rgba(255,190,90,0.25)] transition hover:bg-amber-200/20 hover:shadow-[0_0_60px_rgba(255,190,90,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
            >
              ENTER THE VAULT
              <span className="rounded border border-amber-200/30 px-1.5 py-0.5 text-[10px] text-amber-200/70">↵</span>
            </button>
            <p className="mt-4 font-mono text-[10px] tracking-widest text-white/35">SOUND ON FOR THE FULL EXPERIENCE</p>
          </div>
        </div>
      )}

      {/* ── HUD ───────────────────────────────────────────────── */}
      <div className={`pointer-events-none absolute inset-0 z-20 transition-opacity duration-700 ${started && hud ? "opacity-100" : "opacity-0"}`} aria-hidden={!started || !hud}>
        {/* Top bar */}
        <header className="pointer-events-auto absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="glass inline-flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:text-white" aria-label="Back to the backing desk">
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </Link>
            <div>
              <p className="font-mono text-sm font-semibold tracking-[0.3em] text-amber-200">LANTERN</p>
              <p className="font-mono text-[10px] tracking-[0.2em] text-white/50">{LANTERN.symbol} VAULT · SOLANA DEVNET</p>
            </div>
          </div>

          <StatusPill s={s} />

          <div className="flex items-center gap-2">
            <button type="button" onClick={toggleMute} className="glass inline-flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:text-white" aria-label={muted ? "Unmute" : "Mute"}>
              {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
            </button>
            <button type="button" onClick={() => setHud(false)} className="glass inline-flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:text-white" aria-label="Hide HUD (H)">
              <EyeOff className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </header>

        {/* Backing: a calligraphy poster. 担保 = collateral; verse: "tokens never exceed shares; the chain is the proof". */}
        <InkPoster
          kanji="担保"
          seal={ratio === null || ratio >= 10_000 ? "足" : "欠"}
          title="BACKING RATIO"
          verse="幣不過株・鎖上為証"
          shown={started && hud}
          label="Backing"
          className="pointer-events-auto absolute left-5 top-24 w-[min(300px,calc(100vw-2.5rem))]"
        >
          <p className={`brush mt-1 pr-6 text-[2.9rem] leading-none tabular-nums ${healthTone}`}>
            <Counter value={ratio === null ? null : ratio / 100} />
          </p>
          <p className={`ink-serif mt-1 text-[11px] font-bold tracking-[0.3em] ${healthTone}`}>{healthWord}</p>
          {view && s && (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 pr-6">
              <Fact label="Shares in custody" value={view.sharesN.toLocaleString("en-US", { maximumFractionDigits: 2 })} />
              <Fact label="Tokens outstanding" value={formatAmount(view.total)} />
              <Fact label="Attested cap" value={formatAmount(s.attestation.maxSupply)} />
              <Fact label="Split" value={`${override?.num ?? s.custodian?.splitNum ?? s.attestation.splitNum}/${override?.den ?? s.custodian?.splitDen ?? s.attestation.splitDen}`} />
            </dl>
          )}
          <p className="ink-serif mt-3 border-t border-[#d6aa64]/15 pt-2 pr-6 text-[11px] italic text-[#a8987f]">
            One gold bar = {view?.unit ?? 1} share{(view?.unit ?? 1) > 1 ? "s" : ""} · one orb ≈ {view && view.total > 0n ? (Number(view.total) / 1e6 / 160).toFixed(2) : "—"} tokens
          </p>
          {view?.pending && (
            <button
              type="button"
              onClick={() => setAttestOpen(true)}
              className="ink-serif relative mt-3 flex w-full items-center gap-2 rounded-sm border border-[#ec5f45]/45 bg-[#ec5f45]/[0.08] px-3 py-2 text-left text-[12px] text-[#f08a72] hover:bg-[#ec5f45]/15"
            >
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ec5f45] opacity-60 motion-reduce:animate-none" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[#ec5f45]" /></span>
              Custodian changed. Not yet attested onchain.
            </button>
          )}
        </InkPoster>

        {/* Activity: a calligraphy poster. 実況 = live. */}
        <InkPoster
          kanji="実況"
          seal="記"
          title="LIVE ACTIVITY"
          shown={started && hud}
          delay={0.25}
          label="Activity"
          className="pointer-events-auto absolute bottom-[12.5rem] left-5 hidden w-[340px] md:block"
        >
          <ul className="ink-serif space-y-1.5 pb-3 pr-10">
            {feed.slice(0, 4).map((f) => (
              <li key={f.id} className={`lantern-in line-clamp-2 text-[12.5px] leading-snug ${INK[f.tone]}`}>
                <span className="mr-1 text-[#ec5f45]" aria-hidden>・</span>
                {f.text}
              </li>
            ))}
            {history.data?.slice(0, Math.max(0, 4 - feed.length)).map((h) => (
              <li key={h.signature} className="line-clamp-2 text-[12px] leading-snug text-[#a8987f]">
                <span className="mr-1 text-[#ec5f45]" aria-hidden>・</span>
                <span className="font-bold uppercase tracking-wider">{h.kind}</span> · {h.kind === "failed" ? h.error : h.summary}{" "}
                <a href={explorerTx(h.signature)} target="_blank" rel="noreferrer" className="text-[#f08a72] underline decoration-[#f08a72]/40 underline-offset-2">
                  {truncate(h.signature)}
                </a>
              </li>
            ))}
            {!feed.length && !history.data?.length && <li className="text-[12px] italic text-[#a8987f]">Waiting for activity…</li>}
          </ul>
        </InkPoster>

        {/* Control bar: tea-menu fortune sticks, fanned like sticks in a cup. */}
        <nav className="sticks pointer-events-auto" aria-label="Vault controls">
          <Stick kanji="株数" label="Shares" note="" color={LACQUER.teal} tilt={-9}>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              autoComplete="off"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              className="stick-input"
              aria-label="Shares"
            />
          </Stick>
          <Stick kanji="引出" label="Drain" note="Remove shares from custody" hint="D" color={LACQUER.red} tilt={-6} pulse={pulse.drain} busy={busy === "drain"} disabled={!!busy} onClick={() => press("drain")} />
          <Stick kanji="補充" label="Top up" note="Add shares back" hint="T" color={LACQUER.gold} tilt={-3} pulse={pulse.topup} busy={busy === "topup"} disabled={!!busy} onClick={() => press("topup")} />
          <Stick kanji="分割" label="Split" note="2-for-1 corporate action" hint="S" color={LACQUER.orange} tilt={0} pulse={pulse.split} busy={busy === "split"} disabled={!!busy} onClick={() => press("split")} />
          <Stick kanji="復元" label="Reset" note="Back to the starting holdings" hint="R" color={LACQUER.brown} tilt={3} pulse={pulse.reset} busy={busy === "reset"} disabled={!!busy} onClick={() => press("reset")} />
          <Stick kanji="認証" label="Attest" note="Run CRE, watch the beam land" hint="A" color={LACQUER.indigo} tilt={6} pulse={pulse.attest} active={attestOpen} onClick={() => press("attest")} />
          <Stick kanji="鋳造" label="Mint" note="mint_gated on Solana Devnet" hint="M" color={LACQUER.crimson} tilt={9} pulse={pulse.mint} active={mintOpen} onClick={() => press("mint")} />
        </nav>

        {/* Attest panel: a wooden board that fades in. 認証 = verification. */}
        {attestOpen && (
          <section className="pointer-events-auto absolute bottom-[12.5rem] left-1/2 w-[min(580px,calc(100vw-2rem))] -translate-x-1/2" aria-label="Attest with CRE">
            <WoodBoard className="wood-fade-in">
              <button type="button" onClick={() => setAttestOpen(false)} className="absolute -right-2 -top-3 rounded p-1 text-[#5b4127] hover:text-[#22150a]" aria-label="Close">
                <X className="h-4 w-4" aria-hidden />
              </button>
              <div className="flex items-center gap-4">
                <p className="brush shrink-0 text-4xl leading-[1.05] text-[#1f3a6b] [writing-mode:vertical-rl]">認証</p>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] tracking-[0.3em] text-[#1f3a6b]">CHAINLINK CRE ATTESTATION</p>
                  <p className="mt-1 text-[13px] leading-snug text-[#2c1b0c]">The chain only learns what the custodian holds through a signed attestation. Run the workflow and watch the beam land.</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-sm bg-[#22150a] p-2 shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)]">
                <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[11px] text-[#f3e2c4]">cd cre &amp;&amp; {CRE_CMD}</code>
                <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-[#f3e2c4]/30 px-2 py-1 text-[11px] text-[#f3e2c4] hover:bg-[#f3e2c4]/10">
                  {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-3 flex items-center gap-2 text-[12px] text-[#4a3220]">
                <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#1f3a6b] opacity-60 motion-reduce:animate-none" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[#1f3a6b]" /></span>
                Watching Devnet for a new attestation (current nonce {s?.attestation.nonce ?? "…"})
              </p>
            </WoodBoard>
          </section>
        )}


      </div>

      {/* Mint: a wooden shop sign. 営業中 = open for business, 準備中 = not open yet. */}
      <HangingSign open={mintOpen} rope={64} role="dialog" label={`Mint ${LANTERN.symbol}`} className="absolute right-[3vw] top-0 z-40 w-[min(420px,calc(100vw-2rem))]">
        <button type="button" onClick={() => setMintOpen(false)} className="absolute -right-2 -top-3 rounded p-1 text-[#5b4127] hover:text-[#22150a]" aria-label="Close mint sign (Esc)">
          <X className="h-4 w-4" aria-hidden />
        </button>
        <div className="text-center">
          <p className={`brush text-6xl leading-none tracking-[0.12em] ${s && !s.mintingEnabled ? "text-[#8f1d14]" : "text-[#22150a]"}`}>{s && !s.mintingEnabled ? "準備中" : "営業中"}</p>
          <p className="mt-2 font-mono text-[10px] tracking-[0.35em] text-[#5b4127]">
            {s && !s.mintingEnabled ? "MINTING PAUSED" : "MINTING OPEN"} · {LANTERN.symbol}
          </p>
        </div>
        <p className="mt-3 text-center text-xs leading-relaxed text-[#4a3220]">
          Try it while the gate is sealed: the program rejects the mint onchain and the gate flashes red. Mint while it&apos;s open and the token flies into the Solana ring.
        </p>
        <div className="wood-ink mt-3 max-h-[calc(100dvh-300px)] overflow-y-auto">
          {mintOpen && <MintConsole minter={s?.solana.minter} blockers={s?.blockers} onDone={() => state.reload()} onResult={onMint} />}
        </div>
      </HangingSign>

      {/* Notifications: small hanging signs that drop in and swing. */}
      {toast && (
        <HangingSign
          key={toast.id}
          open={toast.open}
          rope={40}
          role={toast.tone === "red" ? "alert" : "status"}
          onClick={dismissToast}
          onClosed={() => setToast((t) => (t && !t.open ? null : t))}
          className="absolute left-1/2 top-0 z-40 w-[min(400px,calc(100vw-2rem))] -translate-x-1/2 cursor-pointer"
        >
          <ToastBody toast={toast} />
        </HangingSign>
      )}

      {started && !hud && (
        <button type="button" onClick={() => setHud(true)} className="glass absolute right-4 top-4 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full text-white/60 hover:text-white" aria-label="Show HUD (H)">
          <Eye className="h-4 w-4" aria-hidden />
        </button>
      )}

      <HangingSign open={!!(state.error && !s && started)} rope={40} role="alert" className="absolute left-1/2 top-0 z-40 w-[min(400px,calc(100vw-2rem))] -translate-x-1/2">
        <ToastBody toast={{ id: 0, tone: "red", kanji: "障害", title: "CAN'T REACH DEVNET", text: `Couldn't load Lantern state: ${state.error}. Retrying…`, open: true }} />
      </HangingSign>
    </main>
  );
}

function StatusPill({ s }: { s: LanternState | null }) {
  if (!s) return <div className="glass h-9 w-48 animate-pulse rounded-full motion-reduce:animate-none" />;
  const on = s.mintingEnabled;
  return (
    <div
      role="status"
      className={`glass hidden items-center gap-2 rounded-full px-4 py-2 font-mono text-[11px] tracking-[0.25em] sm:flex ${on ? "text-amber-200" : "lantern-alarm text-red-300"}`}
    >
      <span className={`h-2 w-2 rounded-full ${on ? "bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.9)]" : "bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.95)]"}`} />
      {on ? "MINTING ENABLED" : "MINTING PAUSED"}
      {!on && <span className="max-w-[280px] truncate text-[10px] normal-case tracking-normal text-red-200/80">{s.blockers.join(" · ")}</span>}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="ink-serif text-[11px] italic text-[#a8987f]">{label}</dt>
      <dd className="truncate font-mono text-sm tabular-nums text-[#efe4cf]">{value}</dd>
    </div>
  );
}

/** Animated percentage that rolls toward its value. */
function Counter({ value }: { value: number | null }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (value === null) return;
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 1200);
      const v = a + (value - a) * (1 - Math.pow(1 - k, 3));
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{value === null ? formatRatio(null) : `${shown.toFixed(2)}%`}</>;
}
