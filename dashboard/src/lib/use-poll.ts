"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Poll an API route; after errors, back off (×2 per failure, up to 60s) so a
 * rate-limited RPC can recover. The first success restores the normal interval. */
export function usePoll<T>(url: string, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const failures = useRef(0);
  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setData(body);
      setError(null);
      failures.current = 0;
    } catch (e) {
      failures.current += 1;
      setError(e instanceof Error ? e.message : "Request failed");
    }
  }, [url]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const tick = async () => {
      await load();
      if (stopped) return;
      const delay = failures.current ? Math.min(60_000, intervalMs * 2 ** failures.current) : intervalMs;
      timer = setTimeout(tick, delay);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [load, intervalMs]);
  return { data, error, reload: load };
}
