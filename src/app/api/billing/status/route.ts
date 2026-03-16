// src/app/api/billing/status/route.ts
// GET /api/billing/status?userId=x
// Returns the user's current plan status.
//
// This is a placeholder implementation.
// Real implementation would query a `me_subscriptions` table in Supabase
// (or a local SQLite billing table) to check whether the user has an active
// Stripe subscription. For now, plan is inferred from MEMORY_ENGINE_MODE:
//   - cloud mode  → pro  (cloud mode requires a paid Supabase setup)
//   - local mode  → free (default SQLite, offline, no billing)

import { NextRequest, NextResponse } from 'next/server'

interface BillingStatus {
  plan: 'pro' | 'free'
  userId: string
  mode: 'cloud' | 'local'
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')

  if (!userId || userId.trim() === '') {
    return NextResponse.json(
      { error: 'userId query parameter is required' },
      { status: 400 }
    )
  }

  const mode = process.env.MEMORY_ENGINE_MODE === 'cloud' ? 'cloud' : 'local'

  // TODO: Replace with real subscription lookup once me_subscriptions table is in place.
  // Example query (Supabase):
  //   const { data } = await supabase
  //     .from('me_subscriptions')
  //     .select('status, stripe_subscription_id')
  //     .eq('user_id', userId)
  //     .eq('status', 'active')
  //     .maybeSingle()
  //   const plan = data ? 'pro' : 'free'

  const plan: 'pro' | 'free' = mode === 'cloud' ? 'pro' : 'free'

  const status: BillingStatus = {
    plan,
    userId: userId.trim(),
    mode,
  }

  return NextResponse.json(status)
}
