import { erc20Abi, getAddress, hexToBigInt, size, type Address, type Hex } from 'viem'
import { getClient } from './clients'
import { getUsdc, requireChain } from '@/onchain-facts'
import { Amount, gasTokenDecimalsFor } from '@/onchain-money'

// keccak256("eip1967.proxy.implementation") - 1
const EIP1967_IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as Hex

export interface AddressReport {
  chainId: number
  address: Address
  kind: 'contract' | 'account'
  codeSize: number
  nonce: number
  /** The one balance to display. On USDC-gas chains this is the ERC-20 view, never summed with native. */
  primaryBalance: { amount: string; symbol: string; source: 'erc20' | 'native' }
  /** Native balance, only returned when the gas token is not USDC. */
  nativeBalance: { amount: string; symbol: string } | null
  usdcBalance: string | null
  token: { name?: string; symbol?: string; decimals?: number; totalSupply?: string } | null
  proxyImplementation: Address | null
}

export async function fetchAddressReport(chainId: number, address: Address): Promise<AddressReport> {
  const client = getClient(chainId)
  const chain = requireChain(chainId)
  const usdc = getUsdc(chainId)

  const [code, nonce, nativeRaw, usdcRaw, name, symbol, decimals, supply, slot] = await Promise.all([
    client.getCode({ address }),
    client.getTransactionCount({ address }),
    client.getBalance({ address }),
    usdc
      ? client.readContract({ address: usdc.address as Address, abi: erc20Abi, functionName: 'balanceOf', args: [address] }).catch(() => null)
      : Promise.resolve(null),
    client.readContract({ address, abi: erc20Abi, functionName: 'name' }).catch(() => undefined),
    client.readContract({ address, abi: erc20Abi, functionName: 'symbol' }).catch(() => undefined),
    client.readContract({ address, abi: erc20Abi, functionName: 'decimals' }).catch(() => undefined),
    client.readContract({ address, abi: erc20Abi, functionName: 'totalSupply' }).catch(() => undefined),
    client.getStorageAt({ address, slot: EIP1967_IMPL_SLOT }).catch(() => undefined),
  ])

  const hasCode = !!code && code !== '0x'
  const usdcFormatted = usdc && usdcRaw !== null ? Amount.fromRaw(usdcRaw, usdc.decimals).toString() : null
  const nativeFormatted = Amount.fromRaw(nativeRaw, gasTokenDecimalsFor(chainId)).toString()

  // On Arc the native balance and the ERC-20 balance are one pool of USDC: show it once.
  const primary: AddressReport['primaryBalance'] =
    chain.nativeCurrency.isUsdc && usdcFormatted !== null
      ? { amount: usdcFormatted, symbol: 'USDC', source: 'erc20' }
      : { amount: nativeFormatted, symbol: chain.nativeCurrency.symbol, source: 'native' }

  const implWord = slot && slot !== '0x' ? hexToBigInt(slot) : 0n
  const proxyImplementation: Address | null =
    implWord > 0n ? getAddress(`0x${implWord.toString(16).padStart(64, '0').slice(-40)}`) : null

  const isToken = name !== undefined || symbol !== undefined || decimals !== undefined
  return {
    chainId,
    address,
    kind: hasCode ? 'contract' : 'account',
    codeSize: hasCode && code ? size(code) : 0,
    nonce,
    primaryBalance: primary,
    nativeBalance: chain.nativeCurrency.isUsdc ? null : { amount: nativeFormatted, symbol: chain.nativeCurrency.symbol },
    usdcBalance: chain.nativeCurrency.isUsdc ? null : usdcFormatted,
    token: isToken
      ? {
          name,
          symbol,
          decimals,
          totalSupply: supply !== undefined && decimals !== undefined ? Amount.fromRaw(supply, decimals).toString() : supply?.toString(),
        }
      : null,
    proxyImplementation,
  }
}
