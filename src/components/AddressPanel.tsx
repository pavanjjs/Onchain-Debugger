import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { isAddress, type Address } from 'viem'
import { Search } from 'lucide-react'
import { fetchAddressReport } from '@/lib/address'
import { buildAddressExplorerUrl, requireChain } from '@/onchain-facts'
import { Card, EmptyHint, ErrorBox, ExplorerLink, GhostButton, Label, Pill, PrimaryButton, Row, SectionTitle, TextInput } from './ui'

export function AddressPanel({ chainId }: { chainId: number }) {
  const { address: connected } = useAccount()
  const [draft, setDraft] = useState('')
  const [submitted, setSubmitted] = useState<{ chainId: number; address: Address } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const q = useQuery({
    queryKey: ['address', submitted?.chainId, submitted?.address],
    enabled: submitted !== null,
    queryFn: () => fetchAddressReport(submitted!.chainId, submitted!.address),
    retry: false,
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const a = draft.trim()
    if (!isAddress(a)) return setFormError('Enter a valid 0x address.')
    setFormError(null)
    setSubmitted({ chainId, address: a })
  }

  const r = q.data
  return (
    <div className="space-y-5">
      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label htmlFor="addr">Address</Label>
              {connected && <GhostButton type="button" onClick={() => setDraft(connected)}>Use connected wallet</GhostButton>}
            </div>
            <TextInput id="addr" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="0x..." aria-invalid={!!formError} />
            {formError && <p className="mt-2 text-xs text-danger">{formError}</p>}
          </div>
          <PrimaryButton type="submit" loading={q.isFetching}>
            <Search size={16} aria-hidden />
            Inspect on {requireChain(chainId).name}
          </PrimaryButton>
        </form>
      </Card>

      {!submitted && <EmptyHint>Check whether an address is a wallet or a contract, its balances, proxy target, and token metadata.</EmptyHint>}
      {q.isError && <ErrorBox title="Lookup failed" message={q.error.message} />}

      {r && (
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <Pill tone={r.kind === 'contract' ? 'neutral' : 'success'}>{r.kind === 'contract' ? 'Contract' : 'Account'}</Pill>
            <ExplorerLink href={buildAddressExplorerUrl(r.chainId, r.address)}>View on explorer</ExplorerLink>
          </div>
          <div className="my-4">
            <p className="text-xs uppercase tracking-[0.08em] text-subtle">
              {r.primaryBalance.source === 'erc20' ? 'USDC balance' : 'Native balance'}
            </p>
            <p className="display text-4xl font-semibold tabular-nums text-ink">
              {r.primaryBalance.amount} <span className="text-xl text-muted">{r.primaryBalance.symbol}</span>
            </p>
            {r.primaryBalance.source === 'erc20' && (
              <p className="mt-1 text-xs text-subtle">On this network USDC is also the gas token, so this one balance covers both.</p>
            )}
          </div>
          <SectionTitle>Details</SectionTitle>
          <dl>
            <Row label="Address" copy={r.address}>
              {r.address}
            </Row>
            {r.nativeBalance && (
              <Row label="Gas balance">
                {r.nativeBalance.amount} {r.nativeBalance.symbol}
              </Row>
            )}
            {r.usdcBalance !== null && <Row label="USDC balance">{r.usdcBalance} USDC</Row>}
            <Row label="Nonce">{r.nonce}</Row>
            {r.kind === 'contract' && <Row label="Code size">{r.codeSize} bytes</Row>}
            {r.proxyImplementation && (
              <Row label="Proxy target" copy={r.proxyImplementation}>
                {r.proxyImplementation}
              </Row>
            )}
            {r.token && (
              <>
                <Row label="Token">
                  {r.token.name ?? '?'} ({r.token.symbol ?? '?'})
                </Row>
                {r.token.decimals !== undefined && <Row label="Decimals">{r.token.decimals}</Row>}
                {r.token.totalSupply && <Row label="Total supply">{r.token.totalSupply}</Row>}
              </>
            )}
          </dl>
        </Card>
      )}
    </div>
  )
}
