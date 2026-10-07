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
import { TestForwarder } from "../target/types/test_forwarder";
import {
  AttestationReport,
  CLUSTER_ID,
  attestationPda,
  backedMaxSupply,
  creConfigPda,
  forwarderAuthorityPda,
  issuerPda,
  signReportIx,
  workflowMetadata,
} from "../client/report";

const SHARE = 1_000_000; // micro-shares per share; also raw units per token (6 decimals)
const STALENESS_SECS = 8;

const shares = (n: number) => new BN(n * SHARE);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function expectError(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e: any) {
    // Errors raised inside a CPI (on_report) only show up in the logs.
    const actual =
      e?.error?.errorCode?.code ?? [String(e), ...(e?.logs ?? e?.transactionLogs ?? [])].join("\n");
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

  describe("CRE on_report via the Keystone Forwarder", () => {
    const forwarder = anchor.workspace.testForwarder as Program<TestForwarder>;
    const fwdState = Keypair.generate();
    const creConfig = creConfigPda(program.programId, issuer);
    const authority = () =>
      forwarderAuthorityPda(forwarder.programId, fwdState.publicKey, program.programId);

    const WORKFLOW_NAME = Buffer.from("lantern-wf"); // 10 bytes
    const WORKFLOW_OWNER = Buffer.alloc(20, 0xab);

    const receiverAccounts = () => [
      { pubkey: issuer, isSigner: false, isWritable: true },
      { pubkey: creConfig, isSigner: false, isWritable: false },
      { pubkey: attestation, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    const encode = (r: AttestationReport) =>
      program.coder.types.encode("attestationReport", r);

    function forward(r: AttestationReport, owner: Buffer = WORKFLOW_OWNER) {
      return forwarder.methods
        .forward(workflowMetadata(WORKFLOW_NAME, owner), encode(r))
        .accountsPartial({
          state: fwdState.publicKey,
          forwarderAuthority: authority(),
          receiver: program.programId,
        })
        .remainingAccounts(receiverAccounts())
        .rpc();
    }

    before(async () => {
      await forwarder.methods
        .initState()
        .accountsPartial({ payer: admin.publicKey, state: fwdState.publicKey })
        .signers([fwdState])
        .rpc();
    });

    function setCreConfig(signer: Keypair = admin) {
      return program.methods
        .setCreConfig({
          forwarderProgram: forwarder.programId,
          forwarderState: fwdState.publicKey,
          workflowOwner: Array.from(WORKFLOW_OWNER),
          workflowName: Array.from(WORKFLOW_NAME),
        })
        .accountsPartial({ admin: signer.publicKey, issuerConfig: issuer, creConfig })
        .signers(signer === admin ? [] : [signer])
        .rpc();
    }

    it("only the admin can set the CRE workflow", async () => {
      await expectError(setCreConfig(minter), "Unauthorized");
      await setCreConfig();
      const cfg = await program.account.creConfig.fetch(creConfig);
      expect(cfg.forwarderProgram.toBase58()).to.eq(forwarder.programId.toBase58());
      expect(Buffer.from(cfg.workflowOwner).equals(WORKFLOW_OWNER)).to.eq(true);
    });

    it("accepts a report forwarded from the configured workflow and resumes minting", async () => {
      const r = report(shares(300), { splitNum: 2, splitDen: 1 }); // cap 148
      await forward(r);
      nonce = r.nonce.toNumber();
      lastObservedAt = r.observedAt.toNumber();

      const a = await program.account.attestation.fetch(attestation);
      expect(a.nonce.toNumber()).to.eq(nonce);
      expect(a.maxSupply.toString()).to.eq(shares(148).toString());
      await mintGated(shares(1)); // fresh again after the stale test
    });

    it("rejects a report from another workflow owner", async () => {
      await expectError(
        forward(report(shares(300), { splitNum: 2, splitDen: 1 }), Buffer.alloc(20, 0xcd)),
        "UnauthorizedWorkflow"
      );
    });

    it("applies the same checks as the relayer path (replayed nonce)", async () => {
      await expectError(
        forward(report(shares(300), { splitNum: 2, splitDen: 1, nonce: new BN(nonce) })),
        "NonceReplay"
      );
    });

    it("rejects a direct call that fakes the forwarder authority", async () => {
      const fake = Keypair.generate();
      const r = report(shares(300), { splitNum: 2, splitDen: 1 });
      await expectError(
        program.methods
          .onReport(workflowMetadata(WORKFLOW_NAME, WORKFLOW_OWNER), encode(r))
          .accountsPartial({
            state: fwdState.publicKey,
            forwarderAuthority: fake.publicKey,
            issuerConfig: issuer,
            creConfig,
            attestation,
            mint,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([fake])
          .rpc(),
        "InvalidForwarderAuthority"
      );
    });

    it("rejects a forwarder state that is not the configured one", async () => {
      const otherState = Keypair.generate();
      await forwarder.methods
        .initState()
        .accountsPartial({ payer: admin.publicKey, state: otherState.publicKey })
        .signers([otherState])
        .rpc();
      const r = report(shares(300), { splitNum: 2, splitDen: 1 });
      await expectError(
        forwarder.methods
          .forward(workflowMetadata(WORKFLOW_NAME, WORKFLOW_OWNER), encode(r))
          .accountsPartial({
            state: otherState.publicKey,
            forwarderAuthority: forwarderAuthorityPda(
              forwarder.programId,
              otherState.publicKey,
              program.programId
            ),
            receiver: program.programId,
          })
          .remainingAccounts(receiverAccounts())
          .rpc(),
        "InvalidForwarder"
      );
    });
  });

  describe("open minting (set_minter)", () => {
    const stranger = Keypair.generate();
    let strangerAta: PublicKey;

    function setMinter(newMinter: PublicKey, signer: Keypair = admin) {
      return program.methods
        .setMinter(newMinter)
        .accountsPartial({ admin: signer.publicKey, issuerConfig: issuer })
        .signers(signer === admin ? [] : [signer])
        .rpc();
    }

    function mintAs(signer: Keypair, to: PublicKey, amount: BN) {
      return program.methods
        .mintGated(amount)
        .accountsPartial({
          minter: signer.publicKey,
          issuerConfig: issuer,
          attestation,
          mint,
          destination: to,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([signer])
        .rpc();
    }

    before(async () => {
      const sig = await conn.requestAirdrop(stranger.publicKey, 1e9);
      await conn.confirmTransaction(sig, "confirmed");
      strangerAta = await createAssociatedTokenAccountIdempotent(
        conn, stranger, mint, stranger.publicKey, { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID
      );
      // Fresh attestation (cap 148) so only the minter rule is under test.
      await attest(report(shares(300), { splitNum: 2, splitDen: 1 }));
    });

    it("only the admin can change the minter", async () => {
      await expectError(setMinter(PublicKey.default, stranger), "Unauthorized");
    });

    it("rejects a non-minter while minting is restricted", async () => {
      await expectError(mintAs(stranger, strangerAta, shares(1)), "Unauthorized");
    });

    it("lets any wallet mint within backing once opened", async () => {
      await setMinter(PublicKey.default);
      expect((await program.account.issuerConfig.fetch(issuer)).minter.toBase58()).to.eq(PublicKey.default.toBase58());
      await mintAs(stranger, strangerAta, shares(1));
      const bal = await conn.getTokenAccountBalance(strangerAta, provider.opts.commitment);
      expect(bal.value.amount).to.eq(shares(1).toString());
    });

    it("still enforces the cap in open mode", async () => {
      await expectError(mintAs(stranger, strangerAta, shares(1000)), "ExceedsBacking");
    });

    it("closing it again restores the single minter", async () => {
      await setMinter(minter.publicKey);
      await expectError(mintAs(stranger, strangerAta, shares(1)), "Unauthorized");
      await mintGated(shares(1));
    });
  });
});
