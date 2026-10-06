import { BN } from "@coral-xyz/anchor";
import { Ed25519Program, PublicKey, TransactionInstruction } from "@solana/web3.js";

/** Must match `REPORT_DOMAIN` in programs/lantern/src/report.rs. */
export const REPORT_DOMAIN = Buffer.from("LANTERN_ATTEST01");

export const CLUSTER_ID = { localnet: 0, devnet: 1, mainnet: 2 } as const;

export const ISSUER_SEED = Buffer.from("issuer");
export const ATTESTATION_SEED = Buffer.from("attestation");
export const CRE_CONFIG_SEED = Buffer.from("cre");
export const FORWARDER_SEED = Buffer.from("forwarder");

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

export function creConfigPda(programId: PublicKey, issuer: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([CRE_CONFIG_SEED, issuer.toBuffer()], programId)[0];
}

/** PDA the Keystone Forwarder signs with when it CPIs into `receiver`. */
export function forwarderAuthorityPda(
  forwarderProgram: PublicKey,
  forwarderState: PublicKey,
  receiver: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [FORWARDER_SEED, forwarderState.toBuffer(), receiver.toBuffer()],
    forwarderProgram
  )[0];
}

/** Forwarder metadata: workflow_cid[32] | workflow_name[10] | workflow_owner[20] | report_id[2]. */
export function workflowMetadata(name: Uint8Array, owner: Uint8Array, cid = new Uint8Array(32)): Buffer {
  if (name.length !== 10 || owner.length !== 20 || cid.length !== 32) throw new Error("bad metadata field length");
  return Buffer.concat([cid, name, owner, Buffer.alloc(2)]);
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
