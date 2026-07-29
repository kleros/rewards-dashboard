import { useState } from "react";
import styled from "styled-components";

import { Mono } from "components/RewardsTable";
import { shortAddress } from "utils/format";

// A curate reward line's tagged address: linked to the block explorer of the
// line's chain when we know one AND the value has the right shape for it, and
// always copyable in full. Snapshots only carry a human chainName (the chain
// id field is empty), so explorers are keyed by the names observed in the
// data; unknown chains and non-address values (ATQ bytes32 ids) degrade to
// copy-only rather than linking somewhere wrong.

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

interface Explorer {
  url: (address: string) => string;
  test: RegExp;
}

const evm = (host: string): Explorer => ({
  url: (address) => `https://${host}/address/${address}`,
  test: EVM_ADDRESS,
});

const ETHEREUM = evm("etherscan.io");
const ARBITRUM = evm("arbiscan.io");
const BASE = evm("basescan.org");
const AVALANCHE = evm("snowtrace.io");
const ZKSYNC = evm("era.zksync.network");
const GNOSIS = evm("gnosisscan.io");
const SOLANA: Explorer = {
  url: (address) => `https://solscan.io/account/${address}`,
  test: SOLANA_ADDRESS,
};

// Keyed by lowercased chainName as it appears in the snapshots.
const EXPLORERS: Record<string, Explorer> = {
  "ethereum mainnet": ETHEREUM,
  ethereum: ETHEREUM,
  optimism: evm("optimistic.etherscan.io"),
  arbitrum: ARBITRUM,
  "arbitrum one": ARBITRUM,
  polygon: evm("polygonscan.com"),
  base: BASE,
  "base mainnet": BASE,
  avalanche: AVALANCHE,
  "avalanche c-chain": AVALANCHE,
  zksync: ZKSYNC,
  "zksync mainnet": ZKSYNC,
  linea: evm("lineascan.build"),
  scroll: evm("scrollscan.com"),
  "gnosis chain": GNOSIS,
  gnosis: GNOSIS,
  celo: evm("celoscan.io"),
  "binance smart chain": evm("bscscan.com"),
  solana: SOLANA,
};

export function explorerUrl(chainName: string | undefined, address: string): string | null {
  const explorer = EXPLORERS[(chainName ?? "").trim().toLowerCase()];
  return explorer && explorer.test.test(address) ? explorer.url(address) : null;
}

const Wrap = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;

const CopyButton = styled.button`
  border: none;
  background: none;
  padding: 0 2px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  color: ${({ theme }) => theme.secondaryText};
  transition: color 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.primaryText};
  }
`;

export default function TagAddress({ address, chainName }: { address?: string; chainName?: string }) {
  const [copied, setCopied] = useState(false);
  if (!address) return <Mono>—</Mono>;

  const url = explorerUrl(chainName, address);
  const short = <Mono title={address}>{shortAddress(address)}</Mono>;

  async function copy() {
    try {
      await navigator.clipboard.writeText(address ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard unavailable (permissions/insecure context) — leave silently;
      // the full value is still reachable via the title tooltip.
    }
  }

  return (
    <Wrap>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" title={`${address} — view on explorer`}>
          {short}
        </a>
      ) : (
        short
      )}
      <CopyButton onClick={copy} title="Copy full address" aria-label="Copy full address">
        {copied ? "✓" : "⧉"}
      </CopyButton>
    </Wrap>
  );
}
