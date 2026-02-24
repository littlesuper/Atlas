const PHASE_ORDER = ['EVT', 'DVT', 'PVT', 'MP'];

/**
 * Determine the current phase of a project from its activities.
 *
 * Priority:
 * 1. Most advanced phase with IN_PROGRESS activities
 * 2. Earliest phase with NOT_STARTED or DELAYED activities
 * 3. Most advanced phase overall (all completed)
 */
export function getCurrentPhase(activities: { phase: string | null; status: string }[]): string | null {
  const withPhase = activities.filter((a) => a.phase);
  if (withPhase.length === 0) return null;

  // Prefer the most advanced phase that has IN_PROGRESS activities
  for (let i = PHASE_ORDER.length - 1; i >= 0; i--) {
    if (withPhase.some((a) => a.phase === PHASE_ORDER[i] && a.status === 'IN_PROGRESS')) {
      return PHASE_ORDER[i];
    }
  }

  // Fallback: earliest phase with NOT_STARTED or DELAYED activities
  for (const p of PHASE_ORDER) {
    if (withPhase.some((a) => a.phase === p && (a.status === 'NOT_STARTED' || a.status === 'DELAYED'))) {
      return p;
    }
  }

  // All completed: return the most advanced phase
  for (let i = PHASE_ORDER.length - 1; i >= 0; i--) {
    if (withPhase.some((a) => a.phase === PHASE_ORDER[i])) {
      return PHASE_ORDER[i];
    }
  }

  return null;
}
