# Lantern: Product Requirements Document

**Tagline:** Never more tokens than shares.
**Status:** Hackathon build (TOKEN2049 Origins), v1.0
**Targets:** Main track + Solana + Chainlink (CRE) + NOWNodes. Cardano is out of scope.

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
| S5 | P0 | Auto-pause: `submit_attestation` sets `auto_paused = true` when `current_supply > max_supply` (shortfall) and clears **only** `auto_paused` when backing is restored. It never touches `admin_paused` |
| S6 | P1 | `admin_pause` / `admin_unpause` by admin as manual override (sets/clears `admin_paused` only) |
| S7 | P1 | Events emitted on attestation, mint, pause/unpause, and corporate action, so the dashboard can index them |
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
| C3 | P0 | Step 2: read token supply on each chain through NOWNodes (Solana plus one EVM chain) |
| C4 | P0 | Step 3: normalize decimals, compute total supply, backing ratio, and `max_supply_solana` |
| C5 | P0 | Step 4: produce a signed report (fields in 5.3) and deliver it to the Solana program (see 5.3 for the delivery path) |
| C6 | P0 | Capture CRE CLI simulation output (or deployment evidence) for submission |
| C7 | P1 | Use Confidential Workflows for the custodian API credential |
| C8 | P2 | Multi-signer quorum on the report |

### 4.3 NOWNodes integration

| ID | Pri | Requirement |
|----|-----|-------------|
| N1 | P0 | Create a NOWNodes account and API key; all chain reads go through it |
| N2 | P0 | Solana RPC: token supply, mint account state, transaction confirmation |
| N3 | P0 | EVM RPC: ERC-20 `totalSupply` and `decimals` for the mirrored stock token |
| N4 | P1 | WebSocket subscription for near-real-time supply changes feeding the dashboard |
| N5 | P1 | Optional third chain (e.g. Bitcoin or another EVM) read as a stretch for the multichain story |
| N6 | P0 | README table mapping each endpoint to the component that uses it |

> Confirm in hour one which networks NOWNodes exposes for testnets. If the EVM side must be mainnet, use a read-only existing token's supply as the second-chain data point and label it clearly.

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

### 5.1 Data flow

```
Mock Custodian API ──┐
                     ├──► CRE workflow ──► signed report ──► [relayer] ──► Solana program
NOWNodes (Solana +   │    (cron, compute                    (untrusted       │ verifies signature,
 EVM supply reads) ──┘     ratio and cap)                     payer)          │ nonce, timestamp
                                                                              ▼
                                                     mint_gated (minter only) checks cap + freshness
                                                                              │
Dashboard ◄── NOWNodes reads / program events ◄───────────────────────────────┘
```

### 5.2 Trust model

- **v1:** a single attestor key signs reports. The program verifies that signature onchain, so whoever submits the transaction (relayer, anyone) cannot forge or alter a report. Trust sits in the attestor key, not the relayer.
- **Who holds the attestor key:** the key CRE signs with (preferred), or, if CRE's signing key cannot be verified on Solana in time, a workflow-held key whose use is shown in CRE evidence. State which one shipped in the README.
- **Mint rights:** only the `minter` key can mint, and only within the cap. The admin can pause but cannot raise the cap.
- **Safety defaults:** attestations expire, so a stale feed blocks minting (fail closed). Nonces and monotonic timestamps prevent replay. Domain separation prevents a report for one issuer/cluster being reused on another.
- **Scope:** enforcement is on Solana only; other chains are monitored (see 1, Scope of the guarantee).
- **Roadmap:** multi-signer or DON-backed quorum, independent custodian attestations, auditor co-signing, gated mints on other chains.

Be ready for the judge question "who is the attestor?" with exactly this answer.

### 5.3 CRE to Solana delivery (open risk)

CRE tooling is EVM-centric. In hour one, check whether CRE can target Solana directly and which key type CRE reports are signed with.

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
| Public GitHub repo with README (architecture diagram, pre-existing work disclosed, build start time) | Main | ☐ |
| Live URL / hosted demo | Main, Solana | ☐ |
| Slides on Google Drive (.ppt/.keynote) with screen recording embedded | Main | ☐ |
| Program ID, cluster (Devnet), example transaction links (successful and rejected mint) | Solana | ☐ |
| NOWNodes endpoint-to-component map in README | NOWNodes | ☐ |
| CRE workflow source plus CLI simulation or deployment evidence | Chainlink | ☐ |
| Trust model and "gated vs. monitored" scope stated in README | All | ☐ |
| Mock custodian disclosed as a mock everywhere | All | ☐ |

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
| CRE cannot write to Solana | Weakens Chainlink score | Relayer fallback with onchain signature verification, honest README |
| CRE signing key can't be verified on Solana in time | Trust shifts to a workflow-held key | Use a workflow-held Ed25519 key, show its use in CRE evidence, disclose in README |
| NOWNodes lacks needed testnet | Weakens multichain story | Use read-only mainnet token as second-chain data point, labeled |
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

## 11. Open questions (resolve in hour one)

1. Can CRE deliver reports to Solana natively, or is the relayer required?
2. What key type does CRE sign reports with (secp256k1 vs. Ed25519), and can the program verify it with a native signature program?
3. What is CRE's minimum cron interval, and does local CLI simulation count as evidence?
4. Which networks (testnet and mainnet) does NOWNodes provide for the second chain?
5. Is the Token-2022 Scaled UI Amount extension available on Devnet with the PDA as multiplier authority? (If not, ship without S8 and disclose.)
6. Staleness window for the demo (suggest 2–3 minutes) vs. production (suggest minutes to hours, per issuer policy).
