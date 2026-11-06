import { createPublicClient, http, type PublicClient } from 'viem'
import { ONCHAIN_CHAINS, requireChain } from '@/onchain-facts'
import { registerChain } from '@/tracing'

const clients = new Map<number, PublicClient>()

/** Read-only client for any chain in the onchain facts registry. */
export function getClient(chainId: number): PublicClient {
  const existing = clients.get(chainId)
  if (existing) return existing

  const chain = requireChain(chainId)
  const url = chain.rpcUrls[0]
  registerChain(chainId, url)
  const client = createPublicClient({
    transport: http(url, { retryCount: 1, timeout: 20_000 }),
  })
  clients.set(chainId, client)
  return client
}

/** Testnets first, then mainnets, so the default list leads with safe options. */
export const SORTED_CHAINS = [...ONCHAIN_CHAINS].sort((a, b) => Number(b.isTestnet) - Number(a.isTestnet))

export const DEFAULT_CHAIN_ID = 5042002
