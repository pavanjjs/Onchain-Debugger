import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { Amount, gasTokenDecimalsFor } from '@/onchain-money'
import { decodeRevert, lookupSignatures } from '@/lib/decode'
import type { CallFrame, DecodedLog, TraceResult, TxReport } from '@/lib/tx'
import { replayRevert, traceTx } from '@/lib/tx'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { Card, CodeBlock, EmptyHint, ErrorBox, GhostButton, SectionTitle } from './ui'
import { RevertView } from './RevertView'

const short = (a: string) => `${a.slice(0, 8)}...${a.slice(-6)}`

export function ReplaySection({ report }: { report: TxReport }) {
  const q = useQuery({
    queryKey: ['replay', report.chainId, report.hash],
    queryFn: () => replayRevert(report),
    retry: false,
  })
  return (
    <Card>
      <SectionTitle>Revert replay</SectionTitle>
      {q.isPending && <EmptyHint>Replaying the call against the parent block...</EmptyHint>}
      {q.isError && <ErrorBox title="Could not recover the reason" message={q.error.message} />}
      {q.data?.reverted && q.data.revert && <RevertView revert={q.data.revert} />}
      {q.data && !q.data.reverted && (
        <p className="text-sm text-pretty text-warn">The replay did not revert at block {q.data.blockNumber.toString()}.</p>
      )}
      {q.data && <p className="mt-4 text-xs text-pretty text-subtle">{q.data.note}</p>}
    </Card>
  )
}

