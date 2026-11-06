import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isHash, type Hex } from 'viem'
import { ClipboardCopy, Search, Shuffle } from 'lucide-react'
import { toast } from 'sonner'
import { buildReportText, fetchTxReport, findRecentTxHash, type ReplayResult, type TxReport } from '@/lib/tx'
import { errorMessage } from '@/lib/decode'
import { useRecent } from '@/lib/history'
import { buildAddressExplorerUrl, buildTxExplorerUrl, requireChain } from '@/onchain-facts'
import {
  Card,
  EmptyHint,
  ErrorBox,
  ExplorerLink,
  FindingCard,
  GhostButton,
  Label,
  Pill,
  PrimaryButton,
  Row,
  SectionTitle,
  TextInput,
} from './ui'
import { InputSection, LogsSection, ReplaySection, TraceSection } from './TxSections'
import { RecentList } from './RecentList'

function InspectLink({ address, onInspect }: { address: string; onInspect: (address: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onInspect(address)}
      className="ml-2 rounded-md px-1.5 py-0.5 font-sans text-xs font-medium text-accent transition hover:bg-surface-strong hover:text-accent-hover"
    >
      Inspect
    </button>
  )
}

function Summary({ report, onInspect }: { report: TxReport; onInspect: (address: string) => void }) {
  const queryClient = useQueryClient()
  const chain = requireChain(report.chainId)
  const { tx, receipt } = report
  const tone = report.status === 'success' ? 'success' : report.status === 'reverted' ? 'danger' : 'warn'
  const symbol = chain.nativeCurrency.symbol

  const copyReport = () => {
    const replay = queryClient.getQueryData<ReplayResult>(['replay', report.chainId, report.hash])
    const text = buildReportText(report, replay?.revert?.message)
    void navigator.clipboard.writeText(text).then(() => toast.success('Report copied'))
  }

  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <Pill tone={tone}>{report.status}</Pill>
        <div className="flex items-center gap-3">
          <GhostButton type="button" onClick={copyReport}>
            <ClipboardCopy size={14} aria-hidden />
            Copy report
          </GhostButton>
          <ExplorerLink href={buildTxExplorerUrl(report.chainId, report.hash)}>View on explorer</ExplorerLink>
        </div>
      </div>
      {report.fee !== null && (
        <div className="my-4">
          <p className="text-xs uppercase tracking-[0.08em] text-subtle">Fee paid</p>
          <p className="display text-4xl font-semibold tabular-nums text-ink">
            {report.fee} <span className="text-xl text-muted">{symbol}</span>
          </p>
        </div>
      )}
      <dl>
        <Row label="Hash" copy={report.hash}>
          {report.hash}
        </Row>
        <Row label="From" copy={tx.from}>
          <a href={buildAddressExplorerUrl(report.chainId, tx.from)} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {tx.from}
          </a>
          <InspectLink address={tx.from} onInspect={onInspect} />
        </Row>
        <Row label={report.isContractCreation ? 'Creates' : 'To'} copy={tx.to ?? receipt?.contractAddress ?? undefined}>
          {tx.to ? (
            <>
              <a href={buildAddressExplorerUrl(report.chainId, tx.to)} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {tx.to}
              </a>
              {report.toHasCode !== null && <span className="ml-2 text-subtle">({report.toHasCode ? 'contract' : 'account'})</span>}
              <InspectLink address={tx.to} onInspect={onInspect} />
            </>
          ) : (
            (receipt?.contractAddress ?? 'pending')
          )}
        </Row>
        <Row label="Value">
          {report.value} {symbol}
        </Row>
        <Row label="Block">
          {receipt ? receipt.blockNumber.toString() : 'pending'}
          {report.confirmations !== null && <span className="ml-2 text-subtle">({report.confirmations.toString()} confirmations)</span>}
        </Row>
        {report.timestamp !== null && <Row label="Time">{new Date(Number(report.timestamp) * 1000).toLocaleString()}</Row>}
        <Row label="Nonce">{tx.nonce}</Row>
        <Row label="Gas used / limit">{receipt ? `${receipt.gasUsed.toString()} / ${tx.gas.toString()}` : `limit ${tx.gas.toString()}`}</Row>
        {report.gasPriceGwei && <Row label="Gas price">{report.gasPriceGwei} gwei</Row>}
        <Row label="Type">{tx.type}</Row>
      </dl>
    </Card>
  )
}

