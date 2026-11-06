import { useCallback, useState } from 'react'

export interface RecentItem {
  chainId: number
  value: string
}

const MAX = 6

function load(key: string): RecentItem[] {
  try {
    const raw = localStorage.getItem(key)
    const parsed: unknown[] = raw ? (JSON.parse(raw) as unknown[]) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (x): x is RecentItem =>
        typeof (x as Partial<RecentItem> | null)?.chainId === 'number' && typeof (x as Partial<RecentItem> | null)?.value === 'string',
    )
  } catch {
    return []
  }
}

/** Recent lookups per tool, kept in this browser only. */
export function useRecent(kind: 'tx' | 'address') {
  const key = `onchain-debugger:recent:${kind}`
  const [items, setItems] = useState<RecentItem[]>(() => load(key))

  const add = useCallback(
    (item: RecentItem) => {
      setItems((prev) => {
        const next = [item, ...prev.filter((p) => !(p.chainId === item.chainId && p.value === item.value))].slice(0, MAX)
        try {
          localStorage.setItem(key, JSON.stringify(next))
        } catch {
          // storage unavailable: keep the in-memory list
        }
        return next
      })
    },
    [key],
  )

  const clear = useCallback(() => {
    setItems([])
    try {
      localStorage.removeItem(key)
    } catch {
      // ignore
    }
  }, [key])

  return { items, add, clear }
}