export function LogsSection({ logs }: { logs: DecodedLog[] }) {
  const topics = logs.filter((l) => l.eventName === null && l.topic0).map((l) => l.topic0 as string)
  const lookup = useQuery({
    queryKey: ['evsig', topics.join(',')],
    enabled: topics.length > 0,
    queryFn: () => lookupSignatures({ events: topics }),
    staleTime: Infinity,
  })

  return (
    <Card>
      <SectionTitle aside={<span className="text-xs tabular-nums text-subtle">{logs.length} total</span>}>
        Event logs
      </SectionTitle>
      {logs.length === 0 && <EmptyHint>This transaction emitted no events.</EmptyHint>}
      <ol className="space-y-3">
        {logs.map((log) => {
          const guess = log.topic0 ? lookup.data?.events[log.topic0]?.[0] : undefined
          return (
            <li key={`${log.index}-${log.address}`} className="rounded-2xl border border-line bg-black/20 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="display text-base font-semibold text-ink">
                  {log.eventName ?? guess ?? 'Unrecognized event'}
                </p>
                <span className="mono text-xs tabular-nums text-subtle">#{log.index}</span>
              </div>
              <p className="mono mt-1 break-all text-xs text-subtle">{log.address}</p>
              {log.args.length > 0 && (
                <dl className="mono mt-3 space-y-1 text-xs">
                  {log.args.map((a) => (
                    <div key={a.name} className="flex gap-3">
                      <dt className="w-16 shrink-0 text-subtle">{a.name}</dt>
                      <dd className="min-w-0 break-all tabular-nums text-ink-2">{a.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {log.eventName === null && (
                <p className="mono mt-3 break-all text-xs text-subtle">topic0 {log.topic0 ?? 'none (anonymous)'}</p>
              )}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

function FrameNode({ frame, chainId, depth }: { frame: CallFrame; chainId: number; depth: number }) {
  const [open, setOpen] = useState(depth < 2)
  const children = frame.calls ?? []
  const failed = !!frame.error
  const selector = frame.input && frame.input.length >= 10 ? frame.input.slice(0, 10) : null
  const gasUsed = frame.gasUsed ? BigInt(frame.gasUsed) : null
  const revertInfo = failed && frame.output && frame.output !== '0x' ? decodeRevert(frame.output as `0x${string}`) : null
  return (
    <li>
      <div className={`flex items-start gap-2 rounded-xl px-2 py-1.5 ${failed ? 'bg-danger/10' : ''}`}>
        {children.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Collapse' : 'Expand'}
            aria-expanded={open}
            className="mt-0.5 shrink-0 text-subtle transition hover:text-ink"
          >
            <ChevronRight size={14} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <div className="mono min-w-0 flex-1 text-xs">
          <p className="break-all text-ink-2">
            <span className="mr-2 font-medium text-accent">{frame.type}</span>
            {frame.to ? (
              <a
                href={buildAddressExplorerUrl(chainId, frame.to)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {short(frame.to)}
              </a>
            ) : (
              'create'
            )}
            {selector && <span className="ml-2 text-subtle">{selector}</span>}
          </p>
          <p className="mt-0.5 tabular-nums text-subtle">
            {gasUsed !== null && <>gas {gasUsed.toString()}</>}
            {frame.value && frame.value !== '0x0' && <> · value {Amount.fromRaw(BigInt(frame.value), gasTokenDecimalsFor(chainId)).toString()}</>}
          </p>
          {failed && (
            <p className="mt-0.5 text-danger">
              {frame.error}
              {revertInfo ? `: ${frame.revertReason ?? revertInfo.message}` : ''}
            </p>
          )}
        </div>
      </div>
      {open && children.length > 0 && (
        <ul className="ml-3 space-y-0.5 border-l border-line pl-3">
          {children.map((c, i) => (
            <FrameNode key={i} frame={c} chainId={chainId} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

export function TraceSection({ report }: { report: TxReport }) {
  const [requested, setRequested] = useState(false)
  const q = useQuery<TraceResult>({
    queryKey: ['trace', report.chainId, report.hash],
    enabled: requested,
    queryFn: () => traceTx(report.chainId, report.hash),
    retry: false,
  })
  return (
    <Card>
      <SectionTitle
        aside={
          !requested ? <GhostButton onClick={() => setRequested(true)}>Load call trace</GhostButton> : undefined
        }
      >
        Internal call trace
      </SectionTitle>
      {!requested && (
        <EmptyHint>Loads the full call tree with debug_traceTransaction, if this chain's public RPC allows it.</EmptyHint>
      )}
      {requested && q.isPending && <EmptyHint>Tracing...</EmptyHint>}
      {q.data && !q.data.supported && (
        <div className="space-y-2">
          <p className="text-sm text-pretty text-warn">This RPC does not expose debug_traceTransaction.</p>
          <p className="mono break-words text-xs text-subtle">{q.data.reason}</p>
          <p className="text-sm text-pretty text-muted">
            The revert replay above and the event logs are the best available signals. Use the explorer link for its own
            internal transaction view.
          </p>
        </div>
      )}
      {q.data?.supported && (
        <ul className="space-y-0.5">
          <FrameNode frame={q.data.root} chainId={report.chainId} depth={0} />
        </ul>
      )}
    </Card>
  )
}

export function InputSection({ report }: { report: TxReport }) {
  const { tx, input } = report
  const selector = tx.input.length >= 10 ? tx.input.slice(0, 10) : null
  const lookup = useQuery({
    queryKey: ['fnsig', selector],
    enabled: !!selector && !input,
    queryFn: () => lookupSignatures({ functions: [selector as string] }),
    staleTime: Infinity,
  })
  const guesses = selector ? (lookup.data?.functions[selector] ?? []) : []

  return (
    <Card>
      <SectionTitle>Call data</SectionTitle>
      {tx.input === '0x' && (
        <EmptyHint>{report.isContractCreation ? 'Empty contract creation.' : 'Plain value transfer, no call data.'}</EmptyHint>
      )}
      {input && (
        <div className="mb-4">
          <p className="display text-xl font-semibold text-ink">{input.functionName}</p>
          <dl className="mono mt-2 space-y-1 text-xs">
            {input.args.map((a) => (
              <div key={a.name} className="flex gap-3">
                <dt className="w-20 shrink-0 text-subtle">{a.name}</dt>
                <dd className="min-w-0 break-all tabular-nums text-ink-2">{a.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {!input && selector && (
        <div className="mb-4 text-sm text-muted">
          <p>
            Selector <span className="mono text-ink-2">{selector}</span>
          </p>
          {guesses.length > 0 ? (
            <ul className="mono mt-1 space-y-1 text-xs text-ink-2">
              {guesses.slice(0, 4).map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          ) : (
            !lookup.isPending && <p className="mt-1 text-subtle">No public match. Use the Call tab with the contract's signature to test it.</p>
          )}
        </div>
      )}
      {tx.input !== '0x' && <CodeBlock>{tx.input}</CodeBlock>}
    </Card>
  )
}
