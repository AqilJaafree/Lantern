# Lantern: Product Requirements Document

**Tagline:** Never more tokens than shares.
**Status:** Hackathon build (TOKEN2049 Origins), v1.0
**Targets:** Main track + Solana + Chainlink (CRE) + NOWNodes. Cardano is out of scope.

---

## 0. Build status (as shipped, 7 Oct 2026)

| Area | Status |
|------|--------|
| Solana program S1–S8 | ✅ On Devnet, 32 tests. Added **S9 `on_report`** (CRE path), `set_cre_config`, and **S10 `set_minter`** (open minting for the demo) |
| CRE workflow C1–C6 | ✅ Native Solana write through the Keystone Forwarder; evidence is simulation plus `--broadcast` Devnet transactions. C7/C8 cut. DON deployment needs CRE Early Access |
| NOWNodes N1, N3, N6 | ✅ Sepolia `totalSupply` (CRE `EVMClient` and dashboard); endpoint map in README. **N2 not possible:** NOWNodes has no Solana Devnet endpoint. N4/N5 cut |
| Mock custodian M1–M3 | ✅ Plus `POST /set` and `/reset` for the demo script |
| Dashboard D1–D6, D8 | ✅ Local; hosted URL pending. D7 is partial: splits appear in history, with no timeline marker |
| Demo X1–X2 | ✅ `yarn demo`: the full scenario with CRE attestations, recorded in `anchor/deployments/devnet-demo-run.json` |

The resolved open questions are in section 11. The README is the source of truth for evidence links.

---

## 1. Overview

Lantern is an enforcement layer for tokenized stocks. An issuer wires it into its mint flow, and from then on new tokens can only be minted if a fresh, signed attestation shows the custodian holds enough real shares to back them. If backing falls short, minting pauses automatically, onchain.

Today, backing proof is a trust claim or a periodic PDF. Lantern turns it into a rule the chain enforces.

### Problem

- Institutions ask "are there really shares behind this token, 1:1?" and the answer is mostly trust in the issuer.
- Reserve reporting exists, but nothing stops an issuer (or a bug) from minting past backing.
- Corporate actions (splits, dividends) silently change what "1:1" means, and handling them is manual.
- The same stock token can circulate on several chains, so no single chain shows total supply.

### Product in one paragraph

A custodian share balance is read by a Chainlink CRE workflow, combined with token supply read across chains through NOWNodes, and turned into a signed attestation containing the maximum mintable supply on Solana. A Solana program verifies the attestation's signature onchain and only lets an authorized minter's `mint_gated` succeed when the attestation is fresh and the mint stays under that cap. A dashboard shows the live ratio, per-chain supply, and attestation history.

### Scope of the guarantee

Lantern **gates minting on Solana** and **monitors supply on other chains**. In v1 it does not control mint authority on the EVM chain, so an EVM mint between two attestations can temporarily push total supply above backing. The next attestation subtracts it from Solana capacity and pauses Solana minting if needed. Say this plainly; do not claim cross-chain enforcement.

---

## 2. Goals and non-goals

### Goals

| # | Goal | Measure |
|---|------|---------|
| G1 | Minting is blocked onchain when unbacked | A mint transaction demonstrably reverts after a custodian drain |
| G2 | Minting resumes automatically when backing is restored | Next mint succeeds after top-up, no manual action |
| G3 | Corporate actions are handled without dilution | After a 2-for-1 split, holders' displayed balances double, raw mint capacity is unchanged, and an attempt to mint against the "new" shares reverts |
| G4 | Multichain supply is counted | Supply on Solana plus one EVM chain is summed against one custodian balance |
| G5 | Judges can run it end-to-end | Live URL, public repo, recorded demo, Devnet example transactions |

### Non-goals (this build)

Real custodian or broker integration, KYC/allowlists, multiple issuers, a trading venue, a token launch, an auditor portal with logins, stablecoin support (slide-two narrative only), enforcement of mint authority on non-Solana chains, redemption/burn flows, and any claim of regulatory compliance.

