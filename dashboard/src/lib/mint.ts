import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import idl from "@/lib/lantern-idl.json";
import { LANTERN } from "@/lib/config";

const programId = new PublicKey(LANTERN.programId);
const mint = new PublicKey(LANTERN.mint);
const discriminator = Uint8Array.from(idl.instructions.find((i) => i.name === "mint_gated")!.discriminator);

/** Program error names -> messages, from the IDL. */
export const PROGRAM_ERRORS: Record<string, string> = Object.fromEntries(
  (idl.errors ?? []).map((e) => [e.name, e.msg ?? e.name]),
);

/** Create the minter's Token-2022 ATA if needed, then call mint_gated(amount). */
export function buildMintInstructions(minter: PublicKey, amountRaw: bigint): TransactionInstruction[] {
  const destination = getAssociatedTokenAddressSync(mint, minter, false, TOKEN_2022_PROGRAM_ID);
  const data = new Uint8Array(16);
  data.set(discriminator, 0);
  new DataView(data.buffer).setBigUint64(8, amountRaw, true);
  return [
    createAssociatedTokenAccountIdempotentInstruction(minter, destination, minter, mint, TOKEN_2022_PROGRAM_ID),
    new TransactionInstruction({
      programId,
      keys: [
        { pubkey: minter, isSigner: true, isWritable: false },
        { pubkey: new PublicKey(LANTERN.issuerConfig), isSigner: false, isWritable: false },
        { pubkey: new PublicKey(LANTERN.attestation), isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: true },
        { pubkey: destination, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(data),
    }),
  ];
}
