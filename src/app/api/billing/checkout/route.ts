// src/app/api/billing/checkout/route.ts
// POST /api/billing/checkout
// Creates a Stripe Checkout session for the Pro plan (€9/mo subscription).
//
// Required env vars:
//   STRIPE_SECRET_KEY      — Stripe secret key
//   STRIPE_PRO_PRICE_ID    — Pre-created Price ID in Stripe dashboard for the €9/mo Pro plan
//                            e.g. price_1ABCxyz... — create it in Stripe dashboard or via CLI:
//                            stripe prices create --unit-amount 900 --currency eur \
//                              --recurring[interval]=month --product-data[name]="Memory Engine Pro"
//
// Optional env vars (used as URL fallbacks):
//   NEXT_PUBLIC_APP_URL    — e.g. https://memory-engine.example.com

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

interface CheckoutBody {
  userId: string
  successUrl?: string
  cancelUrl?: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Guard: Stripe key must be configured
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: 'Stripe is not configured — set STRIPE_SECRET_KEY in environment variables' },
      { status: 500 }
    )
  }

  // Guard: Price ID must be configured
  if (!process.env.STRIPE_PRO_PRICE_ID) {
    return NextResponse.json(
      { error: 'Pro plan price not configured — set STRIPE_PRO_PRICE_ID in environment variables' },
      { status: 500 }
    )
  }

  // Lazily instantiate Stripe after guards so a missing key returns the
  // intended error message rather than a raw SDK TypeError at module load time.
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-01-27.acacia' })

  let body: CheckoutBody
  try {
    body = (await req.json()) as CheckoutBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { userId, successUrl, cancelUrl } = body

  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const resolvedSuccessUrl =
    successUrl ?? `${appUrl}/?checkout=success`

  const resolvedCancelUrl =
    cancelUrl ?? `${appUrl}/upgrade?checkout=cancelled`

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: process.env.STRIPE_PRO_PRICE_ID,
          quantity: 1,
        },
      ],
      metadata: {
        userId: userId.trim(),
      },
      success_url: resolvedSuccessUrl,
      cancel_url: resolvedCancelUrl,
    })

    if (!session.url) {
      return NextResponse.json(
        { error: 'Stripe did not return a checkout URL' },
        { status: 500 }
      )
    }

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe checkout session creation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
