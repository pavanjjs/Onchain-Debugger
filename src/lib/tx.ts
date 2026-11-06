import {
  decodeEventLog,
  decodeFunctionData,
  erc20Abi,
  type Hex,
  type Log,
  type Transaction,
  type TransactionReceipt,
} from 'viem'
import { getClient } from './clients'
import { decodeRevert, errorMessage, extractRevertData, type RevertInfo } from './decode'
import { getUsdc, requireChain } from '@/onchain-facts'
import { Amount, gasTokenDecimalsFor } from '@/onchain-money'

export type Severity = 'danger' | 'warn' | 'info' | 'ok'

export interface Finding {
  severity: Severity
  title: string
  detail: string
}

export interface DecodedInput {
  functionName: string
  args: { name: string; value: string }[]
}

export interface DecodedLog {
  index: number
  address: string
  eventName: string | null
  args: { name: string; value: string }[]
  topic0: Hex | null
  raw: Log
}

export interface CallFrame {
  type: string
  from: string
  to?: string
  value?: string
  gas?: string
  gasUsed?: string
  input?: string
  output?: string
  error?: string
  revertReason?: string
  calls?: CallFrame[]
}

export type TraceResult =
  | { supported: true; root: CallFrame }
  | { supported: false; reason: string }

export interface ReplayResult {
  blockNumber: bigint
  reverted: boolean
  revert?: RevertInfo
  note: string
}

export interface TxReport {
  chainId: number
  hash: Hex
  tx: Transaction
  receipt: TransactionReceipt | null
  timestamp: bigint | null
  confirmations: bigint | null
  status: 'success' | 'reverted' | 'pending'
  /** Fee in the chain's gas token, exact decimal string. */
  fee: string | null
  value: string
  gasPriceGwei: string | null
  isContractCreation: boolean
  toHasCode: boolean | null
  input: DecodedInput | null
  logs: DecodedLog[]
  findings: Finding[]
}

const gwei = (wei: bigint) => {
  const whole = wei / 1_000_000_000n
  const frac = (wei % 1_000_000_000n).toString().padStart(9, '0').slice(0, 4)
  return `${whole.toString()}.${frac}`
}

function decodeInput(input: Hex): DecodedInput | null {
  if (input === '0x') return null
  try {
    const d = decodeFunctionData({ abi: erc20Abi, data: input })
    const fn = erc20Abi.find((x) => x.type === 'function' && x.name === d.functionName)
    const names = fn && 'inputs' in fn ? fn.inputs.map((i) => i.name ?? '') : []
    return {
      functionName: d.functionName,
      args: (d.args ?? []).map((a, i) => ({ name: names[i] || `arg${i}`, value: String(a) })),
    }
  } catch {
    return null
  }
}

function decodeLogs(chainId: number, logs: readonly Log[]): DecodedLog[] {
  const usdc = getUsdc(chainId)
  return logs.map((log, i) => {
    const base = {
      index: log.logIndex ?? i,
      address: log.address,
      topic0: (log.topics[0]) ?? null,
      raw: log,
    }
    try {
      const d = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics })
      const isUsdc = usdc && log.address.toLowerCase() === usdc.address.toLowerCase()
      const args = Object.entries((d.args ?? {}) as Record<string, unknown>).map(([name, v]) => {
        if (typeof v === 'bigint' && isUsdc && name === 'value') {
          return { name, value: `${Amount.fromRaw(v, usdc.decimals).toString()} USDC` }
        }
        return { name, value: String(v) }
      })
      return { ...base, eventName: d.eventName, args }
    } catch {
      return { ...base, eventName: null, args: [] }
    }
  })
}

