import { readBlockhash } from "@/lib/server/lantern";

export async function GET() {
  try {
    return Response.json(await readBlockhash());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed to get blockhash" }, { status: 502 });
  }
}
