import { useQuery } from '@tanstack/react-query'
import type { RevertInfo } from '@/lib/decode'
import { lookupSignatures } from '@/lib/decode'
import { CodeBlock, CopyButton } from './ui'

export function RevertView({ revert }: { revert: RevertInfo }) {
  const needsLookup = revert.kind === 'custom' && revert.selector !== null
  const lookup = useQuery({
    queryKey: ['sig', revert.selector],
    enabled: needsLookup,
    queryFn: () => lookupSignatures({ functions: [revert.selector as string] }),
    staleTime: Infinity,
  })
  const candidates = revert.selector ? (lookup.data?.functions[revert.selector] ?? []) : []

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs uppercase tracking-[0.08em] text-subtle">Revert reason</p>
        <p className="display mt-1 break-words text-xl font-semibold text-danger">{revert.message || '(empty string)'}</p>
        {revert.hint && <p className="mt-1 text-sm text-pretty text-muted">{revert.hint}</p>}
      </div>

      {needsLookup && (
        <div className="text-sm text-muted">
          {lookup.isPending && <span>Looking up selector...</span>}
          {!lookup.isPending && candidates.length > 0 && (
            <div>
              <p className="mb-1 text-xs uppercase tracking-[0.08em] text-subtle">Matches in the signature database</p>
              <ul className="mono space-y-1 text-xs text-ink-2">
                {candidates.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {!lookup.isPending && candidates.length === 0 && <span>No public match for this selector.</span>}
        </div>
      )}

      {revert.raw !== '0x' && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.08em] text-subtle">Raw revert data</p>
            <CopyButton value={revert.raw} label="Copy revert data" />
          </div>
          <CodeBlock>{revert.raw}</CodeBlock>
        </div>
      )}
    </div>
  )
}