interface Props {
  chainId: number
  initialQuery: string
  onSearched: (hash: string) => void
  onRecall: (chainId: number, hash: string) => void
  onInspect: (address: string) => void
}

export function TxPanel({ chainId, initialQuery, onSearched, onRecall, onInspect }: Props) {
  const [draft, setDraft] = useState(initialQuery)
  const [submitted, setSubmitted] = useState<{ chainId: number; hash: Hex } | null>(
    isHash(initialQuery) ? { chainId, hash: initialQuery } : null,
  )
  const [formError, setFormError] = useState<string | null>(null)
  const [finding, setFinding] = useState(false)
  const recent = useRecent('tx')

  const q = useQuery({
    queryKey: ['tx', submitted?.chainId, submitted?.hash],
    enabled: submitted !== null,
    queryFn: () => fetchTxReport(submitted!.chainId, submitted!.hash),
    retry: false,
  })

  const found = q.data ? q.data.hash : null
  const foundChain = q.data ? q.data.chainId : null
  const addRecent = recent.add
  useEffect(() => {
    if (found && foundChain !== null) addRecent({ chainId: foundChain, value: found })
  }, [found, foundChain, addRecent])

  const search = (hash: Hex) => {
    setFormError(null)
    setDraft(hash)
    setSubmitted({ chainId, hash })
    onSearched(hash)
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const hash = draft.trim()
    if (!isHash(hash)) {
      setFormError('A transaction hash is 0x followed by 64 hex characters.')
      return
    }
    search(hash)
  }

  const tryLatest = async () => {
    setFinding(true)
    try {
      search(await findRecentTxHash(chainId))
    } catch (e) {
      setFormError(errorMessage(e))
    } finally {
      setFinding(false)
    }
  }

  const report = q.data
  const stale = submitted !== null && submitted.chainId !== chainId

  return (
    <div className="space-y-5">
      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="tx-hash">Transaction hash</Label>
            <TextInput id="tx-hash" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="0x..." aria-invalid={!!formError} />
            {formError && <p className="mt-2 text-xs text-danger">{formError}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PrimaryButton type="submit" loading={q.isFetching}>
              <Search size={16} aria-hidden />
              Debug on {requireChain(chainId).name}
            </PrimaryButton>
            <GhostButton type="button" onClick={() => void tryLatest()} disabled={finding}>
              <Shuffle size={14} aria-hidden />
              {finding ? 'Finding...' : 'Try a recent transaction'}
            </GhostButton>
            {stale && <span className="text-xs text-warn">Showing results from a different network. Run again to switch.</span>}
          </div>
          <RecentList items={recent.items} onPick={(item) => onRecall(item.chainId, item.value)} onClear={recent.clear} />
        </form>
      </Card>

      {!submitted && (
        <EmptyHint>
          Paste a hash from any supported network to see status, fees, decoded call data, events, and the revert reason. No hash handy? Pull a
          real recent one from the selected network.
        </EmptyHint>
      )}
      {q.isError && <ErrorBox title="Lookup failed" message={q.error.message} />}
      {submitted && q.isSuccess && report === null && (
        <ErrorBox
          title="Transaction not found"
          message={`${requireChain(submitted.chainId).name} has no transaction with this hash. Check that the network selector matches where it was sent.`}
        />
      )}

      {report && (
        <>
          <Card>
            <SectionTitle>Findings</SectionTitle>
            <div className="space-y-3">
              {report.findings.map((f) => (
                <FindingCard key={f.title} severity={f.severity} title={f.title}>
                  {f.detail}
                </FindingCard>
              ))}
            </div>
          </Card>
          <Summary report={report} onInspect={onInspect} />
          {report.status === 'reverted' && <ReplaySection report={report} />}
          <InputSection report={report} />
          {report.receipt && <LogsSection logs={report.logs} />}
          {report.receipt && <TraceSection report={report} />}
        </>
      )}
    </div>
  )
}
