import { getChain } from '@/onchain-facts'
import { DEFAULT_CHAIN_ID } from './clients'

export type Tab = 'tx' | 'call' | 'address'

export interface UrlState {
  tab: Tab
  chainId: number
  id: string
}

const TABS: Tab[] = ['tx', 'call', 'address']

export function readUrlState(): UrlState {
  const p = new URLSearchParams(window.location.search)
  const tab = p.get('tab') as Tab | null
  const chain = Number(p.get('chain'))
  return {
    tab: tab && TABS.includes(tab) ? tab : 'tx',
    chainId: getChain(chain) ? chain : DEFAULT_CHAIN_ID,
    id: p.get('id') ?? '',
  }
}

export function toSearch(state: UrlState): string {
  const p = new URLSearchParams()
  p.set('tab', state.tab)
  p.set('chain', String(state.chainId))
  if (state.id) p.set('id', state.id)
  return p.toString()
}

export function writeUrlState(state: UrlState): void {
  const next = `${window.location.pathname}?${toSearch(state)}`
  if (next !== window.location.pathname + window.location.search) {
    window.history.replaceState(null, '', next)
  }
}
