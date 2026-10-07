"use client";

import dynamic from "next/dynamic";

/** WalletMultiButton renders differently on the server ("Select Wallet") and on a
 * client that auto-connects a remembered wallet, so render it client-only. */
export const WalletButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  {
    ssr: false,
    loading: () => (
      <span aria-hidden className="inline-block h-10 w-36 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
    ),
  },
);
