import { SendError, sendSigned } from "@/lib/server/lantern";

export async function POST(request: Request) {
  const { tx, blockhash } = (await request.json().catch(() => ({}))) as { tx?: string; blockhash?: string };
  if (!tx || typeof tx !== "string") return Response.json({ error: "Missing signed transaction" }, { status: 400 });
  try {
    return Response.json({ signature: await sendSigned(tx, blockhash) });
  } catch (e) {
    const code = e instanceof SendError ? e.code : "SendFailed";
    return Response.json({ code, error: e instanceof Error ? e.message : "Send failed" }, { status: 400 });
  }
}
