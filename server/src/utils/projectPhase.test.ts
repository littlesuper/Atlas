import { describe, it, expect } from 'vitest';
import { getCurrentPhase } from './projectPhase';

describe('getCurrentPhase', () => {
  it('returns null for empty activities', () => {
    expect(getCurrentPhase([])).toBeNull();
  });

  it('returns null when no activities have a phase', () => {
    expect(getCurrentPhase([
      { phase: null, status: 'IN_PROGRESS' },
    ])).toBeNull();
  });

  it('returns the phase with IN_PROGRESS activities', () => {
    expect(getCurrentPhase([
      { phase: 'EVT', status: 'COMPLETED' },
      { phase: 'DVT', status: 'IN_PROGRESS' },
    ])).toBe('DVT');
  });

  it('prefers the most advanced IN_PROGRESS phase', () => {
    expect(getCurrentPhase([
      { phase: 'EVT', status: 'IN_PROGRESS' },
      { phase: 'DVT', status: 'IN_PROGRESS' },
      { phase: 'PVT', status: 'NOT_STARTED' },
    ])).toBe('DVT');
  });

  it('falls back to earliest NOT_STARTED phase when none in progress', () => {
    expect(getCurrentPhase([
      { phase: 'EVT', status: 'COMPLETED' },
      { phase: 'DVT', status: 'NOT_STARTED' },
      { phase: 'PVT', status: 'NOT_STARTED' },
    ])).toBe('DVT');
  });

  it('falls back to earliest DELAYED phase when none in progress or not started', () => {
    expect(getCurrentPhase([
      { phase: 'EVT', status: 'COMPLETED' },
      { phase: 'DVT', status: 'COMPLETED' },
      { phase: 'PVT', status: 'DELAYED' },
    ])).toBe('PVT');
  });

  it('returns the most advanced phase when all completed', () => {
    expect(getCurrentPhase([
      { phase: 'EVT', status: 'COMPLETED' },
      { phase: 'DVT', status: 'COMPLETED' },
    ])).toBe('DVT');
  });

  it('returns MP when all phases completed', () => {
    expect(getCurrentPhase([
      { phase: 'EVT', status: 'COMPLETED' },
      { phase: 'DVT', status: 'COMPLETED' },
      { phase: 'PVT', status: 'COMPLETED' },
      { phase: 'MP', status: 'COMPLETED' },
    ])).toBe('MP');
  });

  // Key test: project with both EVT and DVT activities, EVT in progress
  // When filtering by DVT, this project should NOT appear because currentPhase is EVT
  it('returns EVT when EVT is in progress even if DVT activities exist', () => {
    const activities = [
      { phase: 'EVT', status: 'IN_PROGRESS' },
      { phase: 'EVT', status: 'NOT_STARTED' },
      { phase: 'DVT', status: 'NOT_STARTED' },
    ];
    // currentPhase should be EVT, not DVT
    expect(getCurrentPhase(activities)).toBe('EVT');
  });

  // Project with EVT completed and DVT in progress
  it('returns DVT when EVT is done and DVT is in progress', () => {
    const activities = [
      { phase: 'EVT', status: 'COMPLETED' },
      { phase: 'DVT', status: 'IN_PROGRESS' },
      { phase: 'PVT', status: 'NOT_STARTED' },
    ];
    expect(getCurrentPhase(activities)).toBe('DVT');
  });
});
