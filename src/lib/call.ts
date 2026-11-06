import {
  decodeFunctionResult,
  encodeFunctionData,
  isAddress,
  parseAbiItem,
  type Abi,
  type AbiFunction,
  type AbiParameter,
  type Address,
  type Hex,
} from 'viem'
import { getClient } from './clients'
import { bigintReplacer, decodeRevert, errorMessage, extractRevertData, type RevertInfo } from './decode'
import { gasTokenDecimalsFor, Amount } from '@/onchain-money'

export function parseSignature(sig: string): AbiFunction {
  const trimmed = sig.trim()
  if (!trimmed) throw new Error('Enter a function signature, e.g. balanceOf(address) returns (uint256)')
  const text = trimmed.startsWith('function ') ? trimmed : `function ${trimmed}`
  const item = parseAbiItem(text)
  if (item.type !== 'function') throw new Error('That is not a function signature')
  return item
}

/** Splits on top-level commas, ignoring commas inside brackets, parentheses, or quotes. */
export function splitArgs(input: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote = false
  let current = ''
  for (const ch of input) {
    if (ch === '"') quote = !quote
    if (!quote) {
      if (ch === '[' || ch === '(') depth++
      if (ch === ']' || ch === ')') depth--
      if (ch === ',' && depth === 0) {
        out.push(current.trim())
        current = ''
        continue
      }
    }
    current += ch
  }
  if (current.trim() || out.length) out.push(current.trim())
  return out
}

function stripQuotes(v: string): string {
  return v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v
}

function coerce(param: AbiParameter, v: unknown): unknown {
  const type = param.type
  if (type.endsWith(']')) {
    const inner = { ...param, type: type.slice(0, type.lastIndexOf('[')) }
    const arr = typeof v === 'string' ? (JSON.parse(v) as unknown[]) : (v as unknown[])
    return arr.map((x) => coerce(inner, x))
  }
  if (type === 'tuple') {
    const comps = (param as AbiParameter & { components: readonly AbiParameter[] }).components
    const parsed = typeof v === 'string' ? (JSON.parse(v) as unknown) : v
    return comps.map((c, i) =>
      coerce(c, Array.isArray(parsed) ? parsed[i] : (parsed as Record<string, unknown>)[c.name ?? String(i)]),
    )
  }
  if (/^u?int\d*$/.test(type)) return BigInt(String(v).trim())
  if (type === 'bool') return v === true || String(v).trim() === 'true'
  if (type === 'address') {
    const a = stripQuotes(String(v).trim())
    if (!isAddress(a)) throw new Error(`"${a}" is not a valid address`)
    return a
  }
  return typeof v === 'string' ? stripQuotes(v.trim()) : v
}

export function buildArgs(fn: AbiFunction, rawArgs: string): unknown[] {
  const parts = splitArgs(rawArgs)
  if (parts.length !== fn.inputs.length) {
    throw new Error(`${fn.name} takes ${fn.inputs.length} argument(s) but ${parts.length} were given`)
  }
  return fn.inputs.map((p, i) => coerce(p, parts[i]))
}

export interface CallInput {
  chainId: number
  to: Address
  signature: string
  args: string
  from?: Address
  /** Native value in the chain's gas token, decimal string. */
  value?: string
}

export interface CallOutcome {
  ok: boolean
  calldata: Hex
  selector: Hex
  returnData?: Hex
  decoded?: string
  gasEstimate?: bigint
  revert?: RevertInfo
  warnings: string[]
}

export async function runCall(input: CallInput): Promise<CallOutcome> {
  const fn = parseSignature(input.signature)
  const args = buildArgs(fn, input.args)
  const abi = [fn] as Abi
  const calldata = encodeFunctionData({ abi, functionName: fn.name, args })
  const client = getClient(input.chainId)
  const value = input.value?.trim() ? Amount.parse(input.value.trim(), gasTokenDecimalsFor(input.chainId)).raw : undefined
  const request = { to: input.to, data: calldata, account: input.from, value } as const
  const warnings: string[] = []
  const selector = calldata.slice(0, 10) as Hex

  const code = await client.getCode({ address: input.to }).catch(() => undefined)
  if (code === '0x' || code === undefined) {
    warnings.push('The target address has no code on this chain, so the call will return empty data.')
  }

  try {
    const res = await client.call(request)
    const returnData = res.data ?? '0x'
    let decoded: string | undefined
    if (fn.outputs.length > 0 && returnData !== '0x') {
      try {
        const out = decodeFunctionResult({ abi, functionName: fn.name, data: returnData })
        decoded = JSON.stringify(out, bigintReplacer, 2)
      } catch {
        warnings.push('The return data did not match the declared return types. Check the "returns" part of the signature.')
      }
    } else if (fn.outputs.length > 0) {
      warnings.push('The call returned empty data but the signature declares return values.')
    }
    const gasEstimate = await client.estimateGas({ ...request }).catch(() => undefined)
    return { ok: true, calldata, selector, returnData, decoded, gasEstimate, warnings }
  } catch (e) {
    const data = extractRevertData(e)
    if (data === undefined) throw new Error(errorMessage(e))
    return { ok: false, calldata, selector, revert: decodeRevert(data), warnings }
  }
}