---

## 3. Users

| Persona | Need | Role in v1 |
|---------|------|------------|
| Issuer ops lead (primary) | Mint safely, prove backing, avoid accidental over-issuance | Operates the mint console (holds the minter key) |
| Compliance officer | Evidence of continuous backing for regulators and partners | Reads dashboard and attestation log |
| Auditor / counterparty | Independent, read-only verification | Reads public dashboard and explorer links |
| Judge | Understand and verify in minutes | Watches video, runs live demo |

---

## 4. Scope and requirements

Priority: **P0** must ship, **P1** ship if time allows, **P2** roadmap only.

### 4.1 Solana program (Anchor)

| ID | Pri | Requirement |
|----|-----|-------------|
| S1 | P0 | `init_issuer`: creates `IssuerConfig` (admin, minter, attestor pubkey, token mint, staleness window, pause flags). Verifies the program PDA is the token's mint authority **and** that the freeze authority is the PDA or unset |
| S2 | P0 | `submit_attestation(report, signature)`: callable by **anyone** (the relayer is an untrusted payer). The program verifies the report's signature against `IssuerConfig.attestor` using the native Ed25519 or Secp256k1 signature program via instruction introspection. Rejects if: signature invalid, `nonce ≤ last nonce`, `observed_at ≤ last observed_at`, `observed_at > now + 60s` (clock skew; Devnet's clock can lag wall time), or report's `program_id` / `issuer_config` / `cluster` fields don't match (domain separation) |
| S3 | P0 | `mint_gated(amount)`: requires the `minter` signer. Mints only if `!auto_paused && !admin_paused`, `now − observed_at ≤ staleness_secs`, and `current_supply + amount ≤ max_supply` |
| S4 | P0 | Program PDA is the sole mint authority of the token, so there is no bypass |
| S10 | P1 | `set_minter(new_minter)` (admin): rotate the minter, or set the default pubkey for **open minting**, so any wallet may call `mint_gated` (demo mode, so judges can mint from their own wallets). Cap, freshness and pause checks still apply to every caller. A production issuer keeps a single minter |
| S5 | P0 | Auto-pause: `submit_attestation` sets `auto_paused = true` when `current_supply > max_supply` (shortfall) and clears **only** `auto_paused` when backing is restored. It never touches `admin_paused` |
| S6 | P1 | `admin_pause` / `admin_unpause` by admin as manual override (sets/clears `admin_paused` only) |
| S7 | P1 | Events emitted on attestation, mint, pause/unpause, and corporate action, so the dashboard can index them |
| S9 | P0 | `on_report(metadata, report)`: CRE path. Callable only through the Keystone Forwarder CPI. Verifies the forwarder state (owner and address) and the forwarder authority PDA `["forwarder", state, lantern]`, plus the workflow owner and name in `metadata` against `CreConfig`, then applies the Borsh `AttestationReport` with exactly the same checks and effects as S2/S5/S8 (shared `apply_report`) |
| S8 | P1 | Corporate action inside `submit_attestation`: when the report's `split_num/split_den` differs from the previous attestation, the program PDA (as Scaled UI Amount authority) updates the Token-2022 UI multiplier in the same transaction, so holder balances display post-split amounts |

**Error codes** (surfaced verbatim in the mint console): `Unauthorized`, `InvalidSignature`, `StaleAttestation`, `ExceedsBacking`, `AutoPaused`, `AdminPaused`, `NonceReplay`, `TimestampRegression`, `FutureTimestamp`, `DomainMismatch`, `MaxSupplyMismatch`.

#### Accounts

- **IssuerConfig (PDA):** `admin`, `minter`, `attestor`, `mint`, `staleness_secs`, `auto_paused`, `admin_paused`
- **Attestation (PDA, single latest record):** `max_supply`, `shares_held`, `split_num`, `split_den`, `other_chain_supply`, `observed_at`, `nonce`
- **Token:** Token-2022 mint with the Scaled UI Amount extension, 6 decimals. Mint authority, freeze authority (or none), and UI-multiplier authority = program PDA

