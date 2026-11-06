# Onchain Debugger

A read-only tool for finding out why a transaction failed, what it did, and what it cost. Paste a transaction hash, simulate a contract call, or inspect an address on Arc Testnet and other supported networks. Nothing is signed or sent.

Built with [Arc Studio](https://studio.arc.io)

Live app: https://pavanjj-app-90e5d6c1-1545-438e-a044-b28658b9a1cf.static.hf.space

## Features

- Transaction debugging: status, fee, decoded call data, event logs, plain-language findings, and the revert reason for failed transactions
- Internal call tree, when the network's public RPC supports tracing
- Call simulator: test any function with a signature and arguments, and see the decoded result or revert reason
- Address inspector: wallet or contract, balances, proxy target, and token details
- USDC-aware: on Arc the gas token is USDC, so fees and balances are shown in USDC and never double counted

## Tech stack

React, TypeScript, Vite, Tailwind CSS, viem, wagmi, TanStack Query.

## Development

Prerequisites: [Bun](https://bun.sh).

```bash
bun install
bun run dev
bun run check   # lint and typecheck
```

### Environment variables

None.
