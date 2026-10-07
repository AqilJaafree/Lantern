import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";
import { IntroScene } from "@/components/vault/intro-scene";

// The original backing desk, kept reachable but unlisted: the vault is the homepage now.
export const metadata: Metadata = {
  title: "Lantern — backing desk",
  robots: { index: false, follow: false },
};

export default function DeskPage() {
  return (
    <>
      {/* Background only: animated silhouette scene (samurai at nightfall) behind the desk. */}
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
        <IntroScene leaving={false} />
      </div>
      <Dashboard />
    </>
  );
}
