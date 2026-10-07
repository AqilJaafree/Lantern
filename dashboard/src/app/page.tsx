import { Dashboard } from "@/components/dashboard";
import { IntroScene } from "@/components/vault/intro-scene";

export default function Page() {
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
