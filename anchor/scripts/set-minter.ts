/**
 * Admin: set who may call mint_gated on the Devnet issuer.
 *
 *   yarn set-minter --open              # any wallet may mint (demo mode); cap/freshness/pauses still apply
 *   yarn set-minter --minter <pubkey>   # restrict minting to one key
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Lantern } from "../target/types/lantern";
import { loadDeployment } from "../client/relayer";

async function main() {
  const i = process.argv.indexOf("--minter");
  const open = process.argv.includes("--open");
  if (open === (i >= 0)) throw new Error("pass exactly one of --open or --minter <pubkey>");
  const minter = open ? PublicKey.default : new PublicKey(process.argv[i + 1]);

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.lantern as Program<Lantern>;
  const issuer = new PublicKey(loadDeployment("devnet").issuerConfig);

  const sig = await program.methods
    .setMinter(minter)
    .accountsPartial({ admin: provider.wallet.publicKey, issuerConfig: issuer })
    .rpc();
  console.log(open ? "minting is OPEN to any wallet (within backing)" : `minter set to ${minter.toBase58()}`);
  console.log(`tx https://explorer.solana.com/tx/${sig}?cluster=devnet`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
