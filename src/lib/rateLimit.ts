// NOTE: This rate limiter is in-memory only. In multi-instance deployments (e.g. Cloud Run
// with concurrency > 1) each instance maintains its own counter, so the effective per-minute
// limit is maxPerMinute × numInstances. For single-instance local use this is correct.
const counters = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const entry = counters.get(key);
  if (!entry || now > entry.resetAt) {
    counters.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= maxPerMinute) return false;
  entry.count++;
  return true;
}
