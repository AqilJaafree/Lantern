/**
 * MOCK custodian API (PRD M1–M3). Not a real custodian or broker integration.
 *
 *   GET  /holdings            -> { symbol, micro_shares, split_num, split_den, as_of, mock: true }
 *   POST /drain  {shares}     -> remove shares (demo shortfall)
 *   POST /topup  {shares}     -> add shares (demo recovery)
 *   POST /split  {num, den}   -> corporate action: shares × num/den, cumulative factor × num/den
 *   POST /reset               -> back to INITIAL_SHARES, split 1/1
 *   POST /set {shares, num?, den?} -> exact holdings and cumulative split (demo script)
 *
 * Holdings are micro-shares (1 share = 1_000_000) serialized as strings.
 * Run: bun custodian/server.ts   (PORT=8787, INITIAL_SHARES=102, SYMBOL=xAAPL)
 */
const MICRO = 1_000_000n;
const PORT = Number(process.env.PORT ?? 8787);
const SYMBOL = process.env.SYMBOL ?? "xAAPL";
const INITIAL_SHARES = BigInt(process.env.INITIAL_SHARES ?? "102");

let microShares = INITIAL_SHARES * MICRO;
let splitNum = 1n;
let splitDen = 1n;

const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));

/** Whole or fractional shares from a JSON number/string -> micro-shares. */
function toMicro(v: unknown): bigint {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error("shares must be a positive number");
  return BigInt(Math.round(n * 1_000_000));
}

function holdings() {
  return {
    symbol: SYMBOL,
    micro_shares: microShares.toString(),
    split_num: Number(splitNum),
    split_den: Number(splitDen),
    as_of: new Date().toISOString(),
    mock: true,
  };
}

async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const { pathname } = new URL(req.url);
    try {
      if (req.method === "GET" && pathname === "/holdings") return Response.json(holdings());
      if (req.method !== "POST") return new Response("not found", { status: 404 });

      const b = await body(req);
      switch (pathname) {
        case "/drain": {
          const d = toMicro(b.shares);
          microShares = microShares > d ? microShares - d : 0n;
          break;
        }
        case "/topup":
          microShares += toMicro(b.shares);
          break;
        case "/split": {
          const num = BigInt(Number(b.num));
          const den = BigInt(Number(b.den ?? 1));
          if (num <= 0n || den <= 0n) throw new Error("num and den must be positive");
          microShares = (microShares * num) / den;
          splitNum *= num;
          splitDen *= den;
          const g = gcd(splitNum, splitDen);
          splitNum /= g;
          splitDen /= g;
          break;
        }
        case "/set":
          microShares = toMicro(b.shares);
          splitNum = BigInt(Number(b.num ?? 1));
          splitDen = BigInt(Number(b.den ?? 1));
          if (splitNum <= 0n || splitDen <= 0n) throw new Error("num and den must be positive");
          break;
        case "/reset":
          microShares = INITIAL_SHARES * MICRO;
          splitNum = 1n;
          splitDen = 1n;
          break;
        default:
          return new Response("not found", { status: 404 });
      }
      console.log(`${pathname} ->`, holdings());
      return Response.json(holdings());
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
  },
});

console.log(`MOCK custodian on http://localhost:${PORT} (${SYMBOL}, ${INITIAL_SHARES} shares)`);
