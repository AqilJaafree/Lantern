/** Proxy for the MOCK custodian's demo controls (drain / topup / split / reset). */
const ACTIONS = new Set(["drain", "topup", "split", "reset"]);

export async function POST(request: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (!ACTIONS.has(action)) return Response.json({ error: "Unknown action" }, { status: 404 });
  const base = process.env.CUSTODIAN_URL ?? "http://localhost:8787";
  try {
    const res = await fetch(`${base}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: await request.text(),
      cache: "no-store",
    });
    return Response.json(await res.json(), { status: res.status });
  } catch {
    return Response.json({ error: "Mock custodian is not reachable. Start it with: bun custodian/server.ts" }, { status: 502 });
  }
}
