import { BN } from "@coral-xyz/anchor";
import { Ed25519Program, PublicKey, TransactionInstruction } from "@solana/web3.js";

/** Must match `REPORT_DOMAIN` in programs/lantern/src/report.rs. */
export const REPORT_DOMAIN = Buffer.from("LANTERN_ATTEST01");

export const CLUSTER_ID = { localnet: 0, devnet: 1, mainnet: 2 } as const;

export const ISSUER_SEED = Buffer.from("issuer");
export const ATTESTATION_SEED = Buffer.from("attestation");

/** Same shape as the program's `AttestationReport` (Anchor camelCase). */
export interface AttestationReport {
  clusterId: number;
  nonce: BN;
  observedAt: BN;
  /** Custodian holdings in micro-shares (1 share = 1_000_000). */
  sharesHeld: BN;
  splitNum: number;
  splitDen: number;
  /** Supply on non-Solana chains, normalized to 6 decimals, rounded up. */
  otherChainSupply: BN;
  maxSupply: BN;
}

export function issuerPda(programId: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([ISSUER_SEED, mint.toBuffer()], programId)[0];
}

export function attestationPda(programId: PublicKey, issuer: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([ATTESTATION_SEED, issuer.toBuffer()], programId)[0];
}

/** Backing rule: floor(shares × den / num) − other chains, floored at zero. */
export function backedMaxSupply(
  sharesHeld: BN,
  splitNum: number,
  splitDen: number,
  otherChainSupply: BN
): BN {
  const backed = sharesHeld.mul(new BN(splitDen)).div(new BN(splitNum));
  return BN.max(backed.sub(otherChainSupply), new BN(0));
}

/** Exact bytes the attestor signs. Layout mirrors `AttestationReport::message`. */
export function reportMessage(
  programId: PublicKey,
  issuer: PublicKey,
  r: AttestationReport
): Buffer {
  const u64 = (v: BN) => v.toArrayLike(Buffer, "le", 8);
  const i64 = (v: BN) => v.toTwos(64).toArrayLike(Buffer, "le", 8);
  const u32 = (v: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(v);
    return b;
  };
  return Buffer.concat([
    REPORT_DOMAIN,
    programId.toBuffer(),
    issuer.toBuffer(),
    Buffer.from([r.clusterId]),
    u64(r.nonce),
    i64(r.observedAt),
    u64(r.sharesHeld),
    u32(r.splitNum),
    u32(r.splitDen),
    u64(r.otherChainSupply),
    u64(r.maxSupply),
  ]);
}

/** Native Ed25519 verify instruction; must sit directly before `submit_attestation`. */
export function signReportIx(
  programId: PublicKey,
  issuer: PublicKey,
  report: AttestationReport,
  attestorSecretKey: Uint8Array
): TransactionInstruction {
  return Ed25519Program.createInstructionWithPrivateKey({
    privateKey: attestorSecretKey,
    message: reportMessage(programId, issuer, report),
  });
}
