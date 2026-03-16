'use client'

import React, { useState } from 'react'
import Link from 'next/link'

// ── Types ──────────────────────────────────────────────────────────────────

interface PlanFeature {
  label: string
  included: boolean
}

// ── Feature lists ─────────────────────────────────────────────────────────

const FREE_FEATURES: PlanFeature[] = [
  { label: 'SQLite local storage (offline, zero cloud)', included: true },
  { label: 'FTS5 full-text search', included: true },
  { label: 'MCP server (stdio + SSE)', included: true },
  { label: 'TypeScript SDK', included: true },
  { label: 'Python SDK', included: true },
  { label: 'JSON / Markdown / cursor-rules export', included: true },
  { label: 'Memory decay & deduplication', included: true },
  { label: 'Semantic search (pgvector)', included: false },
  { label: 'Multi-device sync', included: false },
  { label: 'Session summarization', included: false },
  { label: 'Webhook ingestion (Slack, GitHub)', included: false },
  { label: 'Priority support', included: false },
]

const PRO_FEATURES: PlanFeature[] = [
  { label: 'Everything in Free', included: true },
  { label: 'Semantic search (pgvector)', included: true },
  { label: 'Multi-device sync via Supabase', included: true },
  { label: 'Session summarization (GPT-4o-mini)', included: true },
  { label: 'Webhook ingestion (Slack, GitHub)', included: true },
  { label: 'Priority support', included: true },
]

// ── Styles ─────────────────────────────────────────────────────────────────

const s = {
  page: {
    minHeight: '100vh',
    background: '#0f0f0f',
    color: '#e5e5e5',
    fontFamily: 'system-ui, sans-serif',
  } as React.CSSProperties,

  header: {
    borderBottom: '1px solid #2a2a2a',
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  } as React.CSSProperties,

  headerTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#ffffff',
    margin: 0,
  } as React.CSSProperties,

  backLink: {
    fontSize: '13px',
    color: '#7c6af7',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    marginLeft: 'auto',
  } as React.CSSProperties,

  content: {
    maxWidth: '860px',
    margin: '0 auto',
    padding: '48px 24px',
  } as React.CSSProperties,

  hero: {
    textAlign: 'center',
    marginBottom: '56px',
  } as React.CSSProperties,

  heroTitle: {
    fontSize: '32px',
    fontWeight: 700,
    color: '#ffffff',
    margin: '0 0 12px 0',
    lineHeight: 1.2,
  } as React.CSSProperties,

  heroSub: {
    fontSize: '16px',
    color: '#888',
    margin: 0,
    lineHeight: 1.6,
  } as React.CSSProperties,

  plans: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
    alignItems: 'start',
  } as React.CSSProperties,

  card: (highlighted: boolean): React.CSSProperties => ({
    background: highlighted ? '#16133a' : '#1a1a1a',
    border: `1px solid ${highlighted ? '#7c6af7' : '#2a2a2a'}`,
    borderRadius: '14px',
    padding: '28px',
    position: 'relative',
  }),

  popularBadge: {
    position: 'absolute',
    top: '-12px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#7c6af7',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 700,
    padding: '4px 14px',
    borderRadius: '20px',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,

  planName: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#ffffff',
    margin: '0 0 6px 0',
  } as React.CSSProperties,

  price: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
    margin: '0 0 6px 0',
  } as React.CSSProperties,

  priceAmount: {
    fontSize: '36px',
    fontWeight: 800,
    color: '#ffffff',
    lineHeight: 1,
  } as React.CSSProperties,

  pricePeriod: {
    fontSize: '14px',
    color: '#888',
  } as React.CSSProperties,

  planDesc: {
    fontSize: '13px',
    color: '#666',
    margin: '0 0 24px 0',
    lineHeight: 1.5,
  } as React.CSSProperties,

  divider: {
    border: 'none',
    borderTop: '1px solid #2a2a2a',
    margin: '0 0 20px 0',
  } as React.CSSProperties,

  featureList: {
    listStyle: 'none',
    margin: '0 0 28px 0',
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  } as React.CSSProperties,

  featureItem: (included: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    fontSize: '13px',
    color: included ? '#d0d0d0' : '#555',
    lineHeight: 1.4,
  }),

  featureIcon: (included: boolean): React.CSSProperties => ({
    flexShrink: 0,
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    background: included ? '#7c6af722' : '#33333344',
    border: `1px solid ${included ? '#7c6af7' : '#444'}`,
    color: included ? '#7c6af7' : '#555',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: 700,
    marginTop: '1px',
  }),

  btnPrimary: {
    width: '100%',
    background: '#7c6af7',
    border: 'none',
    borderRadius: '8px',
    color: '#ffffff',
    padding: '13px 18px',
    fontSize: '15px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'background 0.15s, opacity 0.15s',
    display: 'block',
    textAlign: 'center',
  } as React.CSSProperties,

  btnSecondary: {
    width: '100%',
    background: 'transparent',
    border: '1px solid #333',
    borderRadius: '8px',
    color: '#888',
    padding: '13px 18px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'default',
    display: 'block',
    textAlign: 'center',
  } as React.CSSProperties,

  errorBanner: {
    background: '#ef444422',
    border: '1px solid #ef444444',
    borderRadius: '8px',
    padding: '12px 16px',
    fontSize: '13px',
    color: '#f87171',
    marginTop: '24px',
    textAlign: 'center',
  } as React.CSSProperties,

  loadingOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 15, 15, 0.85)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    gap: '16px',
  } as React.CSSProperties,

  loadingText: {
    fontSize: '16px',
    color: '#a89cf7',
    fontWeight: 600,
  } as React.CSSProperties,

  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #2a2a2a',
    borderTop: '3px solid #7c6af7',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  } as React.CSSProperties,
}

