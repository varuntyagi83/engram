// src/app/api/billing/webhook/route.ts
// POST /api/billing/webhook
// Handles Stripe webhook events for billing lifecycle management.
//
// Required env vars:
//   STRIPE_SECRET_KEY      — Stripe secret key
//   STRIPE_WEBHOOK_SECRET  — Webhook signing secret (whsec_...) from Stripe dashboard
//                            or from: stripe listen --print-secret
//
// Events handled:
//   checkout.session.completed     — user subscribed → store "upgraded to Pro" memory
//   customer.subscription.deleted  — user cancelled  → store "cancelled Pro" memory
//
// Raw body parsing is required for Stripe signature verification.
// Next.js App Router does NOT buffer raw bodies by default for Node.js runtime —
// we use await req.text() to get the raw string before parsing.

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStorage } from '../../../../lib/storage'

// Force Node.js runtime so req.text() returns the unmodified raw body.
// Edge runtime would silently strip certain byte sequences, breaking HMAC verification.
export const runtime = 'nodejs'

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: 'Stripe is not configured — set STRIPE_SECRET_KEY' },
      { status: 500 }
    )
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'Webhook secret is not configured — set STRIPE_WEBHOOK_SECRET' },
      { status: 500 }
    )
  }

  // Lazily instantiate Stripe after guards so a missing key returns the
  // intended error message rather than a raw SDK TypeError at module load time.
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-01-27.acacia' })

  const rawBody = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing Stripe-Signature header' },
      { status: 400 }
    )
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook signature verification failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const storage = getStorage()

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.metadata?.userId

    if (userId) {
      try {
        await storage.storeMemory({
          userId,
          type: 'procedural',
          content: 'User upgraded to Pro plan',
          importance: 5,
        })
      } catch (err) {
        console.error('[api/billing/webhook] Failed to store checkout.session.completed memory for userId:', userId, err)
        // Do not fail the webhook — memory storage is best-effort
      }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription
    // userId is stored in subscription metadata when the subscription is created.
    // checkout.session.completed populates session metadata; the subscription object
    // inherits metadata set during creation via the checkout session.
    const userId = subscription.metadata?.userId

    if (userId) {
      try {
        await storage.storeMemory({
          userId,
          type: 'procedural',
          content: 'User cancelled Pro plan',
          importance: 4,
        })
      } catch (err) {
        console.error('[api/billing/webhook] Failed to store customer.subscription.deleted memory for userId:', userId, err)
        // Do not fail the webhook — memory storage is best-effort
      }
    }
  }

  return NextResponse.json({ received: true })
}
