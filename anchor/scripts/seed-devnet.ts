/**
 * X2: seed a Devnet demo issuer.
 *
 * Creates a Token-2022 mint (6 decimals, Scaled UI Amount, PDA as mint +
 * multiplier authority, no freeze authority), runs init_issuer, and submits
 * the first attestation: 102 shares held, 2 tokens on EVM, cap 100.
 *
 * Writes keys/attestor.json (gitignored) and deployments/devnet.json.
 *
 * Run: yarn seed:devnet
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotent,
  createInitializeMintInstruction,
  createInitializeScaledUiAmountConfigInstruction,
  getMintLen,
} from "@solana/spl-token";
import {
  Keypair,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import { Lantern } from "../target/types/lantern";
import {
  AttestationReport,
  CLUSTER_ID,
  attestationPda,
  backedMaxSupply,
  issuerPda,
  signReportIx,
} from "../client/report";

const SHARE = 1_000_000;
const STALENESS_SECS = 180;
const ROOT = path.join(__dirname, "..");

function loadOrCreateKeypair(file: string): Keypair {
  if (fs.existsSync(file)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))));
  }
  const kp = Keypair.generate();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  return kp;
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const conn = provider.connection;
  const program = anchor.workspace.lantern as Program<Lantern>;
  const admin = (provider.wallet as anchor.Wallet).payer;

  // Demo: the admin wallet is also the minter, so one wallet drives the mint console.
  const minter = admin.publicKey;
  const attestor = loadOrCreateKeypair(path.join(ROOT, "keys", "attestor.json"));

  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;
  const issuer = issuerPda(program.programId, mint);
  const attestation = attestationPda(program.programId, issuer);

  console.log("program  ", program.programId.toBase58());
  console.log("admin    ", admin.publicKey.toBase58());
  console.log("attestor ", attestor.publicKey.toBase58());
  console.log("mint     ", mint.toBase58());
  console.log("issuer   ", issuer.toBase58());

  const len = getMintLen([ExtensionType.ScaledUiAmountConfig]);
  const createMintSig = await provider.sendAndConfirm(
    new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: admin.publicKey,
        newAccountPubkey: mint,
        space: len,
        lamports: await conn.getMinimumBalanceForRentExemption(len),
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeScaledUiAmountConfigInstruction(mint, issuer, 1, TOKEN_2022_PROGRAM_ID),
      createInitializeMintInstruction(mint, 6, issuer, null, TOKEN_2022_PROGRAM_ID)
    ),
    [mintKp]
  );
  console.log("create mint      ", createMintSig);

  const initSig = await program.methods
    .initIssuer({
      minter,
      attestor: attestor.publicKey,
      stalenessSecs: STALENESS_SECS,
      clusterId: CLUSTER_ID.devnet,
    })
    .accountsPartial({
      admin: admin.publicKey,
      mint,
      issuerConfig: issuer,
      attestation,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .rpc();
  console.log("init_issuer      ", initSig);

  const destination = await createAssociatedTokenAccountIdempotent(
    conn,
    admin,
    mint,
    admin.publicKey,
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID
  );

  const sharesHeld = new BN(102 * SHARE);
  const otherChainSupply = new BN(2 * SHARE);
  const report: AttestationReport = {
    clusterId: CLUSTER_ID.devnet,
    nonce: new BN(1),
    observedAt: new BN(Math.floor(Date.now() / 1000)),
    sharesHeld,
    splitNum: 1,
    splitDen: 1,
    otherChainSupply,
    maxSupply: backedMaxSupply(sharesHeld, 1, 1, otherChainSupply),
  };
  const attestSig = await program.methods
    .submitAttestation(report)
    .accountsPartial({
      issuerConfig: issuer,
      attestation,
      mint,
      instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .preInstructions([signReportIx(program.programId, issuer, report, attestor.secretKey)])
    .rpc();
  console.log("first attestation", attestSig);

  const out = {
    cluster: "devnet",
    programId: program.programId.toBase58(),
    mint: mint.toBase58(),
    issuerConfig: issuer.toBase58(),
    attestation: attestation.toBase58(),
    admin: admin.publicKey.toBase58(),
    minter: minter.toBase58(),
    attestor: attestor.publicKey.toBase58(),
    adminTokenAccount: destination.toBase58(),
    stalenessSecs: STALENESS_SECS,
    transactions: { createMint: createMintSig, initIssuer: initSig, firstAttestation: attestSig },
    createdAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.join(ROOT, "deployments"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "deployments", "devnet.json"), JSON.stringify(out, null, 2) + "\n");
  console.log("wrote deployments/devnet.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
