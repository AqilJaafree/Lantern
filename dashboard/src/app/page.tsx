import type { Metadata } from "next";
import { Cormorant_Garamond, Yuji_Boku } from "next/font/google";
import { VaultExperience } from "@/components/vault/vault-experience";

// Brush lettering for the hanging wooden signs (営業中 / 準備中 …). Japanese fonts ship as
// unicode-range slices, so skip preloading and let the browser fetch only the glyphs used.
const brush = Yuji_Boku({ weight: "400", variable: "--font-brush", preload: false, display: "swap" });
// Tea-menu serif for the fortune-stick labels.
const menu = Cormorant_Garamond({ weight: ["600", "700"], style: ["normal", "italic"], subsets: ["latin"], variable: "--font-menu" });

export const metadata: Metadata = {
  title: "Lantern Vault — Never more tokens than shares",
  description: "A live 3D view of Lantern: custodian shares as gold, tokens in orbit, and the onchain mint gate.",
};

export default function HomePage() {
  return (
    <div className={`${brush.variable} ${menu.variable}`}>
      <VaultExperience />
    </div>
  );
}
