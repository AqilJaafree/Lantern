import { readTxStatus } from "@/lib/server/lantern";

export async function GET(request: Request) {
  const sig = new URL(request.url).searchParams.get("sig");
  if (!sig || !/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(sig)) {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }
  try {
    return Response.json(await readTxStatus(sig));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed to get status" }, { status: 502 });
  }
}
