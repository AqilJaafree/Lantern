# Lantern

**Never more tokens than shares.**

Lantern is an enforcement layer for tokenized stocks. New tokens can only be minted when a fresh, signed attestation shows the custodian holds enough real shares to back them. If backing falls short, minting pauses automatically, onchain. When backing is restored, it resumes on its own.

Backing proof today is a trust claim or a periodic PDF. Lantern turns it into a rule the chain enforces.

> Built for TOKEN2049 Origins (Main track, Solana, Chainlink CRE, NOWNodes). Product spec: [`Lantern.md`](Lantern.md).

---

## Status

| Component | State |
|---|---|
| Solana program (Anchor) | ✅ Built, 21 tests passing, **deployed to Devnet** |
| Relayer (signs and submits attestations) | ✅ Built, used for the Devnet example transactions |
| Devnet example transactions (successful and rejected mints) | ✅ Recorded, see [below](#devnet-deployment) |
| Mock custodian API | ⏳ Not started |
| Chainlink CRE workflow | ⏳ Not started |
| NOWNodes chain reads | ⏳ Not started (API key verified, see [NOWNodes](#nownodes)) |
| Dashboard (Next.js) | ⏳ Not started |

---

## How it works

```
Mock Custodian API ──┐
                     ├──► CRE workflow ──► signed report ──► [relayer] ──► Lantern program (Solana)
NOWNodes (Solana +   │    (compute cap)                     (untrusted       │ verifies signature,
 EVM supply reads) ──┘                                        courier)        │ nonce, timestamp, cap
                                                                              ▼
                                                     mint_gated (minter only): cap + freshness
                                                                              │
Dashboard ◄── NOWNodes reads / program events ◄───────────────────────────────┘
```

1. **Observe.** The custodian's share balance and cumulative split factor, plus token supply on other chains.
2. **Attest.** Compute `max_supply_solana` and sign a report with the attestor key.
3. **Verify onchain.** `submit_attestation` checks the Ed25519 signature, the nonce, the timestamp and the cluster. It **recomputes the cap from the signed inputs** and rejects any mismatch. If supply is above the cap, it auto-pauses minting; once backing recovers, it resumes.
4. **Gate.** `mint_gated` succeeds only for the minter key, only while the attestation is fresh, and only within the cap.

### Backing rule

```
max_supply_solana = floor(shares_held × split_den / split_num) − supply_on_other_chains
```

- Holdings are in **micro-shares** (1 share = 1,000,000). The token uses 6 decimals, so before any split one raw unit equals one micro-share.
- `split_num / split_den` is the **cumulative** split factor (2/1 after a 2-for-1 split).
- **Splits don't create capacity.** After a 2-for-1 split, the custodian holds twice the shares, but they belong to existing holders, so the raw cap stays the same. The program updates the Token-2022 **Scaled UI Amount** multiplier, which makes every holder's displayed balance double.

### Trust model

- **Attestor:** a single key signs reports, and the program verifies that signature onchain. Whoever submits the transaction, CRE or the relayer, can't forge or alter a report.
- **Minter:** only the `minter` key can mint, and only within the cap. The admin can pause minting but can't raise the cap.
- **Fail closed:** attestations expire, so a stale feed blocks minting. Nonces and strictly increasing timestamps prevent replay. The program ID, issuer and cluster are part of the signed bytes, so a report can't be reused for another issuer or cluster.
- **Scope:** minting is **gated on Solana** and **monitored on other chains**. Lantern does not control mint authority on the EVM chain. An EVM mint between two attestations is subtracted from Solana capacity at the next attestation.
- **Roadmap:** multi-signer or DON-backed quorum, auditor co-signing, gated mints on other chains.

> **Mock disclosure:** the custodian is a mock API with demo controls (drain, top-up, split). No real custodian or broker is integrated.

---

## Devnet deployment

| | |
|---|---|
| Program | [`CMo46d7niK6id7f8vUR25zQjKr77ykvKoukDeUEKCXuh`](https://explorer.solana.com/address/CMo46d7niK6id7f8vUR25zQjKr77ykvKoukDeUEKCXuh?cluster=devnet) |
| Cluster | Devnet |
| Demo token (Token-2022, 6 decimals, Scaled UI Amount) | [`7yupUQoWo5R7T6tvk7dCVjN4vXB94vSmSUHWeG5b4zM9`](https://explorer.solana.com/address/7yupUQoWo5R7T6tvk7dCVjN4vXB94vSmSUHWeG5b4zM9?cluster=devnet) |
| Issuer config (PDA, sole mint authority) | [`Vsf7QBUfHQSqnQG1wzdxVakRqsnCqFsSDeeAgHAG3fP`](https://explorer.solana.com/address/Vsf7QBUfHQSqnQG1wzdxVakRqsnCqFsSDeeAgHAG3fP?cluster=devnet) |
| Attestor public key | `Cgty5VNLqgVjuVbv5UL66j9bD2JakVpQGqMy3jhoAS2y` |
| Staleness window | 180 seconds |

Full addresses: [`anchor/deployments/devnet.json`](anchor/deployments/devnet.json).

### Example transactions

Recorded with `yarn examples` ([`anchor/deployments/devnet-examples.json`](anchor/deployments/devnet-examples.json)). The rejected mints were sent with preflight skipped, so they landed onchain as failed transactions and their explorer pages show the program error.

| Step | Result | Transaction |
|---|---|---|
| Attest healthy (12 shares, 2 tokens on EVM, cap 10) | ✅ ok | [66mNtX…](https://explorer.solana.com/tx/66mNtXhHj9umWHUWfoBj5WQSakESNnBdWR3dncXHstGrVzdBncFQxnGog5i4T7NqLT4WHn1PMjN6ce3K48EkLA4D?cluster=devnet) |
| **Mint 5, within backing** | ✅ ok | [3cCa3T…](https://explorer.solana.com/tx/3cCa3TXL7tpQMrkx1AmLemkhcu4mWDbfzLaecfY8DcGyrbLeAGQDHoDFoxdV56vqf1M3uZb2Lk37h87FD8NBa9Z2?cluster=devnet) |
| **Mint 6, past the cap** | ❌ `ExceedsBacking` | [41CwQM…](https://explorer.solana.com/tx/41CwQM4NYe76U5Yi3PuXrbYs4jAkEzE4vL3SiRNRqoHKCN9K1AVu8HL3DMfsHEoLE6yCYFG2ezVXTrYcZQXpMZc6?cluster=devnet) |
| Attest after custodian drain (cap below supply) | ✅ ok, auto-paused | [5hVo3N…](https://explorer.solana.com/tx/5hVo3N3UpneKVcnQhDKsbtDwJRWo6f3yiQ2TVWSwPeawTUm7xox6r8phS75nTsBSGetWnVRJWqJJrysFQQ6oYanZ?cluster=devnet) |
| **Mint while paused** | ❌ `AutoPaused` | [48E3B1…](https://explorer.solana.com/tx/48E3B1fa1LgqRJB8dYUbDKWFVVvc4CM6uz12qnmG8T5yRt6axyNK3doCwSMc8jJLbhRC4rouZw46fkewincVwUeA?cluster=devnet) |
| Attest after top-up | ✅ ok, auto-resumed | [3V82EY…](https://explorer.solana.com/tx/3V82EYhdd4bGduGokJr2aQkEaxMso2P4T7qh2ErFDwAznFoghsNMSzCGteuVNFPHFfxoLcKiTYniFqjAyrJaJKuU?cluster=devnet) |
| **Mint after recovery** | ✅ ok | [3PExKt…](https://explorer.solana.com/tx/3PExKtvGEvAiouG7C4eoToDyStoRRBbEL9xfjX84KiSar2KvDZcXhQm9cjejV69VVT2HkbUaeprYDkV3JAHQUmnw?cluster=devnet) |

Setup transactions: [create mint](https://explorer.solana.com/tx/33LsvpL9XC3ondczSzJ6Nfm3z4gKXqziiPkTTZQCtffUGLq9NhuKaXtWMBoYvJ4HnU1JsMkvHMJdvPFv6EXLRXnq?cluster=devnet) · [`init_issuer`](https://explorer.solana.com/tx/x629gJ5PLPinUkTnjY7KJeoDfwuo8Ak1aH8yWFG2vQqgK7LvVpSoHPdm7bsVctLPxzFBQx3uL17iFwv21Txq96J?cluster=devnet) · [first attestation](https://explorer.solana.com/tx/3rrPMCb6jdRtenabb8JNFWYez8GoJTLKpyjTiCHSyW7hw1RTtZcLmK5AsfCZpVMMZBFP9pU6rczphjNVCwszpB39?cluster=devnet)

---

## Program reference

### Instructions

| Instruction | Who can call | What it does |
|---|---|---|
| `init_issuer` | Admin | Creates the issuer config and an empty attestation. Requires the config PDA to be the token's mint authority, with no other freeze authority; if the token has a Scaled UI Amount config, the PDA must control it too. Requires 6 decimals. |
| `submit_attestation` | Anyone (fee payer only) | Verifies the attestor's Ed25519 signature in the preceding instruction, plus nonce, timestamp, cluster and cap. Stores the report, sets or clears `auto_paused`, and applies split changes to the UI multiplier. |
| `mint_gated` | Minter | Mints only if not paused, the attestation is within the staleness window, and `supply + amount ≤ max_supply`. |
| `set_admin_paused` | Admin | Manual pause or unpause. Separate from `auto_paused`, so neither one clears the other. |

### Accounts

- **`IssuerConfig`**, PDA `["issuer", mint]`: `admin`, `minter`, `attestor`, `mint`, `staleness_secs`, `cluster_id`, `auto_paused`, `admin_paused`, `scaled_ui`. It is also the mint authority.
- **`Attestation`**, PDA `["attestation", issuer_config]`: the latest `nonce`, `observed_at`, `shares_held`, `split_num/den`, `other_chain_supply`, `max_supply`.

### Signed report layout

All integers are little-endian; the message is 129 bytes.

```
"LANTERN_ATTEST01" | program_id | issuer_config | cluster_id u8 | nonce u64 | observed_at i64 |
shares_held u64 | split_num u32 | split_den u32 | other_chain_supply u64 | max_supply u64
```

The TypeScript encoder is in [`anchor/client/report.ts`](anchor/client/report.ts).

### Errors

`Unauthorized`, `InvalidSignature`, `StaleAttestation`, `ExceedsBacking`, `AutoPaused`, `AdminPaused`, `NonceReplay`, `TimestampRegression`, `FutureTimestamp`, `DomainMismatch`, `MaxSupplyMismatch`, `InvalidSplitFactor`, `InvalidMintAuthority`, `InvalidFreezeAuthority`, `InvalidScaledUiAuthority`, `InvalidMintDecimals`, `InvalidStaleness`, `Overflow`.

---

## Repository layout

```
Lantern.md                     Product requirements document
anchor/
  programs/lantern/src/
    lib.rs                     Instruction entry points
    state.rs                   IssuerConfig, Attestation
    report.rs                  Report layout, backing rule, Ed25519 introspection
    errors.rs, events.rs
    instructions/              init_issuer, submit_attestation, mint_gated, set_admin_paused
  client/
    report.ts                  Report encoding and signing (shared with CRE / relayer)
    relayer.ts                 Relayer: build, sign, submit; mint helper
  scripts/
    seed-devnet.ts             Create token + issuer + first attestation on Devnet
    relay.ts                   Relay one attestation (CRE fallback path)
    examples.ts                Record the Devnet example transactions
  tests/lantern.ts             21 tests on a local validator
  deployments/                 Devnet addresses and example transaction links
```

---

## Running it

### Prerequisites

- Anchor CLI 0.32.1, Solana CLI 2.3.x, Rust, Node 22, Yarn
- Solana platform-tools **v1.54**. The default bundled toolchain's Cargo is too old for some dependencies, which need Rust edition 2024.

```bash
cd anchor
yarn install
```

### Build and test

```bash
yarn build   # anchor build with platform-tools v1.54, then IDL + TS types
yarn test    # anchor test --skip-build: 21 tests on a local validator (~20s)
```

The tests cover: an invalid mint authority, failing closed before the first attestation, a missing or wrong-key signature, a cap that breaks the backing rule, the wrong cluster, a future timestamp, a replayed nonce, a timestamp that doesn't increase, a signer other than the minter, a mint past the cap, auto-pause and auto-resume, admin pause independence, a 2-for-1 split (multiplier 2, cap unchanged, over-mint rejected), and staleness.

### Devnet scripts

These scripts use `~/.config/solana/id.json` as the admin, minter and fee payer, and `https://api.devnet.solana.com`.

```bash
yarn seed:devnet                       # new token + issuer + first attestation -> deployments/devnet.json
yarn relay --shares 102 --evm 2        # relay one attestation (add --split 2/1 for a split)
yarn examples                          # record success / rejection example transactions
```

`yarn seed:devnet` creates the attestor key at `anchor/keys/attestor.json`. That file is **gitignored**; never commit it.

---

## NOWNodes

The API key goes in `anchor/.env` as `NOWNODES_PRIVATE_KEY` (see `.env.example`; `.env` is gitignored). The key is verified against:

| Endpoint | Network | Planned use |
|---|---|---|
| `https://sol.nownodes.io` | Solana mainnet | Not used (program runs on Devnet) |
| `https://sol-testnet.nownodes.io` | Solana testnet | — |
| EVM endpoint (TBD) | EVM chain | CRE: ERC-20 `totalSupply` / `decimals` of the mirrored token |

NOWNodes does **not** offer a Solana Devnet endpoint. The program is therefore deployed and called through the public Devnet RPC, and NOWNodes covers the multichain supply reads. This table will become the full endpoint-to-component map once the CRE workflow and dashboard are built.

---

## Chainlink CRE

Not built yet. The workflow will read the mock custodian, read supply on each chain through NOWNodes, compute the cap, sign the report, and deliver it. Whether CRE can write to Solana directly is still open. Until then, it hands the signed report to the relayer (`anchor/client/relayer.ts`). The program verifies the signature itself, so the relayer only carries the report and isn't trusted.

---

## Hackathon disclosures

- **Build start time:** _TODO_
- **Pre-existing work:** _TODO_ (none in this repository before the hackathon start, other than the Anchor scaffold)
- **Mocks:** the custodian API is a mock. The second-chain supply in the Devnet examples is a fixed value of 2 tokens until the NOWNodes EVM read is wired in.
- **Compliance:** Lantern provides continuous, verifiable backing evidence that supports compliance. It does not make an issuer compliant.