export async function fetchTxReport(chainId: number, hash: Hex): Promise<TxReport | null> {
  const client = getClient(chainId)
  const chain = requireChain(chainId)

  let tx: Transaction
  try {
    tx = await client.getTransaction({ hash })
  } catch (e) {
    if ((e as { name?: string }).name === 'TransactionNotFoundError') return null
    throw e
  }

  const [receipt, head] = await Promise.all([
    client.getTransactionReceipt({ hash }).catch(() => null),
    client.getBlockNumber().catch(() => null),
  ])
  const block = receipt ? await client.getBlock({ blockNumber: receipt.blockNumber }).catch(() => null) : null
  const toHasCode = tx.to ? await client.getCode({ address: tx.to }).then((c) => !!c && c !== '0x').catch(() => null) : null

  const status = receipt ? receipt.status : 'pending'
  const gasDecimals = gasTokenDecimalsFor(chainId)
  const fee = receipt ? Amount.fromRaw(receipt.gasUsed * receipt.effectiveGasPrice, gasDecimals).toString() : null
  const value = Amount.fromRaw(tx.value, gasDecimals).toString()
  const logs = receipt ? decodeLogs(chainId, receipt.logs) : []
  const input = decodeInput(tx.input)
  const isContractCreation = tx.to === null

  const findings: Finding[] = []
  if (!receipt) {
    findings.push({
      severity: 'info',
      title: 'Pending',
      detail: 'The node knows this transaction but it has not been included in a block yet.',
    })
  }
  if (receipt && receipt.status === 'reverted') {
    const usedRatio = Number((receipt.gasUsed * 1000n) / (tx.gas || 1n)) / 1000
    findings.push({
      severity: 'danger',
      title: 'Transaction reverted',
      detail: 'State changes were rolled back and the fee was still charged. See the revert replay below for the reason.',
    })
    if (usedRatio >= 0.95) {
      findings.push({
        severity: 'warn',
        title: `Used ${(usedRatio * 100).toFixed(1)}% of the gas limit`,
        detail: 'A revert this close to the limit is often an out-of-gas failure. Resend with a higher gas limit.',
      })
    }
  }
  if (receipt && receipt.status === 'success' && tx.input !== '0x' && toHasCode === false) {
    findings.push({
      severity: 'warn',
      title: 'Call data sent to an address with no code',
      detail: 'The recipient is not a contract on this chain, so the call data was ignored and only the value moved.',
    })
  }
  if (receipt && receipt.status === 'success' && toHasCode && tx.input !== '0x' && receipt.logs.length === 0) {
    findings.push({
      severity: 'info',
      title: 'Succeeded but emitted no events',
      detail: 'Nothing went wrong, but the contract logged nothing. If you expected a transfer or state event, check the function you called.',
    })
  }
  if (receipt && receipt.status === 'success') {
    findings.push({ severity: 'ok', title: 'Executed successfully', detail: 'The transaction was included and finished without reverting.' })
  }
  if (chain.nativeCurrency.isUsdc && fee !== null) {
    findings.push({
      severity: 'info',
      title: 'Fee paid in USDC',
      detail: `${chain.name} uses USDC as its gas token, so the fee above is real USDC from the sender's balance.`,
    })
  }

  return {
    chainId,
    hash,
    tx,
    receipt,
    timestamp: block?.timestamp ?? null,
    confirmations: receipt && head !== null ? head - receipt.blockNumber + 1n : null,
    status,
    fee,
    value,
    gasPriceGwei: receipt ? gwei(receipt.effectiveGasPrice) : null,
    isContractCreation,
    toHasCode,
    input,
    logs,
    findings,
  }
}

/** Re-runs a reverted transaction against the parent block to recover the revert reason. */
export async function replayRevert(report: TxReport): Promise<ReplayResult> {
  const { tx, receipt, chainId } = report
  if (!receipt) throw new Error('Transaction is not mined yet')
  const client = getClient(chainId)
  const blockNumber = receipt.blockNumber > 0n ? receipt.blockNumber - 1n : 0n
  const note =
    'Replayed with eth_call at the block before inclusion. Transactions earlier in the same block are not applied, so the result can differ from the original run.'
  try {
    await client.call({
      account: tx.from,
      to: tx.to ?? undefined,
      data: tx.input,
      value: tx.value,
      gas: tx.gas,
      blockNumber,
    })
    return { blockNumber, reverted: false, note: `${note} The replay succeeded, so state changed within the block or the node pruned that state.` }
  } catch (e) {
    const data = extractRevertData(e)
    if (data === undefined) {
      throw new Error(`Replay failed without revert data: ${errorMessage(e)}`)
    }
    return { blockNumber, reverted: true, revert: decodeRevert(data), note }
  }
}

export async function traceTx(chainId: number, hash: Hex): Promise<TraceResult> {
  const client = getClient(chainId) as unknown as {
    request: (args: { method: string; params: unknown[] }) => Promise<unknown>
  }
  try {
    const root = (await client.request({
      method: 'debug_traceTransaction',
      params: [hash, { tracer: 'callTracer', tracerConfig: { withLog: false } }],
    })) as CallFrame
    return { supported: true, root }
  } catch (e) {
    return { supported: false, reason: errorMessage(e) }
  }
}
