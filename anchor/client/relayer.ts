import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY, Transaction } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import { Lantern } from "../target/types/lantern";
import { AttestationReport, CLUSTER_ID, backedMaxSupply, signReportIx } from "./report";

/** Shape of deployments/<cluster>.json written by scripts/seed-devnet.ts. */
export interface Deployment {
  cluster: keyof typeof CLUSTER_ID;
  programId: string;
  mint: string;
  issuerConfig: string;
  attestation: string;
  adminTokenAccount: string;
}

/** What the CRE workflow observes; the relayer turns it into a signed report. */
export interface Observation {
  /** Custodian holdings in micro-shares. */
  sharesHeld: BN;
  splitNum: number;
  splitDen: number;
  /** Non-Solana supply, normalized to 6 decimals, rounded up. */
  otherChainSupply: BN;
}

/** A transaction that landed onchain, successful or not. */
export interface Landed {
  signature: string;
  ok: boolean;
  /** Anchor error code name when the transaction failed, e.g. "ExceedsBacking". */
  errorCode?: string;
}

const ROOT = path.join(__dirname, "..");

export function loadDeployment(cluster = "devnet"): Deployment {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "deployments", `${cluster}.json`), "utf8"));
}

export function loadKeypair(file: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))));
}

export function explorerTx(signature: string, cluster: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}

export class Relayer {
  readonly program: Program<Lantern>;
  readonly provider: anchor.AnchorProvider;
  readonly mint: PublicKey;
  readonly issuer: PublicKey;
  readonly attestation: PublicKey;

  constructor(readonly deployment: Deployment, private readonly attestor: Keypair) {
    this.provider = anchor.AnchorProvider.env();
    anchor.setProvider(this.provider);
    this.program = anchor.workspace.lantern as Program<Lantern>;
    this.mint = new PublicKey(deployment.mint);
    this.issuer = new PublicKey(deployment.issuerConfig);
    this.attestation = new PublicKey(deployment.attestation);
  }

  /** Next report after the one stored onchain: nonce + 1, strictly later timestamp. */
  async buildReport(obs: Observation): Promise<AttestationReport> {
    const prev = await this.program.account.attestation.fetch(this.attestation);
    const now = Math.floor(Date.now() / 1000);
    return {
      clusterId: CLUSTER_ID[this.deployment.cluster],
      nonce: prev.nonce.addn(1),
      observedAt: new BN(Math.max(prev.observedAt.toNumber() + 1, now)),
      sharesHeld: obs.sharesHeld,
      splitNum: obs.splitNum,
      splitDen: obs.splitDen,
      otherChainSupply: obs.otherChainSupply,
      maxSupply: backedMaxSupply(obs.sharesHeld, obs.splitNum, obs.splitDen, obs.otherChainSupply),
    };
  }

  /** Sign the observation as the attestor and submit it. The fee payer is just a courier. */
  async submit(obs: Observation): Promise<Landed & { report: AttestationReport }> {
    const report = await this.buildReport(obs);
    const tx = await this.program.methods
      .submitAttestation(report)
      .accountsPartial({
        issuerConfig: this.issuer,
        attestation: this.attestation,
        mint: this.mint,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .preInstructions([
        signReportIx(this.program.programId, this.issuer, report, this.attestor.secretKey),
      ])
      .transaction();
    return { ...(await this.sendLanded(tx)), report };
  }

  /** mint_gated as the provider wallet (the demo minter), into the admin token account. */
  async mintTokens(amount: BN): Promise<Landed> {
    const tx = await this.program.methods
      .mintGated(amount)
      .accountsPartial({
        minter: this.provider.wallet.publicKey,
        issuerConfig: this.issuer,
        attestation: this.attestation,
        mint: this.mint,
        destination: new PublicKey(this.deployment.adminTokenAccount),
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .transaction();
    return this.sendLanded(tx);
  }

  /**
   * Send with preflight skipped so a rejected instruction still lands onchain
   * and has an explorer link, then report whether it succeeded.
   */
  private async sendLanded(tx: Transaction): Promise<Landed> {
    const conn = this.provider.connection;
    const latest = await conn.getLatestBlockhash("confirmed");
    tx.recentBlockhash = latest.blockhash;
    tx.feePayer = this.provider.wallet.publicKey;
    const signed = await this.provider.wallet.signTransaction(tx);
    const signature = await conn.sendRawTransaction(signed.serialize(), {
      skipPreflight: true,
      maxRetries: 5,
    });
    const res = await conn.confirmTransaction({ signature, ...latest }, "confirmed");
    if (!res.value.err) return { signature, ok: true };

    const landed = await conn.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    const logs = landed?.meta?.logMessages ?? [];
    const errorCode = logs.join("\n").match(/Error Code: (\w+)/)?.[1];
    return { signature, ok: false, errorCode };
  }
}