// ── Upgrade page ────────────────────────────────────────────────────────────

export default function UpgradePage() {
  const userId = 'varun'

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUpgrade() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })

      const data = (await res.json()) as { url?: string; error?: string }

      if (!res.ok || !data.url) {
        setError(data.error ?? 'Could not start checkout — please try again')
        return
      }

      // Redirect to Stripe hosted checkout
      window.location.href = data.url
    } catch {
      setError('Network error — could not reach the server. Please try again.')
    } finally {
      // Keep loading=true after successful redirect so the UI stays frozen
      // while the browser navigates away. Reset only on error path above.
      setLoading(false)
    }
  }

  return (
    <>
      {/* Spinner overlay while redirecting to Stripe */}
      {loading && (
        <div style={s.loadingOverlay}>
          <div style={s.spinner} />
          <p style={s.loadingText}>Redirecting to checkout...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      <div style={s.page}>
        {/* Header */}
        <div style={s.header}>
          <p style={s.headerTitle}>Memory Engine</p>
          <Link href="/" style={s.backLink}>
            &larr; Back to dashboard
          </Link>
        </div>

        {/* Main content */}
        <div style={s.content}>
          {/* Hero */}
          <div style={s.hero}>
            <h1 style={s.heroTitle}>Simple, transparent pricing</h1>
            <p style={s.heroSub}>
              Start free, forever. Upgrade when you need cloud sync and semantic search.
            </p>
          </div>

          {/* Plan cards */}
          <div style={s.plans}>
            {/* Free plan */}
            <div style={s.card(false)}>
              <h2 style={s.planName}>Free</h2>
              <div style={s.price}>
                <span style={s.priceAmount}>€0</span>
                <span style={s.pricePeriod}>/ forever</span>
              </div>
              <p style={s.planDesc}>
                Local SQLite, full MCP support, no internet required. Runs entirely on your machine.
              </p>

              <hr style={s.divider} />

              <ul style={s.featureList}>
                {FREE_FEATURES.map(f => (
                  <li key={f.label} style={s.featureItem(f.included)}>
                    <span style={s.featureIcon(f.included)}>
                      {f.included ? '✓' : '×'}
                    </span>
                    {f.label}
                  </li>
                ))}
              </ul>

              <div style={s.btnSecondary}>Current plan</div>
            </div>

            {/* Pro plan */}
            <div style={s.card(true)}>
              <span style={s.popularBadge}>Most Popular</span>

              <h2 style={s.planName}>Pro</h2>
              <div style={s.price}>
                <span style={s.priceAmount}>€9</span>
                <span style={s.pricePeriod}>/ month</span>
              </div>
              <p style={s.planDesc}>
                Everything in Free plus semantic search, multi-device sync, and session summarization.
              </p>

              <hr style={s.divider} />

              <ul style={s.featureList}>
                {PRO_FEATURES.map(f => (
                  <li key={f.label} style={s.featureItem(f.included)}>
                    <span style={s.featureIcon(f.included)}>
                      {f.included ? '✓' : '×'}
                    </span>
                    {f.label}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => void handleUpgrade()}
                disabled={loading}
                style={{
                  ...s.btnPrimary,
                  opacity: loading ? 0.7 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Redirecting...' : 'Upgrade to Pro'}
              </button>
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div style={s.errorBanner}>{error}</div>
          )}
        </div>
      </div>
    </>
  )
}