#### Units and decimals

- The custodian reports holdings in **micro-shares** (integer, 1 share = 1,000,000), which covers fractional shares.
- Token decimals = 6, so before any split, 1 raw token unit = 1 micro-share. All onchain math is `u64`/`u128` integers in raw units; no floats.
- Other-chain supplies are normalized to 6 decimals by CRE before subtraction (an 18-decimal ERC-20 is divided by 10^12, rounding **up** so rounding never creates capacity).

#### Backing rule

```
max_supply_solana = floor(shares_held × split_den / split_num) − ceil(supply_on_other_chains)
```

`split_num / split_den` is the **cumulative** split factor since token launch (1/1 initially, 2/1 after a 2-for-1 split, 1/10 after a 1-for-10 reverse split). CRE computes the cap off-chain, and the program **recomputes it from the signed inputs** and rejects the report (`MaxSupplyMismatch`) if the numbers disagree, so a buggy or compromised workflow cannot sign an inflated cap. The program stores the inputs for audit and enforces the cap and freshness. If the subtraction would go negative, CRE reports `max_supply = 0`.

### 4.2 Chainlink CRE workflow

| ID | Pri | Requirement |
|----|-----|-------------|
| C1 | P0 | Scheduled (cron) workflow that runs every 30–60 seconds in demo mode (confirm minimum cron interval in hour one) |
| C2 | P0 | Step 1: call the mock custodian API for micro-shares held and the cumulative split factor |
| C3 | P0 | Step 2: read token supply on each chain through NOWNodes (Solana plus one EVM chain). *As built:* the Sepolia mirror's `totalSupply` via `EVMClient` (finalized block), with NOWNodes as the RPC. Solana supply is read onchain by the program itself, and CRE has no Solana reads yet |
| C4 | P0 | Step 3: normalize decimals, compute total supply, backing ratio, and `max_supply_solana` |
| C5 | P0 | Step 4: produce a signed report (fields in 5.3) and deliver it to the Solana program (see 5.3 for the delivery path). *As built:* `SolanaClient.writeReport` through the Keystone Forwarder into `on_report` (S9) |
| C6 | P0 | Capture CRE CLI simulation output (or deployment evidence) for submission |
| C7 | P1 | Use Confidential Workflows for the custodian API credential |
| C8 | P2 | Multi-signer quorum on the report |

### 4.3 NOWNodes integration

| ID | Pri | Requirement |
|----|-----|-------------|
| N1 | P0 | Create a NOWNodes account and API key; all chain reads go through it |
| N2 | P0 | Solana RPC: token supply, mint account state, transaction confirmation. *Not possible:* NOWNodes serves Solana mainnet and testnet only, not Devnet, so Devnet uses the public RPC. Disclosed in the README |
| N3 | P0 | EVM RPC: ERC-20 `totalSupply` and `decimals` for the mirrored stock token |
| N4 | P1 | WebSocket subscription for near-real-time supply changes feeding the dashboard |
| N5 | P1 | Optional third chain (e.g. Bitcoin or another EVM) read as a stretch for the multichain story |
| N6 | P0 | README table mapping each endpoint to the component that uses it |

> Confirm in hour one which networks NOWNodes exposes for testnets. If the EVM side must be mainnet, use a read-only existing token's supply as the second-chain data point and label it clearly.
>
> *Resolved:* NOWNodes serves Ethereum Sepolia (`eth-sepolia.nownodes.io`), so we deployed our own Sepolia mirror ERC-20 (`0xb41e…e54C`) as the second chain. That avoided reading an unrelated mainnet token.

### 4.4 Mock custodian API

| ID | Pri | Requirement |
|----|-----|-------------|
| M1 | P0 | `GET /holdings` returns `{symbol, micro_shares, split_num, split_den, as_of}` |
| M2 | P0 | Admin demo controls: `POST /drain {micro_shares}`, `POST /topup {micro_shares}`, `POST /split {num, den}` (split multiplies `micro_shares` by `num/den` and updates the cumulative factor) |
| M3 | P0 | Clearly labeled as a mock in the UI, README, and video |

