import type { RecentItem } from '@/lib/history'
import { getChain } from '@/onchain-facts'

export function RecentList({
  items,
  onPick,
  onClear,
}: {
  items: RecentItem[]
  onPick: (item: RecentItem) => void
  onClear: () => void
}) {
  if (items.length === 0) return null
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-subtle">Recent</p>
        <button
          type="button"
          onClick={onClear}
          className="min-h-8 px-1 text-xs text-subtle transition hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          Clear
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={`${item.chainId}-${item.value}`}
            type="button"
            onClick={() => onPick(item)}
            title={item.value}
            className="mono min-h-9 rounded-xl border border-line px-3 text-xs tabular-nums text-muted transition hover:border-line-strong hover:text-ink active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {item.value.slice(0, 8)}...{item.value.slice(-6)}
            <span className="ml-2 font-sans text-subtle">{getChain(item.chainId)?.name ?? item.chainId}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
