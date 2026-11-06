import { useState, type ReactNode } from 'react'
import { AlertTriangle, Check, CheckCircle2, Copy, ExternalLink, Info, Loader2, XCircle } from 'lucide-react'
import type { Severity } from '@/lib/tx'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-3xl border border-line bg-surface p-5 backdrop-blur-md sm:p-6 ${className}`}
    >
      {children}
    </section>
  )
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-subtle">{children}</h2>
      {aside}
    </div>
  )
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-subtle">
      {children}
    </label>
  )
}

const fieldClass =
  'min-h-11 w-full rounded-2xl border border-line bg-black/20 px-4 py-2.5 text-sm text-ink placeholder:text-subtle/70 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25'

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldClass} mono ${props.className ?? ''}`} spellCheck={false} autoComplete="off" />
}

export function PrimaryButton({
  children,
  loading,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-accent px-6 text-sm font-semibold text-canvas transition hover:bg-accent-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {loading && <Loader2 size={16} className="animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function GhostButton({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-xs font-medium text-muted transition hover:border-line-strong hover:text-ink active:scale-[0.98] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      {children}
    </button>
  )
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        })
      }}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-subtle transition hover:bg-surface-strong hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      {done ? <Check size={14} className="text-success" /> : <Copy size={14} />}
    </button>
  )
}

export function ExplorerLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-accent transition hover:text-accent-hover"
    >
      {children}
      <ExternalLink size={12} aria-hidden />
    </a>
  )
}

export function Row({ label, children, copy }: { label: string; children: ReactNode; copy?: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-line/60 py-3 last:border-b-0 sm:flex-row sm:items-start sm:gap-6">
      <dt className="w-36 shrink-0 text-xs uppercase tracking-[0.08em] text-subtle sm:pt-0.5">{label}</dt>
      <dd className="mono flex min-w-0 flex-1 items-start gap-1 break-all text-[13px] tabular-nums text-ink-2">
        <span className="min-w-0 flex-1">{children}</span>
        {copy && <CopyButton value={copy} />}
      </dd>
    </div>
  )
}

const SEVERITY_STYLE: Record<Severity, { icon: ReactNode; ring: string }> = {
  danger: { icon: <XCircle size={18} className="text-danger" />, ring: 'border-danger/40 bg-danger/10' },
  warn: { icon: <AlertTriangle size={18} className="text-warn" />, ring: 'border-warn/40 bg-warn/10' },
  info: { icon: <Info size={18} className="text-accent" />, ring: 'border-line bg-surface' },
  ok: { icon: <CheckCircle2 size={18} className="text-success" />, ring: 'border-success/30 bg-success/10' },
}

export function FindingCard({ severity, title, children }: { severity: Severity; title: string; children: ReactNode }) {
  const s = SEVERITY_STYLE[severity]
  return (
    <div className={`flex gap-3 rounded-2xl border p-4 ${s.ring}`}>
      <div className="mt-0.5 shrink-0">{s.icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <div className="mt-1 text-sm text-pretty text-muted">{children}</div>
      </div>
    </div>
  )
}

export function ErrorBox({ title, message }: { title: string; message: string }) {
  return (
    <div role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-4">
      <p className="text-sm font-semibold text-danger">{title}</p>
      <p className="mono mt-1 break-words text-xs text-muted">{message}</p>
    </div>
  )
}

export function Pill({ tone, children }: { tone: 'success' | 'danger' | 'neutral' | 'warn'; children: ReactNode }) {
  const cls = {
    success: 'bg-success/15 text-success',
    danger: 'bg-danger/15 text-danger',
    warn: 'bg-warn/15 text-warn',
    neutral: 'bg-surface-strong text-muted',
  }[tone]
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.06em] ${cls}`}>
      {children}
    </span>
  )
}

export function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre className="mono max-h-72 overflow-auto rounded-2xl border border-line bg-black/30 p-4 text-xs leading-relaxed text-ink-2">
      {children}
    </pre>
  )
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="text-sm text-pretty text-subtle">{children}</p>
}