### 4.5 Dashboard (Next.js)

| ID | Pri | Requirement |
|----|-----|-------------|
| D1 | P0 | Backing gauge: split-adjusted shares vs. total tokens, shown as a ratio with healthy / warning / breached states |
| D2 | P0 | Per-chain supply breakdown (Solana, EVM) summing to total, labeled "gated" (Solana) vs. "monitored" (EVM) |
| D3 | P0 | Status banner: MINTING ENABLED / PAUSED (auto) / PAUSED (admin), with last attestation age |
| D4 | P0 | Mint console: wallet connect (minter key), amount input, submit. A rejected mint shows the program error code clearly |
| D5 | P0 | Attestation history table with Solana Explorer links |
| D6 | P0 | Demo control panel for drain / top-up / split |
| D7 | P1 | Corporate-action marker in the history timeline |
| D8 | P1 | Visual style: dense, dark, terminal-like. It should look like a risk desk, not a hackathon app |

### 4.6 Headless demo scripting

| ID | Pri | Requirement |
|----|-----|-------------|
| X1 | P0 | One script that resets state and runs the full scenario deterministically for recording. It triggers CRE workflow runs directly instead of waiting on cron, so the video has no dead air |
| X2 | P0 | Pre-funded wallets, pre-created token, seeded initial attestation |

---

## 5. Architecture

### 5.1 Data flow (as built)

```
Mock Custodian API ──HTTP──┐
                           ├──► CRE workflow ──► DON-signed report ──► Keystone Forwarder ──► Lantern on_report
Sepolia mirror ERC-20 ─────┘    (cron, cap)      (SolanaClient)          (verifies DON sigs)        │ forwarder PDA +
  via NOWNodes (EVMClient)                                                                           │ workflow check,
                                                                                                     │ cap recomputed
                    fallback: Ed25519 relayer ──► submit_attestation ────────────────────────────────┤
                                                                                                     ▼
                                                              mint_gated (minter only) checks cap + freshness
                                                                                                     │
Dashboard ◄── Devnet state/events, Sepolia supply via NOWNodes, live custodian ◄─────────────────────┘
```

### 5.2 Trust model

- **As shipped (CRE path):** reports are signed by the CRE oracle network, and Chainlink's Keystone Forwarder verifies those signatures on Solana. Lantern accepts a report only from the forwarder's authority PDA for Lantern, only with the configured forwarder state, and only with the configured workflow owner and name in the metadata. Other workflows using the same forwarder are rejected.
- **Fallback (relayer path):** a single Ed25519 attestor key, whose signature the program verifies onchain. Whoever submits the transaction can't forge or alter a report.
- **Both paths:** the program recomputes the cap from the signed inputs, so neither the workflow nor the attestor can sign an inflated cap.
- **Evidence limits:** the CRE runs are `cre workflow simulate --broadcast`, using Chainlink's simulation forwarder and the simulator's fixed owner `0xaa…aa`. A DON deployment switches `CreConfig` to the live forwarder and the real owner with a single admin transaction.
- **Mint rights:** only the `minter` key can mint, and only within the cap. The admin can pause but cannot raise the cap.
- **Safety defaults:** attestations expire, so a stale feed blocks minting (fail closed). Nonces and monotonic timestamps prevent replay. Domain separation prevents a report for one issuer/cluster being reused on another.
- **Scope:** enforcement is on Solana only; other chains are monitored (see 1, Scope of the guarantee).
- **Roadmap:** multi-signer or DON-backed quorum, independent custodian attestations, auditor co-signing, gated mints on other chains.

Be ready for the judge question "who is the attestor?" with exactly this answer.

### 5.3 CRE to Solana delivery (resolved: native)

