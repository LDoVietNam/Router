// src/lib/jobs/rtkBudgetJob.ts
// Background job that periodically computes the token‑budget (or any heavy RTK metric)
// and stores it in an in‑memory cache for the middleware to read.

import { computeBudget } from "../services/rtkService.js";

let cachedBudget: number | null = null;
let expiresAt = 0; // timestamp (ms) when cache becomes stale

/**
 * Start the periodic budget calculation job.
 * Runs every `intervalMs` (default 5 minutes).
 */
export function startRtkBudgetJob(intervalMs: number = 5 * 60 * 1000): void {
  // Run immediately, then schedule
  runCalculation();
  setInterval(runCalculation, intervalMs);
}

async function runCalculation() {
  try {
    const budget = await computeBudget();
    cachedBudget = budget;
    expiresAt = Date.now() + 5 * 60 * 1000; // keep fresh for next interval
    // optional: you could log the new budget here with your logger
  } catch (err) {
    // Silently ignore – the middleware will fall back to null
    console.error("RTK budget job failed", err);
  }
}

/** Return the cached budget if still valid, otherwise null. */
export function getCachedBudget(): number | null {
  if (Date.now() < expiresAt) {
    return cachedBudget;
  }
  return null;
}
