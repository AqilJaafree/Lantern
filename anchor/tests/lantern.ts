import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotent,
  createInitializeMintInstruction,
  createInitializeScaledUiAmountConfigInstruction,
  getMint,
  getMintLen,
  getScaledUiAmountConfig,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { expect } from "chai";
import { Lantern } from "../target/types/lantern";
import {
  AttestationReport,
  CLUSTER_ID,
  attestationPda,
  backedMaxSupply,
  issuerPda,
  signReportIx,
} from "../client/report";

const SHARE = 1_000_000; // micro-shares per share; also raw units per token (6 decimals)
const STALENESS_SECS = 8;

const shares = (n: number) => new BN(n * SHARE);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function expectError(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e: any) {
    const actual = e?.error?.errorCode?.code ?? String(e);
    expect(actual).to.include(code);
    return;
  }
  expect.fail(`expected ${code}, but the transaction succeeded`);
}

describe("lantern", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const conn = provider.connection;
  const program = anchor.workspace.lantern as Program<Lantern>;
  const admin = (provider.wallet as anchor.Wallet).payer;

  const minter = Keypair.generate();
  const attestor = Keypair.generate();
  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;
  const issuer = issuerPda(program.programId, mint);
  const attestation = attestationPda(program.programId, issuer);
  let destination: PublicKey;

  let nonce = 0;
  let lastObservedAt = 0;

  /** Build a report whose max_supply follows the backing rule unless overridden. */
  function report(
    sharesHeld: BN,
    opts: Partial<AttestationReport> & { evm?: BN } = {}
  ): AttestationReport {
    const splitNum = opts.splitNum ?? 1;
    const splitDen = opts.splitDen ?? 1;
    const otherChainSupply = opts.evm ?? shares(2);
    const observedAt = Math.max(lastObservedAt + 1, Math.floor(Date.now() / 1000));
    return {
      clusterId: opts.clusterId ?? CLUSTER_ID.localnet,
      nonce: opts.nonce ?? new BN(nonce + 1),
      observedAt: opts.observedAt ?? new BN(observedAt),
      sharesHeld,
      splitNum,
      splitDen,
      otherChainSupply,
      maxSupply:
        opts.maxSupply ?? backedMaxSupply(sharesHeld, splitNum, splitDen, otherChainSupply),
    };
  }

  function submit(r: AttestationReport, signer: Keypair = attestor, withSigIx = true) {
    const pre = withSigIx ? [signReportIx(program.programId, issuer, r, signer.secretKey)] : [];
    return program.methods
      .submitAttestation(r)
      .accountsPartial({
        issuerConfig: issuer,
        attestation,
        mint,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .preInstructions(pre)
      .rpc();
  }

  /** Submit and track nonce / timestamp for the next report. */
  async function attest(r: AttestationReport) {
    await submit(r);
    nonce = r.nonce.toNumber();
    lastObservedAt = r.observedAt.toNumber();
  }

  function mintGated(amount: BN, signer: Keypair = minter) {
    return program.methods
      .mintGated(amount)
      .accountsPartial({
        minter: signer.publicKey,
        issuerConfig: issuer,
        attestation,
        mint,
        destination,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([signer])
      .rpc();
  }

  function setAdminPaused(paused: boolean, signer: Keypair = admin) {
    return program.methods
      .setAdminPaused(paused)
      .accountsPartial({ admin: signer.publicKey, issuerConfig: issuer })
      .signers(signer === admin ? [] : [signer])
      .rpc();
  }

  const supply = async () => (await getMint(conn, mint, provider.opts.commitment, TOKEN_2022_PROGRAM_ID)).supply;

  /** Token-2022 mint with Scaled UI Amount; PDA is mint + multiplier authority, no freeze authority. */
  async function createMint(kp: Keypair, mintAuthority: PublicKey) {
    const len = getMintLen([ExtensionType.ScaledUiAmountConfig]);
    const lamports = await conn.getMinimumBalanceForRentExemption(len);
    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: admin.publicKey,
        newAccountPubkey: kp.publicKey,
        space: len,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeScaledUiAmountConfigInstruction(
        kp.publicKey,
        issuerPda(program.programId, kp.publicKey),
        1,
        TOKEN_2022_PROGRAM_ID
      ),
      createInitializeMintInstruction(kp.publicKey, 6, mintAuthority, null, TOKEN_2022_PROGRAM_ID)
    );
    await provider.sendAndConfirm(tx, [kp]);
  }

  function initIssuer(m: PublicKey) {
    return program.methods
      .initIssuer({
        minter: minter.publicKey,
        attestor: attestor.publicKey,
        stalenessSecs: STALENESS_SECS,
        clusterId: CLUSTER_ID.localnet,
      })
      .accountsPartial({
        admin: admin.publicKey,
        mint: m,
        issuerConfig: issuerPda(program.programId, m),
        attestation: attestationPda(program.programId, issuerPda(program.programId, m)),
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  before(async () => {
    const sig = await conn.requestAirdrop(minter.publicKey, 1e9);
    await conn.confirmTransaction(sig, "confirmed");
  });

  describe("init_issuer", () => {
    it("rejects a mint whose authority is not the program PDA", async () => {
      const rogue = Keypair.generate();
      await createMint(rogue, admin.publicKey);
      await expectError(initIssuer(rogue.publicKey), "InvalidMintAuthority");
    });

    it("initializes with the PDA as sole mint authority", async () => {
      await createMint(mintKp, issuer);
      await initIssuer(mint);
      destination = await createAssociatedTokenAccountIdempotent(
        conn,
        admin,
        mint,
        admin.publicKey,
        { commitment: "confirmed" },
        TOKEN_2022_PROGRAM_ID
      );

      const cfg = await program.account.issuerConfig.fetch(issuer);
      expect(cfg.minter.toBase58()).to.eq(minter.publicKey.toBase58());
      expect(cfg.attestor.toBase58()).to.eq(attestor.publicKey.toBase58());
      expect(cfg.scaledUi).to.eq(true);
      expect(cfg.autoPaused).to.eq(false);
      expect(cfg.adminPaused).to.eq(false);
    });

    it("blocks minting before the first attestation (fail closed)", async () => {
      await expectError(mintGated(shares(1)), "StaleAttestation");
    });
  });

  describe("submit_attestation", () => {
    it("rejects a report without the Ed25519 signature instruction", async () => {
      await expectError(submit(report(shares(102)), attestor, false), "InvalidSignature");
    });

    it("rejects a report signed by the wrong key", async () => {
      await expectError(submit(report(shares(102)), Keypair.generate()), "InvalidSignature");
    });

    it("rejects a max_supply that breaks the backing rule", async () => {
      await expectError(
        submit(report(shares(102), { maxSupply: shares(1000) })),
        "MaxSupplyMismatch"
      );
    });

    it("rejects a report for another cluster", async () => {
      await expectError(
        submit(report(shares(102), { clusterId: CLUSTER_ID.devnet })),
        "DomainMismatch"
      );
    });

    it("rejects a timestamp in the future", async () => {
      const future = new BN(Math.floor(Date.now() / 1000) + 3600);
      await expectError(submit(report(shares(102), { observedAt: future })), "FutureTimestamp");
    });

    it("accepts a healthy report: 102 shares, 2 tokens on EVM, cap 100", async () => {
      await attest(report(shares(102)));
      const a = await program.account.attestation.fetch(attestation);
      expect(a.maxSupply.toString()).to.eq(shares(100).toString());
      expect(a.otherChainSupply.toString()).to.eq(shares(2).toString());
    });

    it("rejects a replayed nonce", async () => {
      await expectError(submit(report(shares(102), { nonce: new BN(nonce) })), "NonceReplay");
    });

    it("rejects a timestamp that does not increase", async () => {
      await expectError(
        submit(report(shares(102), { observedAt: new BN(lastObservedAt) })),
        "TimestampRegression"
      );
    });
  });

  describe("mint_gated", () => {
    it("rejects a signer that is not the minter", async () => {
      const rando = Keypair.generate();
      await expectError(mintGated(shares(1), rando), "Unauthorized");
    });

    it("mints within backing", async () => {
      await mintGated(shares(98));
      expect((await supply()).toString()).to.eq(shares(98).toString());
    });

    it("rejects a mint past the cap", async () => {
      await expectError(mintGated(shares(3)), "ExceedsBacking");
    });
  });

  describe("auto-pause and admin pause", () => {
    it("custodian drain auto-pauses minting", async () => {
      await attest(report(shares(96))); // cap 94 < supply 98
      expect((await program.account.issuerConfig.fetch(issuer)).autoPaused).to.eq(true);
      await expectError(mintGated(new BN(1)), "AutoPaused");
    });

    it("only the admin can pause", async () => {
      await expectError(setAdminPaused(true, minter), "Unauthorized");
    });

    it("top-up clears the auto-pause but not an admin pause", async () => {
      await setAdminPaused(true);
      await attest(report(shares(102))); // cap back to 100
      const cfg = await program.account.issuerConfig.fetch(issuer);
      expect(cfg.autoPaused).to.eq(false);
      expect(cfg.adminPaused).to.eq(true);
      await expectError(mintGated(new BN(1)), "AdminPaused");
    });

    it("minting resumes after admin unpause", async () => {
      await setAdminPaused(false);
      await mintGated(shares(1));
      expect((await supply()).toString()).to.eq(shares(99).toString());
    });
  });

  describe("corporate action: 2-for-1 split", () => {
    it("doubles displayed balances without adding mint capacity", async () => {
      // Custodian now holds 204 post-split shares; cumulative split 2/1.
      await attest(report(shares(204), { splitNum: 2, splitDen: 1 }));

      const a = await program.account.attestation.fetch(attestation);
      expect(a.maxSupply.toString()).to.eq(shares(100).toString()); // unchanged raw cap

      const m = await getMint(conn, mint, provider.opts.commitment, TOKEN_2022_PROGRAM_ID);
      expect(getScaledUiAmountConfig(m)!.multiplier).to.eq(2);
    });

    it("rejects minting against the 'new' shares", async () => {
      // Without split handling the cap would be 202; supply 99 + 50 must fail.
      await expectError(mintGated(shares(50)), "ExceedsBacking");
      await mintGated(shares(1)); // the real remaining capacity still works
    });
  });

  describe("freshness", () => {
    it("blocks minting once the attestation goes stale", async () => {
      await attest(report(shares(300), { splitNum: 2, splitDen: 1 }));
      await sleep((STALENESS_SECS + 4) * 1000);
      await expectError(mintGated(new BN(1)), "StaleAttestation");
    });
  });
});