*Resolved:* CRE supports native Solana writes. The workflow calls `SolanaClient.writeReport` (with bindings generated from Lantern's Anchor IDL). The oracle network signs with `ecdsa`/`keccak256`, and the **Keystone Forwarder** program verifies those signatures and CPIs into the receiver's `on_report(metadata, report)`. Lantern doesn't need to verify secp256k1 itself. The forwarder hashes the full account list into the signed report, and the metadata layout is `workflow_cid[32] | workflow_name[10] | workflow_owner[20] | report_id[2]`. The relayer path below remains as a fallback.

*Original plan:* CRE tooling is EVM-centric. In hour one, check whether CRE can target Solana directly and which key type CRE reports are signed with.

- **Preferred:** CRE writes the report to Solana natively.
- **Fallback:** CRE does all orchestration (API call, multichain reads, computation, signing) and hands the signed report to a small relayer that calls `submit_attestation`. Because the program verifies the signature, the relayer is a courier, not a trusted party. State this plainly in the README. Do not overclaim.

**Report payload (signed bytes, fixed layout):**
`program_id | issuer_config | cluster_id | nonce | observed_at | micro_shares_held | split_num | split_den | other_chain_supply | max_supply`

Signature verification uses Solana's native Ed25519 program if the attestor key is Ed25519, or the Secp256k1 program if it is an ECDSA/secp256k1 key (likely for CRE). The program checks via instruction introspection that the verify instruction in the same transaction covers exactly these bytes and this pubkey.

### 5.4 Corporate action handling

A 2-for-1 split doubles the custodian's shares, but those new shares belong to existing token holders. Lantern must not let them become fresh mint capacity.

1. Custodian feed changes from `{micro_shares: 100M, split 1/1}` to `{micro_shares: 200M, split 2/1}`.
2. CRE computes `200M × 1 / 2 = 100M` raw tokens backed. **Raw mint capacity is unchanged**, so no dilution.
3. The attestation carries the new split factor; `submit_attestation` (S8) sets the Token-2022 Scaled UI multiplier to 2, so every holder's displayed balance doubles while raw supply stays the same.
4. A mint attempt that would only fit if the split had added capacity reverts with `ExceedsBacking`. The dashboard marks the event.

If S8 is cut, steps 1, 2 and 4 still hold (no dilution); only the displayed-balance update is lost. Say so in the README.

---

## 6. Demo script (recorded, under 3 minutes)

| Time | Beat | Proof shown |
|------|------|-------------|
| 0:00 | Title and one-liner: *Never more tokens than shares* | Slide |
| 0:15 | Healthy state: 102% backing, Solana (gated) plus EVM (monitored) supply | Dashboard |
| 0:35 | Mint succeeds | Explorer link with attestation reference |
| 1:00 | Custodian drain in the mock | Dashboard ratio falls to 96% |
| 1:20 | CRE run (script-triggered) detects the shortfall, new attestation, auto-pause | Status banner flips to PAUSED (auto) |
| 1:40 | Mint attempt fails onchain | `AutoPaused` / `ExceedsBacking` error, explorer link |
| 2:00 | Top-up, ratio recovers, minting resumes | Banner and successful mint |
| 2:20 | 2-for-1 split: balances double, capacity unchanged, over-mint rejected | Timeline marker, holder balance, rejected tx |
| 2:40 | Close: same engine works for stablecoins, roadmap | Slide |

---

## 7. Submission checklist

| Item | Track | Done |
|------|-------|------|
| Public GitHub repo with README (architecture diagram, pre-existing work disclosed, build start time) | Main | ◐ README done; start time and pre-existing work are TODO |
| Live URL / hosted demo | Main, Solana | ☐ |
| Slides on Google Drive (.ppt/.keynote) with screen recording embedded | Main | ☐ |
| Program ID, cluster (Devnet), example transaction links (successful and rejected mint) | Solana | ☑ |
| NOWNodes endpoint-to-component map in README | NOWNodes | ☑ |
| CRE workflow source plus CLI simulation or deployment evidence | Chainlink | ☑ simulation + broadcast |
| Trust model and "gated vs. monitored" scope stated in README | All | ☑ |
| Mock custodian disclosed as a mock everywhere | All | ☑ README, dashboard, API (video pending) |

**Deadline: 7 October 2026, 11:59 PM. No late entries. Submit with buffer.**

---

## 8. Build plan (24 hours)

Overlapping blocks assume two people in parallel. If solo, run them in order and apply the cut list early.

| Hours | Work |
|-------|------|
| 0–2 | Verify CRE-to-Solana path and CRE signing key type, NOWNodes account and networks, repo setup, record start time |
| 2–9 | Anchor program (signature verification, minter check, separate pause flags), tests, Devnet deploy, first example transactions |
| 6–14 | Mock custodian, CRE workflow, NOWNodes reads, signed report, relayer if needed |
| 10–17 | Dashboard and mint console |
| 17–21 | Scenario script, split handling, record demo video, slides |
| 21–24 | README, checklist, submit early |

**Cut order if behind:** WebSocket, Confidential Workflows, third chain, Scaled UI multiplier update (S8), split handling UI, manual pause. **Never cut** the failing-mint demo, the minter check, or onchain signature verification.

---

## 9. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| CRE cannot write to Solana | Weakens Chainlink score | *Retired:* native Solana write through the Keystone Forwarder works |
| CRE signing key can't be verified on Solana in time | Trust shifts to a workflow-held key | *Retired:* the forwarder verifies DON signatures; Lantern checks the forwarder PDA and workflow identity |
| NOWNodes lacks needed testnet | Weakens multichain story | *Partly:* no Solana Devnet, but Sepolia works, and we deployed our own mirror token there |
| CRE deploy access not granted | Evidence is simulation only | Simulation plus `--broadcast` transactions (accepted by the track), disclosed in the README; request access with `cre account access` |
| Public RPC rate limits during demo | Flaky recording | The demo script checks CRE transactions onchain itself and retries on 429; optionally use a dedicated Devnet RPC key |
| Demo flakiness | Lowers functionality score | Scripted scenario, pre-funded wallets, backup recording |
| "Chainlink already has Proof of Reserve / Secure Mint" objection | Perceived low originality | Lead with what Secure Mint doesn't do: corporate actions without dilution, one custodian balance against supply summed across chains, enforcement on Solana |
| "Never" is attacked by judges | Credibility | Staleness window, fail-closed behavior, stated trust model, explicit "gated on Solana, monitored elsewhere" scope |
| Scope creep | Missed deadline | P0 list is the contract; everything else is roadmap |

---

## 10. Startup viability

- **Buyers:** tokenization platforms, stock-token issuers, custodians, and the auditors who serve them. Stablecoin issuers are the larger second market with the same engine.
- **Model:** SaaS per attested asset, with tiers for private attestations, SLAs, and auditor seats.
- **Wedge:** the mint gate plus corporate-action awareness. Reporting is commoditized; enforcement that understands stock-specific events is not.
- **Roadmap:** real custodian integrations, quorum attestations, gated mints on other chains, multi-issuer support, stablecoin backing, auditor portal, regulatory evidence exports.
- **Language discipline:** the product provides continuous, verifiable backing evidence that supports compliance. It does not make an issuer compliant.

---

## 11. Open questions (resolved)

1. **Can CRE deliver reports to Solana natively?** Yes: `SolanaClient.writeReport` → Keystone Forwarder → `on_report`. The relayer is now only a fallback.
2. **Signing key type?** The oracle network signs with `ecdsa`/`keccak256`, and the forwarder verifies it onchain. Lantern checks the forwarder PDA and workflow identity instead of verifying secp256k1 itself.
3. **Cron interval and evidence?** `*/30 * * * * *` (six fields) works in simulation; the checklist accepts simulation evidence, and we added `--broadcast` Devnet transactions.
4. **NOWNodes networks?** Solana mainnet and testnet (no Devnet), and Ethereum Sepolia. Sepolia is the second chain.
5. **Scaled UI Amount on Devnet?** Yes: the PDA is the multiplier authority, and the demo split set ×2 onchain.
6. **Staleness window?** 180 seconds for the demo.
