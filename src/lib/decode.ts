import { decodeErrorResult, parseAbi, type Hex } from 'viem'

const ERROR_ABI = parseAbi(['error Error(string message)', 'error Panic(uint256 code)'])

const PANIC_CODES: Record<string, string> = {
  '0': 'Generic compiler panic',
  '1': 'Assertion failed',
  '17': 'Arithmetic overflow or underflow',
  '18': 'Division or modulo by zero',
  '33': 'Invalid enum value',
  '34': 'Corrupted storage byte array',
  '49': 'pop() on an empty array',
  '50': 'Array index out of bounds',
  '65': 'Out of memory',
  '81': 'Call to an uninitialized internal function',
}

export type RevertKind = 'empty' | 'error-string' | 'panic' | 'custom'

export interface RevertInfo {
  kind: RevertKind
  raw: Hex
  selector: Hex | null
  /** Plain-language summary of what the revert says. */
  message: string
  hint?: string
}

export function decodeRevert(data: Hex | undefined): RevertInfo {
  if (!data || data === '0x') {
    return {
      kind: 'empty',
      raw: '0x',
      selector: null,
      message: 'Reverted with no reason data',
      hint: 'Usually a bare require(false), a failed access check, a call to a function that does not exist, or running out of gas.',
    }
  }
  const selector = data.slice(0, 10) as Hex
  try {
    const decoded = decodeErrorResult({ abi: ERROR_ABI, data })
    if (decoded.errorName === 'Error') {
      return { kind: 'error-string', raw: data, selector, message: String(decoded.args?.[0] ?? '') }
    }
    const code = String(decoded.args?.[0] ?? '')
    return {
      kind: 'panic',
      raw: data,
      selector,
      message: `Panic 0x${BigInt(code).toString(16)}: ${PANIC_CODES[code] ?? 'Unknown panic code'}`,
    }
  } catch {
    return {
      kind: 'custom',
      raw: data,
      selector,
      message: `Custom error ${selector}`,
      hint: 'Not a standard Error or Panic. Look up the selector below, or match it against the contract ABI.',
    }
  }
}

/** Walks a viem error chain looking for the hex revert payload. */
export function extractRevertData(err: unknown): Hex | undefined {
  let current: unknown = err
  for (let depth = 0; depth < 8 && current; depth++) {
    const e = current as { data?: unknown; cause?: unknown }
    if (typeof e.data === 'string' && /^0x[0-9a-fA-F]*$/.test(e.data)) return e.data as Hex
    if (e.data && typeof e.data === 'object') {
      const inner = (e.data as { data?: unknown }).data
      if (typeof inner === 'string' && /^0x[0-9a-fA-F]*$/.test(inner)) return inner as Hex
    }
    current = e.cause
  }
  return undefined
}

export function errorMessage(err: unknown): string {
  const e = err as { shortMessage?: string; message?: string }
  return e?.shortMessage ?? e?.message ?? 'Unknown error'
}

interface LookupResult {
  functions: Record<string, string[]>
  events: Record<string, string[]>
}

/** Best-effort public signature database lookup. Returns {} on any failure. */
export async function lookupSignatures(selectors: { functions?: string[]; events?: string[] }): Promise<LookupResult> {
  const empty: LookupResult = { functions: {}, events: {} }
  const fns = [...new Set(selectors.functions ?? [])]
  const evs = [...new Set(selectors.events ?? [])]
  if (fns.length === 0 && evs.length === 0) return empty
  const params = new URLSearchParams()
  if (fns.length) params.set('function', fns.join(','))
  if (evs.length) params.set('event', evs.join(','))
  try {
    const res = await fetch(`https://api.openchain.xyz/signature-database/v1/lookup?${params.toString()}`, {
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return empty
    const json = (await res.json()) as {
      result?: {
        function?: Record<string, { name: string }[] | null>
        event?: Record<string, { name: string }[] | null>
      }
    }
    const out: LookupResult = { functions: {}, events: {} }
    for (const [k, v] of Object.entries(json.result?.function ?? {})) out.functions[k] = (v ?? []).map((x) => x.name)
    for (const [k, v] of Object.entries(json.result?.event ?? {})) out.events[k] = (v ?? []).map((x) => x.name)
    return out
  } catch {
    return empty
  }
}

export function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value
}
