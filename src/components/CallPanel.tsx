import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { isAddress, type Address } from 'viem'
import { Play } from 'lucide-react'
import { runCall, type CallOutcome } from '@/lib/call'
import { requireChain } from '@/onchain-facts'
import { Card, CodeBlock, FindingCard, Label, Pill, PrimaryButton, Row, SectionTitle, TextInput, ErrorBox } from './ui'
import { RevertView } from './RevertView'

const EXAMPLES = [
  { label: 'balanceOf', sig: 'balanceOf(address) returns (uint256)', args: '' },
  { label: 'decimals', sig: 'decimals() returns (uint8)', args: '' },
  { label: 'symbol', sig: 'symbol() returns (string)', args: '' },
]

function Outcome({ outcome, chainId }: { outcome: CallOutcome; chainId: number }) {
  return (
    <div className="space-y-5">
      {outcome.warnings.map((w) => (
        <FindingCard key={w} severity="warn" title="Heads up">
          {w}
        </FindingCard>
      ))}
      <Card>
        <SectionTitle aside={<Pill tone={outcome.ok ? 'success' : 'danger'}>{outcome.ok ? 'Succeeded' : 'Reverted'}</Pill>}>
          Simulation result
        </SectionTitle>
        {outcome.revert && <RevertView revert={outcome.revert} />}
        {outcome.ok && outcome.decoded && (
          <div>
            <p className="mb-1 text-xs uppercase tracking-[0.08em] text-subtle">Decoded return value</p>
            <CodeBlock>{outcome.decoded}</CodeBlock>
          </div>
        )}
        {outcome.ok && !outcome.decoded && (
          <p className="text-sm text-muted">The call succeeded{outcome.returnData && outcome.returnData !== '0x' ? '.' : ' and returned no data.'}</p>
        )}
        <dl className="mt-4">
          <Row label="Selector">{outcome.selector}</Row>
          <Row label="Calldata" copy={outcome.calldata}>
            {outcome.calldata}
          </Row>
          {outcome.returnData && outcome.returnData !== '0x' && (
            <Row label="Raw return" copy={outcome.returnData}>
              {outcome.returnData}
            </Row>
          )}
          {outcome.gasEstimate !== undefined && (
            <Row label="Gas estimate">
              {outcome.gasEstimate.toString()} on {requireChain(chainId).name}
            </Row>
          )}
        </dl>
      </Card>
    </div>
  )
}

export function CallPanel({ chainId }: { chainId: number }) {
  const chain = requireChain(chainId)
  const [to, setTo] = useState('')
  const [sig, setSig] = useState('')
  const [args, setArgs] = useState('')
  const [from, setFrom] = useState('')
  const [value, setValue] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const run = useMutation({
    mutationFn: runCall,
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!isAddress(to.trim())) return setFormError('Enter a valid contract address.')
    if (from.trim() && !isAddress(from.trim())) return setFormError('The sender is not a valid address.')
    setFormError(null)
    run.mutate({
      chainId,
      to: to.trim() as Address,
      signature: sig,
      args,
      from: from.trim() ? (from.trim() as Address) : undefined,
      value: value.trim() || undefined,
    })
  }

  return (
    <div className="space-y-5">
      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="call-to">Contract address</Label>
            <TextInput id="call-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x..." />
          </div>
          <div>
            <Label htmlFor="call-sig">Function signature</Label>
            <TextInput
              id="call-sig"
              value={sig}
              onChange={(e) => setSig(e.target.value)}
              placeholder="transfer(address to, uint256 amount) returns (bool)"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => {
                    setSig(ex.sig)
                    setArgs(ex.args)
                  }}
                  className="min-h-9 rounded-xl border border-line px-3 text-xs text-muted transition hover:border-line-strong hover:text-ink"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="call-args">Arguments (comma separated)</Label>
            <TextInput id="call-args" value={args} onChange={(e) => setArgs(e.target.value)} placeholder='0xabc..., 1000000' />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="call-from">Simulate as sender (optional)</Label>
              <TextInput id="call-from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="0x..." />
            </div>
            <div>
              <Label htmlFor="call-value">Value in {chain.nativeCurrency.symbol} (optional)</Label>
              <TextInput id="call-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" />
            </div>
          </div>
          {formError && <p className="text-xs text-danger">{formError}</p>}
          <div className="flex items-center gap-3">
            <PrimaryButton type="submit" loading={run.isPending}>
              <Play size={16} aria-hidden />
              Simulate call
            </PrimaryButton>
            <span className="text-xs text-subtle">Read-only eth_call. Nothing is sent or signed.</span>
          </div>
        </form>
      </Card>

      {run.isError && <ErrorBox title="Could not run the call" message={run.error.message} />}
      {run.data && <Outcome outcome={run.data} chainId={chainId} />}
    </div>
  )
}
