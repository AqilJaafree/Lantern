import { readState } from "@/lib/server/lantern";

export async function GET() {
  try {
    return Response.json(await readState());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed to read Lantern state" }, { status: 502 });
  }
}
