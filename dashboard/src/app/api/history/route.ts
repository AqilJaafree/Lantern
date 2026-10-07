import { readHistory } from "@/lib/server/lantern";

export async function GET() {
  try {
    return Response.json(await readHistory());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed to read history" }, { status: 502 });
  }
}
