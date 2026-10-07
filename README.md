# Lantern

**Never more tokens than shares.**

Lantern is an enforcement layer for tokenized stocks. New tokens can only be minted when a fresh, signed attestation shows the custodian holds enough real shares to back them. If backing falls short, minting pauses automatically, onchain. When backing is restored, it resumes on its own.

Backing proof today is a trust claim or a periodic PDF. Lantern turns it into a rule the chain enforces.

> Built for TOKEN2049 Origins (Main track, Solana, Chainlink CRE, NOWNodes). Product spec: [`Lantern.md`](Lantern.md).

---

## Status

| Component | State |
|---|---|
| Solana program (Anchor) | ✅ Deployed to **Devnet**, 27 tests passing |
| Chainlink CRE workflow | ✅ Writes DON-signed attestations to Solana through the Keystone Forwarder. Evidence: CLI simulation plus `--broadcast` transactions on Devnet |
| NOWNodes | ✅ Ethereum Sepolia supply reads (CRE `EVMClient` and dashboard) |
| Sepolia mirror token | ✅ Deployed: [`0xb41e…e54C`](https://sepolia.etherscan.io/address/0xb41e1D98421BbD79d6D094e48DE9BFE01393e54C) |
| Mock custodian API | ✅ `custodian/server.ts` (**mock**) |
| Dashboard (Next.js) | ✅ `dashboard/` (runs locally; hosted URL: _TODO_) |
| One-command demo | ✅ `yarn demo`; full run recorded below |
| CRE deployment to the DON | ⛔ Needs CRE Early Access (account shows Deploy Access "Not enabled"). Evidence is simulation and broadcast, as the Chainlink track allows. |

---

## How it works

```
                         Chainlink CRE workflow (cron)
 Mock custodian ──HTTP──►  1. custodian shares + split      (HTTPClient, consensus)
 Sepolia mirror ──NOWNodes► 2. ERC-20 totalSupply, finalized (EVMClient)
 token                      3. cap = shares × den/num − EVM supply
                            4. DON-signed report            (SolanaClient.writeReport)
                                        │
                                        ▼
                         Keystone Forwarder (Chainlink, Solana)
                           verifies DON signatures, CPIs into ▼
                         Lantern program (Solana Devnet)
                           on_report: forwarder PDA + workflow owner/name check,
                                      nonce / timestamp / cluster, cap recomputed onchain,
                                      auto-pause or resume, split → Token-2022 UI multiplier
                           mint_gated: minter only · fresh attestation · supply + amount ≤ cap
                                        │
 Dashboard ◄── Devnet state + events, Sepolia supply via NOWNodes, live custodian (mock)
```

1. **Observe.** The workflow reads the custodian's share balance and cumulative split factor over HTTP, and the mirror token's supply on Ethereum Sepolia with `EVMClient`.
2. **Attest.** It computes the Solana cap and writes a Borsh-encoded `AttestationReport`. The oracle network signs it, and the Keystone Forwarder verifies those signatures on Solana before calling Lantern.
3. **Verify onchain.** `on_report` accepts only calls signed by the forwarder's authority address for Lantern, and only reports whose metadata names the configured workflow owner and name. It then applies the same checks as the relayer path: nonce, timestamp, cluster, and the **cap recomputed from the signed inputs**. A mismatch is rejected (`MaxSupplyMismatch`).
4. **Gate.** `mint_gated` succeeds only for the minter key, only while the attestation is fresh, and only within the cap. If supply is above the cap, an attestation auto-pauses minting; the next healthy one resumes it.

A second delivery path, `submit_attestation`, verifies an Ed25519 attestor signature instead. It's the relayer fallback and was used for the first Devnet examples.

### Backing rule

```
max_supply_solana = floor(shares_held × split_den / split_num) − ceil(supply_on_other_chains)
```

- Holdings are in **micro-shares** (1 share = 1,000,000). The token uses 6 decimals, so before any split one raw unit equals one micro-share. The 18-decimal Sepolia supply is converted to 6 decimals, **rounding up**, so rounding never creates capacity.
- `split_num / split_den` is the **cumulative** split factor (2/1 after a 2-for-1 split).
- **Splits don't create capacity.** After a 2-for-1 split, the custodian holds twice the shares, but they belong to existing holders, so the raw cap stays the same. The program sets the Token-2022 **Scaled UI Amount** multiplier to ×2, so every holder's displayed balance doubles.

### Trust model

- **Who attests:** a Chainlink CRE workflow, whose reports are signed by the oracle network and verified onchain by Chainlink's Keystone Forwarder. Lantern verifies three things itself: the call came from the forwarder's authority address for Lantern, the forwarder state is the configured one, and the report's workflow owner and name match `CreConfig`. Any other workflow using the same forwarder is rejected (`UnauthorizedWorkflow`).
- **Workflow can't overstate backing:** the program recomputes the cap from the signed share count, split and other-chain supply. The workflow can't sign an inflated cap.
- **Minter:** only the `minter` key can mint, and only within the cap. The admin can pause minting and set the CRE config, but can't raise the cap.
- **Fail closed:** attestations expire after a 180-second staleness window, so a stale feed blocks minting. Nonces and timestamps must strictly increase. The cluster ID is part of every report.
- **Scope:** minting is **gated on Solana** and **monitored on other chains**. Lantern doesn't control the Sepolia mirror's mint authority. A Sepolia mint between two attestations is subtracted from Solana capacity at the next attestation.
- **Current limits:** the CRE evidence comes from `cre workflow simulate --broadcast`, which uses Chainlink's **simulation forwarder** on Devnet and the simulator's fixed workflow owner (`0xaa…aa`). A deployed workflow would use the live Keystone Forwarder and your real workflow owner, a one-transaction config change (`yarn set-cre-config --env production`).
- **Roadmap:** deployed DON workflow, auditor co-signing, gated mints on other chains, real custodian integrations.

> **Mock disclosure:** the custodian is a **mock** API with demo controls (drain, top-up, split). No real custodian or broker is integrated. The Sepolia "mirror" is a demo ERC-20 we deployed to stand in for the stock token's EVM supply.

---

## Evidence

### Devnet deployment

| | |
|---|---|
| Program | [`CMo46d7niK6id7f8vUR25zQjKr77ykvKoukDeUEKCXuh`](https://explorer.solana.com/address/CMo46d7niK6id7f8vUR25zQjKr77ykvKoukDeUEKCXuh?cluster=devnet) |
| Cluster | Devnet |
| Demo token (Token-2022, 6 decimals, Scaled UI Amount) | [`7yupUQoWo5R7T6tvk7dCVjN4vXB94vSmSUHWeG5b4zM9`](https://explorer.solana.com/address/7yupUQoWo5R7T6tvk7dCVjN4vXB94vSmSUHWeG5b4zM9?cluster=devnet) |
| Issuer config (PDA, sole mint authority) | [`Vsf7QBUfHQSqnQG1wzdxVakRqsnCqFsSDeeAgHAG3fP`](https://explorer.solana.com/address/Vsf7QBUfHQSqnQG1wzdxVakRqsnCqFsSDeeAgHAG3fP?cluster=devnet) |
| CRE config (PDA) | [`9b5sZUa7pEBDQiA2TTP5nss6BHH9aUATw8vEMFPqAMgM`](https://explorer.solana.com/address/9b5sZUa7pEBDQiA2TTP5nss6BHH9aUATw8vEMFPqAMgM?cluster=devnet) (simulation forwarder `7kuEAA…cNK`, workflow `lantern-attest-staging`) |
| Sepolia mirror token (`mxAAPL`, 18 decimals) | [`0xb41e1D98421BbD79d6D094e48DE9BFE01393e54C`](https://sepolia.etherscan.io/address/0xb41e1D98421BbD79d6D094e48DE9BFE01393e54C) |
| Staleness window | 180 seconds |

Full addresses: [`anchor/deployments/devnet.json`](anchor/deployments/devnet.json).

### Full demo run: every attestation delivered by Chainlink CRE

Recorded with `yarn demo` ([`anchor/deployments/devnet-demo-run.json`](anchor/deployments/devnet-demo-run.json)). Each attestation is a `cre workflow simulate --broadcast` transaction through the forwarder into `on_report`, and each reads the Sepolia mirror's supply live.

| Beat | Result | Transaction |
|---|---|---|
| 1 · Healthy: 102 shares for 100 tokens (98 Solana + 2 Sepolia), CRE attestation, cap 100 | ✅ minting enabled | [5xtZdp…](https://explorer.solana.com/tx/5xtZdpCcu5gzbxEUqYJ6rMHahssKU2wxVSauo289njjgqMpXqFmo8AsNCDeX3F2bnkL9kVqNUhqNr1HgFu5AAGZu?cluster=devnet) |
| 2 · **Mint 1, within backing** | ✅ ok, supply 99 | [UCLy9S…](https://explorer.solana.com/tx/UCLy9SXynQ4xVcWUFB8DbAt6zE7ttuZnm6updEt2dYRo9aFuTdzsuJnWrG72CgM8W4ydEkyhwse4Qo21nZik83J?cluster=devnet) |
| 3 · Custodian drains 5 shares, CRE attestation, cap 95 < supply 99 | ✅ **auto-paused** | [2KNXsf…](https://explorer.solana.com/tx/2KNXsftAN6akoFtiJahx6F6Vacs6xVj5zTSfVEK4Gfjdzqj3TiTRFZfkU6V3VvSuJKvra3vonJAw36ggeoiVb21v?cluster=devnet) |
| 4 · **Mint 1 while unbacked** | ❌ **`AutoPaused`**, rejected onchain | [2XYhR4…](https://explorer.solana.com/tx/2XYhR4FcFTkY7zyQMxjb4G6dDAsxNTTEwWzsUnpU6s9kjEfu3zMDWwoM4TXPAVCGA7cNzaiAcvQaMCvxdhpCEUEr?cluster=devnet) |
| 5a · Top-up of 6 shares, CRE attestation, cap 101 | ✅ resumed, no manual action | [3y3W92…](https://explorer.solana.com/tx/3y3W92oAnH51XeVHGwkzPEqF8JT8YVzUpLWt3TzGhMTPhrx71eHezXZi5yMhog9dFoJ5N9UDj9EbeQSN9tfUoo1r?cluster=devnet) |
| 5b · **Mint 1 after recovery** | ✅ ok, supply 100 | [3tG68u…](https://explorer.solana.com/tx/3tG68uZZRLq85UAdEn34v1VjRWarxJM491pDiFt2P2wpD8NxhjMpox9RZyeLP58pV895dEvX8GZ4JVNxtxppBJC1?cluster=devnet) |
| 6a · 2-for-1 split: 206 shares, split 2/1, CRE attestation | ✅ cap unchanged (101), UI multiplier **×2** | [MRfsP3…](https://explorer.solana.com/tx/MRfsP3h4gecpN6LnoNGZGjn89xhnBPgcc6BSSrVdkAmMa5SJ8XEkwTpePk1G2cR6X8XDZAd6uHbCfm1wJnQ5rpG?cluster=devnet) |
| 6b · **Mint against the "new" split shares** | ❌ **`ExceedsBacking`**, rejected onchain | [4c1woq…](https://explorer.solana.com/tx/4c1woqpm5SdywqmvPFsDeSkeHr6wY5eqqubph7DbUoGAs61cp29drdBVzXg64Ydh3En5a2kZi4iXy9Qd7tDchJm3?cluster=devnet) |

Rejected mints are sent with preflight skipped, so they land onchain as failed transactions and the explorer shows the program error.

### Earlier examples (Ed25519 relayer path)

Recorded with `yarn examples` ([`anchor/deployments/devnet-examples.json`](anchor/deployments/devnet-examples.json)), before the CRE path existed: [attest](https://explorer.solana.com/tx/66mNtXhHj9umWHUWfoBj5WQSakESNnBdWR3dncXHstGrVzdBncFQxnGog5i4T7NqLT4WHn1PMjN6ce3K48EkLA4D?cluster=devnet) · [mint ✅](https://explorer.solana.com/tx/3cCa3TXL7tpQMrkx1AmLemkhcu4mWDbfzLaecfY8DcGyrbLeAGQDHoDFoxdV56vqf1M3uZb2Lk37h87FD8NBa9Z2?cluster=devnet) · [mint past cap ❌ `ExceedsBacking`](https://explorer.solana.com/tx/41CwQM4NYe76U5Yi3PuXrbYs4jAkEzE4vL3SiRNRqoHKCN9K1AVu8HL3DMfsHEoLE6yCYFG2ezVXTrYcZQXpMZc6?cluster=devnet) · [drain → auto-pause](https://explorer.solana.com/tx/5hVo3N3UpneKVcnQhDKsbtDwJRWo6f3yiQ2TVWSwPeawTUm7xox6r8phS75nTsBSGetWnVRJWqJJrysFQQ6oYanZ?cluster=devnet) · [mint ❌ `AutoPaused`](https://explorer.solana.com/tx/48E3B1fa1LgqRJB8dYUbDKWFVVvc4CM6uz12qnmG8T5yRt6axyNK3doCwSMc8jJLbhRC4rouZw46fkewincVwUeA?cluster=devnet) · [top-up → resume](https://explorer.solana.com/tx/3V82EYhdd4bGduGokJr2aQkEaxMso2P4T7qh2ErFDwAznFoghsNMSzCGteuVNFPHFfxoLcKiTYniFqjAyrJaJKuU?cluster=devnet) · [mint ✅](https://explorer.solana.com/tx/3PExKtvGEvAiouG7C4eoToDyStoRRBbEL9xfjX84KiSar2KvDZcXhQm9cjejV69VVT2HkbUaeprYDkV3JAHQUmnw?cluster=devnet)

Setup: [create mint](https://explorer.solana.com/tx/33LsvpL9XC3ondczSzJ6Nfm3z4gKXqziiPkTTZQCtffUGLq9NhuKaXtWMBoYvJ4HnU1JsMkvHMJdvPFv6EXLRXnq?cluster=devnet) · [`init_issuer`](https://explorer.solana.com/tx/x629gJ5PLPinUkTnjY7KJeoDfwuo8Ak1aH8yWFG2vQqgK7LvVpSoHPdm7bsVctLPxzFBQx3uL17iFwv21Txq96J?cluster=devnet) · [`set_cre_config`](https://explorer.solana.com/tx/2DqqC9jvUS7wnwEJD22bAp5zQhrDmNqqevAjpruXnWaF13CJWQN2Qwrkze6uoMDZwVtnHQ4fEjUoPgDUzMzUYxn?cluster=devnet) · [Sepolia mirror deploy](https://sepolia.etherscan.io/tx/0xc8153aa689ac7093bc561ff1b8f930682e7621bd8862435ab7fbc257b99eaa40)

---

## Chainlink CRE

The workflow is in [`cre/lantern-attest/main.ts`](cre/lantern-attest/main.ts) (TypeScript, CRE SDK).

| Step | CRE capability | Detail |
|---|---|---|
| Trigger | `CronCapability` | `*/30 * * * * *` |
| Custodian holdings | `HTTPClient` | `GET /holdings`; consensus is median for shares and identical for the split factor |
| Sepolia mirror supply | `EVMClient.callContract` | `totalSupply()` at the last finalized block on `ethereum-testnet-sepolia`, converted to 6 decimals and rounded up |
| Write | `SolanaClient` through bindings generated from Lantern's Anchor IDL (`cre generate-bindings solana`) | `writeReportFromAttestationReport` → Keystone Forwarder → `on_report`. Any non-success write fails the run. |

CRE can't read Solana yet, so the workflow doesn't know the onchain nonce. It uses the oracle network's time in seconds as both `nonce` and `observed_at`, which satisfies the program's strictly-increasing checks.

```bash
cd cre
cre workflow simulate lantern-attest --target staging-settings --non-interactive --trigger-index 0              # dry run
cre workflow simulate lantern-attest --target staging-settings --non-interactive --trigger-index 0 --broadcast  # real Devnet tx
```

`cre/.env` (gitignored) needs:
- `CRE_NOWNODES_API_KEY`, used in `project.yaml`'s Sepolia RPC URL,
- `CRE_SOLANA_PRIVATE_KEY`, the path to a funded Devnet keypair that pays transaction fees,
- `CRE_ETH_PRIVATE_KEY`, required by the CLI for `--broadcast` once an EVM chain is configured.

---

## NOWNodes

Endpoint-to-component map:

| Endpoint | Network | Used by | For |
|---|---|---|---|
| `https://eth-sepolia.nownodes.io/${CRE_NOWNODES_API_KEY}` | Ethereum Sepolia | CRE workflow: `EVMClient` RPC in [`cre/project.yaml`](cre/project.yaml) | `totalSupply()` of the mirror token at the finalized block, during simulation and broadcast |
| `https://eth-sepolia.nownodes.io` (`api-key` header) | Ethereum Sepolia | Dashboard server route [`/api/state`](dashboard/src/lib/server/lantern.ts) | The "Ethereum Sepolia via NOWNodes (finalized)" supply panel. The key stays server-side. |
| `https://sol.nownodes.io` | Solana mainnet | Not used | Verified working; Lantern runs on Devnet |
| `https://sol-testnet.nownodes.io` | Solana testnet | Not used | Verified working (genesis `4uhcVJ…`); `getTokenSupply` is refused on this plan |

**NOWNodes has no Solana Devnet endpoint.** We confirmed `sol-testnet` is Solana *testnet*: its genesis hash matches public testnet, and Lantern's Devnet accounts don't exist there. So every Solana Devnet read and write goes through `https://api.devnet.solana.com`, and NOWNodes handles the second chain.

A *deployed* CRE workflow's `EVMClient` would use the oracle network's own EVM access, not `project.yaml`, so NOWNodes is in the CRE path for simulation. The dashboard's server-side read uses NOWNodes in every environment.

---

## Dashboard

[`dashboard/`](dashboard/) is a Next.js 16 app with a dense, dark "risk desk" layout:
- **Status banner:** whether minting is enabled, and why it's paused if not.
- **Backing ratio**, comparing the live custodian with tokens on Solana plus Sepolia.
- **Supply by chain:** Solana marked **GATED**, Sepolia marked **MONITORED** and read through NOWNodes.
- **Latest attestation**, versus the live custodian, flagged when the custodian has changed and not yet been attested.
- **Mint console:** wallet connect, then `mint_gated`. Rejections show the decoded program error and an explorer link.
- **Mock-custodian demo controls.**
- **Event history:** decoded program events labeled by delivery path (**CRE forwarder**, **Ed25519 relayer**, minter wallet or admin).

```bash
cd dashboard && npm install
# .env.local (gitignored): NEXT_PUBLIC_SOLANA_RPC, CUSTODIAN_URL, NOWNODES_API_KEY
npm run dev   # http://localhost:3000
```

The minter is the admin wallet. Import it into a Devnet wallet such as Phantom to mint from the console; other wallets are rejected onchain with `Unauthorized`.

---

## Running it

### Prerequisites

- Anchor CLI 0.32.1, Solana CLI 2.3.x, Rust, Node 22, Yarn, Bun, Foundry
- Solana platform-tools **v1.54**. The default bundled toolchain's Cargo is too old for some dependencies, which need Rust edition 2024.
- CRE CLI 1.29 or later (built with 1.37.0), logged in with `cre login`

### Program: build and test

```bash
cd anchor && yarn install
yarn build   # anchor build (platform-tools v1.54) + IDL/types for lantern and test_forwarder
yarn test    # 27 tests on a local validator
```

The tests cover:
- **Setup:** an invalid mint authority, and failing closed before the first attestation.
- **Signature path:** a missing or wrong-key signature, a cap that breaks the backing rule, the wrong cluster, a future timestamp, a replayed nonce, and a timestamp that doesn't increase.
- **Minting:** a signer other than the minter, and a mint past the cap.
- **Pauses:** auto-pause and auto-resume, and admin-pause independence.
- **2-for-1 split:** multiplier ×2, cap unchanged, over-mint rejected.
- **Staleness.**
- **CRE path, through a test-only forwarder:**
  - only the admin can set the CRE config,
  - a forwarded report is accepted and makes minting possible again,
  - another workflow owner is rejected,
  - a replayed nonce is rejected,
  - a faked forwarder authority is rejected,
  - an unconfigured forwarder state is rejected.

### Full demo

```bash
bun custodian/server.ts                       # mock custodian on :8787
cd dashboard && npm run dev                   # dashboard on :3000
cd anchor && yarn demo                        # pauses before each beat (Enter); --auto to skip pauses, --relayer for the fallback path
```

The script is relative to current supply, so re-runs work. It handles public-RPC rate limits: it checks a CRE transaction onchain itself if the CLI times out, and retries a CRE run that hits a 429.

### Other Devnet scripts (`anchor/`)

```bash
yarn seed:devnet                                       # new token + issuer + first attestation
yarn set-cre-config --env simulation --workflow lantern-attest-staging
yarn relay --shares 102 --evm 2 [--split 2/1]          # one attestation via the Ed25519 relayer
yarn examples                                          # relayer-path example transactions
```

The scripts use `~/.config/solana/id.json` as admin, minter and fee payer. `anchor/keys/attestor.json` (the relayer key) is gitignored.

---

## Program reference

| Instruction | Who can call | What it does |
|---|---|---|
| `init_issuer` | Admin | Creates the issuer config and an empty attestation. Requires the config PDA to be the token's mint authority (and its UI-multiplier authority if one exists), with no other freeze authority, and 6 decimals. |
| `on_report` | Keystone Forwarder (CPI) | CRE path. Checks the forwarder state and authority PDA, plus the workflow owner and name from `metadata`, then applies the report. |
| `submit_attestation` | Anyone (fee payer only) | Relayer path. Verifies the attestor's Ed25519 signature in the preceding instruction, then applies the report. |
| `mint_gated` | Minter | Mints only if not paused, the attestation is within the staleness window, and `supply + amount ≤ max_supply`. |
| `set_cre_config` | Admin | Sets the allowed forwarder program, forwarder state, workflow owner and workflow name. |
| `set_admin_paused` | Admin | Manual pause or unpause, separate from `auto_paused`. |

"Applies the report" (`apply_report`, shared by both paths) means: check cluster, nonce and timestamp; recompute the cap; store the report; set or clear `auto_paused`; and update the Token-2022 UI multiplier when the split changes. It emits `AttestationSubmitted`, `PauseChanged` and `CorporateAction`.

**Accounts:**
- **`IssuerConfig`** `["issuer", mint]`: the mint authority.
- **`Attestation`** `["attestation", issuer]`: the latest report.
- **`CreConfig`** `["cre", issuer]`: the allowed forwarder and workflow.

**CRE metadata layout:** `workflow_cid[32] | workflow_name[10] | workflow_owner[20] | report_id[2]`. The name is the first 10 hex characters of `sha256(name)` (Chainlink's `HashTruncateName`).

**Errors:**
`Unauthorized`, `InvalidSignature`, `StaleAttestation`, `ExceedsBacking`, `AutoPaused`, `AdminPaused`, `NonceReplay`, `TimestampRegression`, `FutureTimestamp`, `DomainMismatch`, `MaxSupplyMismatch`, `InvalidSplitFactor`, `InvalidMintAuthority`, `InvalidFreezeAuthority`, `InvalidScaledUiAuthority`, `InvalidMintDecimals`, `InvalidStaleness`, `Overflow`, `InvalidForwarder`, `InvalidForwarderAuthority`, `InvalidMetadata`, `UnauthorizedWorkflow`, `InvalidReportPayload`.

---

## Repository layout

```
Lantern.md                 Product requirements document
anchor/                    Solana program, clients, scripts, tests
  programs/lantern/        Lantern program (on_report, submit_attestation, mint_gated, …)
  programs/test-forwarder/ Test-only Keystone Forwarder stand-in (localnet only, never deployed)
  client/                  report.ts (encoding, PDAs), relayer.ts (submit, mint)
  scripts/                 seed-devnet, set-cre-config, relay, examples, demo
  deployments/             Devnet addresses and transaction links
cre/                       Chainlink CRE project (workflow lantern-attest, generated Solana bindings)
custodian/server.ts        MOCK custodian API
evm/                       Sepolia mirror token (Foundry)
dashboard/                 Next.js dashboard
```

---

## Hackathon disclosures

- **Build start time:** _TODO_ (the PRD was written and the first commit made on 2026-10-07, UTC+8; the first commit is at 01:50)
- **Pre-existing work:** _TODO_. Nothing in this repository predates the hackathon apart from generated scaffolds (`anchor init`, `cre init`, `create-next-app`).
- **Mocks:**
  - the custodian API is a mock,
  - the Sepolia mirror is a demo ERC-20 that we control,
  - CRE ran as a simulation, using Chainlink's simulation forwarder and the simulator's fixed workflow owner; it isn't a deployed DON workflow.
- **Compliance:** Lantern provides continuous, verifiable backing evidence that supports compliance. It does not make an issuer compliant.
