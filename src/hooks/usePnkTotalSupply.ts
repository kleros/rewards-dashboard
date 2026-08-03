import { useEffect, useState } from "react";

import { ETHEREUM_RPC_URLS, PNK_TOKEN_ADDRESS, PNK_TOTAL_SUPPLY_FALLBACK } from "consts/index";

// totalSupply() — first 4 bytes of keccak256("totalSupply()").
const TOTAL_SUPPLY_SELECTOR = "0x18160ddd";

// The fetched value is shared by every overview section, so cache it at module
// level: one eth_call per page load, no matter how many components ask.
let cachedSupply: bigint | null = null;
let inflight: Promise<bigint> | null = null;

async function fetchTotalSupply(): Promise<bigint> {
  let lastError: unknown;
  for (const rpcUrl of ETHEREUM_RPC_URLS) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to: PNK_TOKEN_ADDRESS, data: TOTAL_SUPPLY_SELECTOR }, "latest"],
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
      if (body.error) throw new Error(body.error.message ?? "RPC error");
      if (typeof body.result !== "string" || !/^0x[0-9a-fA-F]+$/.test(body.result)) {
        throw new Error("malformed eth_call result");
      }
      const supply = BigInt(body.result);
      if (supply <= 0n) throw new Error("zero totalSupply");
      return supply;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("all RPC endpoints failed");
}

// Live PNK totalSupply() from Ethereum mainnet. Renders start from the
// last-verified fallback constant and update in place once the chain answers;
// if every RPC fails the fallback simply stands.
export function usePnkTotalSupply(): bigint {
  const [supply, setSupply] = useState<bigint>(cachedSupply ?? PNK_TOTAL_SUPPLY_FALLBACK);

  useEffect(() => {
    if (cachedSupply !== null) return;
    let cancelled = false;
    inflight ??= fetchTotalSupply();
    inflight
      .then((wei) => {
        cachedSupply = wei;
        if (!cancelled) setSupply(wei);
      })
      .catch(() => {
        // Allow a retry on the next mount rather than pinning the failure.
        inflight = null;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return supply;
}
