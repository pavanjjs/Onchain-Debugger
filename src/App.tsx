import { useEffect, useState } from 'react'
import { Bug, FileSearch, Link2, Terminal, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { SORTED_CHAINS } from '@/lib/clients'
import { readUrlState, toSearch, writeUrlState, type Tab } from '@/lib/urlState'
import { buildShareLink } from '@/lib/share'
import { requireChain } from '@/onchain-facts'
import { TxPanel } from '@/components/TxPanel'
import { CallPanel } from '@/components/CallPanel'
import { AddressPanel } from '@/components/AddressPanel'
import { GhostButton } from '@/components/ui'

const TABS: { id: Tab; label: string; icon: typeof Bug }[] = [
  { id: 'tx', label: 'Transaction', icon: Bug },
  { id: 'call', label: 'Simulate call', icon: Terminal },
  { id: 'address', label: 'Address', icon: Wallet },
]

export default function App() {
  const initial = readUrlState()
  const [tab, setTab] = useState<Tab>(initial.tab)
  const [chainId, setChainId] = useState(initial.chainId)
  // The value to auto-run when a panel mounts (from a shared link, recent list, or cross-tool jump).
  const [seed, setSeed] = useState(initial.id)
  // Bumping this remounts the active panel so it picks up a new seed.
  const [nonce, setNonce] = useState(0)
  const [resolved, setResolved] = useState<{ search: string; link: string } | null>(null)
  const chain = requireChain(chainId)

  const urlState = { tab, chainId, id: tab === 'call' ? '' : seed }
  const search = toSearch(urlState)
  // Only offer the link once the share base has resolved for the current result.
  const shareLink = urlState.id && resolved?.search === search ? resolved.link : null

  useEffect(() => {
    writeUrlState({ tab, chainId, id: tab === 'call' ? '' : seed })
    if (!seed || tab === 'call') return
    // Results are keyed by their search string, so a late response for an old result is never shown.
    void buildShareLink(`/?${search}`).then((link) => setResolved({ search, link }))
  }, [tab, chainId, seed, search])

  const jump = (nextTab: Tab, nextChain: number, value: string) => {
    setTab(nextTab)
    setChainId(nextChain)
    setSeed(value)
    setNonce((n) => n + 1)
  }

  const copyLink = () => {
    if (!shareLink) return
    void navigator.clipboard.writeText(shareLink).then(() => toast.success('Link copied'))
  }

  return (
    <div className="min-h-dvh px-4 pb-24 pt-8 sm:pt-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-subtle">
            <FileSearch size={14} aria-hidden />
            Read-only
          </div>
          <h1 className="display text-balance text-4xl font-semibold text-ink sm:text-5xl">Onchain Debugger</h1>
          <p className="mt-3 max-w-xl text-pretty text-muted">
            Find out why a transaction failed, what it did, and what it cost. Nothing here signs or sends.
          </p>
        </header>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <nav className="flex gap-1 rounded-2xl border border-line bg-surface p-1" aria-label="Debugger tools">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => jump(id, chainId, '')}
                aria-current={tab === id ? 'page' : undefined}
                className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:flex-none ${
                  tab === id ? 'bg-surface-strong text-ink' : 'text-subtle hover:text-ink'
                }`}
              >
                <Icon size={16} aria-hidden />
                {label}
              </button>
            ))}
          </nav>

          <div className="sm:w-60">
            <label htmlFor="network" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-subtle">
              Network
            </label>
            <select
              id="network"
              value={chainId}
              onChange={(e) => {
                setChainId(Number(e.target.value))
                setSeed('')
              }}
              className="min-h-11 w-full rounded-2xl border border-line bg-surface px-4 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
            >
              <optgroup label="Testnets">
                {SORTED_CHAINS.filter((c) => c.isTestnet).map((c) => (
                  <option key={c.chainId} value={c.chainId} className="bg-canvas">
                    {c.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Mainnets (read-only)">
                {SORTED_CHAINS.filter((c) => !c.isTestnet).map((c) => (
                  <option key={c.chainId} value={c.chainId} className="bg-canvas">
                    {c.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        <div className="mb-5 flex items-center justify-between gap-3">
          <p className="text-xs tabular-nums text-subtle">
            Chain {chain.chainId} · gas token {chain.nativeCurrency.symbol} · public RPC
          </p>
          {shareLink && (
            <GhostButton type="button" onClick={copyLink}>
              <Link2 size={14} aria-hidden />
              Copy link to this result
            </GhostButton>
          )}
        </div>

        {tab === 'tx' && (
          <TxPanel
            key={`tx-${nonce}`}
            chainId={chainId}
            initialQuery={seed}
            onSearched={setSeed}
            onRecall={(c, v) => jump('tx', c, v)}
            onInspect={(address) => jump('address', chainId, address)}
          />
        )}
        {tab === 'call' && <CallPanel chainId={chainId} />}
        {tab === 'address' && (
          <AddressPanel
            key={`address-${nonce}`}
            chainId={chainId}
            initialQuery={seed}
            onSearched={setSeed}
            onRecall={(c, v) => jump('address', c, v)}
          />
        )}
      </div>
    </div>
  )
}
