/**
 * Point the Devnet issuer's `on_report` at a CRE workflow.
 *
 *   yarn set-cre-config --env simulation --workflow lantern-attest-staging
 *   yarn set-cre-config --env production --workflow <name> --owner 0x<20-byte owner>
 *
 * --env picks the Keystone Forwarder (simulation = the CLI's mock forwarder,
 * production = the live Devnet forwarder). The workflow name is encoded the
 * way CRE puts it in report metadata: the first 10 hex chars of sha256(name)
 * (chainlink-common HashTruncateName). Simulation runs use the simulator's
 * fixed owner 0xaaaa…aa unless --owner is given.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";
import { Lantern } from "../target/types/lantern";
import { creConfigPda } from "../client/report";
import { loadDeployment } from "../client/relayer";

const FORWARDERS = {
  simulation: {
    program: "7kuEAA3mSC1Tz8gQjnvH7bKFda9xSPRRin9SZbH49cNK",
    state: "5Tipz3yhTBdVsDbaBxZkrp7Gjf3brGq5SKkxReefPMP7",
  },
  production: {
    program: "CXsKEJcs25TQEYU2e5jZ8QTPE3ffMLZhH6BWHrdcCCB5",
    state: "8QoomCQyPSkJ8WopJbX9B4HyvrFzziwvJdU8hZE6DCr9",
  },
} as const;

const SIMULATOR_OWNER = "0x" + "aa".repeat(20);

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

/** chainlink-common HashTruncateName: first 10 chars of hex(sha256(name)), as ASCII bytes. */
export function workflowNameBytes(name: string): number[] {
  const hex = createHash("sha256").update(name).digest("hex").slice(0, 10);
  return Array.from(Buffer.from(hex, "ascii"));
}

function ownerBytes(owner: string): number[] {
  const hex = owner.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{40}$/.test(hex)) throw new Error("--owner must be a 20-byte hex address");
  return Array.from(Buffer.from(hex, "hex"));
}

async function main() {
  const env = arg("env") as keyof typeof FORWARDERS;
  if (!FORWARDERS[env]) throw new Error("--env must be simulation or production");
  const workflow = arg("workflow");
  const owner = arg("owner", env === "simulation" ? SIMULATOR_OWNER : undefined);

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.lantern as Program<Lantern>;
  const deployment = loadDeployment("devnet");
  const issuer = new PublicKey(deployment.issuerConfig);
  const creConfig = creConfigPda(program.programId, issuer);

  const sig = await program.methods
    .setCreConfig({
      forwarderProgram: new PublicKey(FORWARDERS[env].program),
      forwarderState: new PublicKey(FORWARDERS[env].state),
      workflowOwner: ownerBytes(owner),
      workflowName: workflowNameBytes(workflow),
    })
    .accountsPartial({ admin: provider.wallet.publicKey, issuerConfig: issuer, creConfig })
    .rpc();

  console.log(`env       ${env}`);
  console.log(`forwarder ${FORWARDERS[env].program} (state ${FORWARDERS[env].state})`);
  console.log(`workflow  ${workflow} -> name bytes "${Buffer.from(workflowNameBytes(workflow)).toString("ascii")}"`);
  console.log(`owner     ${owner}`);
  console.log(`cre_config ${creConfig.toBase58()}`);
  console.log(`tx https://explorer.solana.com/tx/${sig}?cluster=devnet`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
