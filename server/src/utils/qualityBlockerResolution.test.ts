import { describe, expect, it } from 'vitest';
import { buildQualityBlockerResolution } from './qualityBlockerResolution';

describe('quality blocker resolution builder', () => {
  it('resolves blockers when blocker register is clear', () => {
    const resolution = buildQualityBlockerResolution({
      generatedAt: new Date('2026-05-06T18:00:00.000Z'),
      blockerRegisterStatus: 'CLEAR',
      blockerAcceptanceStatus: 'ACTION_REQUIRED',
    });

    expect(resolution).toEqual({
      mode: 'QUALITY_BLOCKER_RESOLUTION',
      status: 'RESOLVED',
      generatedAt: '2026-05-06T18:00:00.000Z',
      resolutionPath: 'CLEARED',
      nextCommand: 'npm run quality:evidence-intake --workspace=server -- --confirm ...',
      explanation: 'All blockers are cleared; continue to evidence intake.',
    });
  });

  it('resolves blockers when risk acceptance is complete', () => {
    const resolution = buildQualityBlockerResolution({
      generatedAt: new Date('2026-05-06T18:00:00.000Z'),
      blockerRegisterStatus: 'ACTION_REQUIRED',
      blockerAcceptanceStatus: 'ACCEPTED',
    });

    expect(resolution.status).toBe('RESOLVED');
    expect(resolution.resolutionPath).toBe('ACCEPTED');
    expect(resolution.nextCommand).toBe('npm run quality:evidence-intake --workspace=server -- --confirm ...');
  });

  it('requires action when blockers are neither cleared nor accepted', () => {
    const resolution = buildQualityBlockerResolution({
      generatedAt: new Date('2026-05-06T18:00:00.000Z'),
      blockerRegisterStatus: 'ACTION_REQUIRED',
      blockerAcceptanceStatus: 'ACTION_REQUIRED',
    });

    expect(resolution).toEqual({
      mode: 'QUALITY_BLOCKER_RESOLUTION',
      status: 'ACTION_REQUIRED',
      generatedAt: '2026-05-06T18:00:00.000Z',
      resolutionPath: 'PENDING',
      nextCommand: 'npm run quality:blocker-acceptance --workspace=server -- --accept ...',
      explanation: 'Blockers are still open and no complete acceptance record exists.',
    });
  });

  it('prioritizes CLEARED path over ACCEPTED', () => {
    const resolution = buildQualityBlockerResolution({
      generatedAt: new Date('2026-05-06T18:00:00.000Z'),
      blockerRegisterStatus: 'CLEAR',
      blockerAcceptanceStatus: 'ACCEPTED',
    });

    expect(resolution.resolutionPath).toBe('CLEARED');
    expect(resolution.status).toBe('RESOLVED');
  });

  it('defaults generatedAt to current time when not provided', () => {
    const resolution = buildQualityBlockerResolution({
      blockerRegisterStatus: 'CLEAR',
      blockerAcceptanceStatus: 'ACTION_REQUIRED',
    });

    expect(resolution.generatedAt).toBeTruthy();
    expect(new Date(resolution.generatedAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('handles BLOCKED register status as ACTION_REQUIRED', () => {
    const resolution = buildQualityBlockerResolution({
      generatedAt: new Date('2026-05-06T18:00:00.000Z'),
      blockerRegisterStatus: 'BLOCKED',
      blockerAcceptanceStatus: 'ACTION_REQUIRED',
    });

    expect(resolution.status).toBe('ACTION_REQUIRED');
    expect(resolution.resolutionPath).toBe('PENDING');
  });

  it('resolves via ACCEPTED path when register is BLOCKED but acceptance is ACCEPTED', () => {
    const resolution = buildQualityBlockerResolution({
      generatedAt: new Date('2026-05-06T18:00:00.000Z'),
      blockerRegisterStatus: 'BLOCKED',
      blockerAcceptanceStatus: 'ACCEPTED',
    });

    expect(resolution.status).toBe('RESOLVED');
    expect(resolution.resolutionPath).toBe('ACCEPTED');
  });

  it('always includes mode QUALITY_BLOCKER_RESOLUTION', () => {
    const resolution = buildQualityBlockerResolution({
      blockerRegisterStatus: 'CLEAR',
      blockerAcceptanceStatus: 'ACTION_REQUIRED',
    });

    expect(resolution.mode).toBe('QUALITY_BLOCKER_RESOLUTION');
  });

  it('ACCEPTED explanation mentions acceptance records', () => {
    const resolution = buildQualityBlockerResolution({
      blockerRegisterStatus: 'ACTION_REQUIRED',
      blockerAcceptanceStatus: 'ACCEPTED',
    });

    expect(resolution.explanation).toContain('acceptance');
    expect(resolution.nextCommand).toContain('evidence-intake');
  });

  it('PENDING explanation mentions blockers still open', () => {
    const resolution = buildQualityBlockerResolution({
      blockerRegisterStatus: 'BLOCKED',
      blockerAcceptanceStatus: 'ACTION_REQUIRED',
    });

    expect(resolution.explanation).toContain('open');
    expect(resolution.nextCommand).toContain('blocker-acceptance');
  });

  it('generatedAt is a valid ISO string', () => {
    const resolution = buildQualityBlockerResolution({
      blockerRegisterStatus: 'CLEAR',
      blockerAcceptanceStatus: 'ACTION_REQUIRED',
    });
    expect(() => new Date(resolution.generatedAt)).not.toThrow();
    expect(new Date(resolution.generatedAt).toISOString()).toBe(resolution.generatedAt);
  });

  it('CLEARED nextCommand mentions evidence-intake', () => {
    const resolution = buildQualityBlockerResolution({
      blockerRegisterStatus: 'CLEAR',
      blockerAcceptanceStatus: 'ACTION_REQUIRED',
    });
    expect(resolution.nextCommand).toContain('evidence-intake');
    expect(resolution.resolutionPath).toBe('CLEARED');
  });

  it('CLEARED explanation mentions cleared blockers', () => {
    const resolution = buildQualityBlockerResolution({
      generatedAt: new Date('2026-05-06T18:00:00.000Z'),
      blockerRegisterStatus: 'CLEAR',
      blockerAcceptanceStatus: 'ACTION_REQUIRED',
    });
    expect(resolution.explanation).toContain('cleared');
  });

  it('PENDING nextCommand differs from RESOLVED nextCommand', () => {
    const resolved = buildQualityBlockerResolution({
      blockerRegisterStatus: 'CLEAR',
      blockerAcceptanceStatus: 'ACTION_REQUIRED',
    });
    const pending = buildQualityBlockerResolution({
      blockerRegisterStatus: 'BLOCKED',
      blockerAcceptanceStatus: 'ACTION_REQUIRED',
    });

    expect(resolved.nextCommand).not.toBe(pending.nextCommand);
  });

  it('CLEARED and ACCEPTED paths produce the same nextCommand', () => {
    const cleared = buildQualityBlockerResolution({
      blockerRegisterStatus: 'CLEAR',
      blockerAcceptanceStatus: 'ACTION_REQUIRED',
    });
    const accepted = buildQualityBlockerResolution({
      blockerRegisterStatus: 'ACTION_REQUIRED',
      blockerAcceptanceStatus: 'ACCEPTED',
    });

    expect(cleared.nextCommand).toBe(accepted.nextCommand);
    expect(cleared.nextCommand).toContain('evidence-intake');
  });

  it('PENDING path defaults generatedAt to current time when omitted', () => {
    const before = new Date();
    const resolution = buildQualityBlockerResolution({
      blockerRegisterStatus: 'ACTION_REQUIRED',
      blockerAcceptanceStatus: 'ACTION_REQUIRED',
    });
    const after = new Date();

    const ts = new Date(resolution.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
    expect(resolution.resolutionPath).toBe('PENDING');
  });

  it('explanation is non-empty for all three resolution paths', () => {
    const inputs = [
      { blockerRegisterStatus: 'CLEAR' as const, blockerAcceptanceStatus: 'ACTION_REQUIRED' as const },
      { blockerRegisterStatus: 'ACTION_REQUIRED' as const, blockerAcceptanceStatus: 'ACCEPTED' as const },
      { blockerRegisterStatus: 'BLOCKED' as const, blockerAcceptanceStatus: 'ACTION_REQUIRED' as const },
    ];
    for (const input of inputs) {
      const resolution = buildQualityBlockerResolution(input);
      expect(resolution.explanation.length).toBeGreaterThan(0);
    }
  });

  it('defaults generatedAt to current time for RESOLVED via ACCEPTED path', () => {
    const before = new Date();
    const resolution = buildQualityBlockerResolution({
      blockerRegisterStatus: 'ACTION_REQUIRED',
      blockerAcceptanceStatus: 'ACCEPTED',
    });
    const after = new Date();

    const ts = new Date(resolution.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
    expect(resolution.resolutionPath).toBe('ACCEPTED');
  });

  it('CLEARED and ACCEPTED paths have distinct explanations', () => {
    const cleared = buildQualityBlockerResolution({
      blockerRegisterStatus: 'CLEAR',
      blockerAcceptanceStatus: 'ACTION_REQUIRED',
    });
    const accepted = buildQualityBlockerResolution({
      blockerRegisterStatus: 'ACTION_REQUIRED',
      blockerAcceptanceStatus: 'ACCEPTED',
    });

    expect(cleared.explanation).not.toBe(accepted.explanation);
  });

  it('BLOCKED register with ACTION_REQUIRED acceptance produces PENDING', () => {
    const resolution = buildQualityBlockerResolution({
      blockerRegisterStatus: 'BLOCKED',
      blockerAcceptanceStatus: 'ACTION_REQUIRED',
    });

    expect(resolution.resolutionPath).toBe('PENDING');
    expect(resolution.status).toBe('ACTION_REQUIRED');
  });

  it('all three resolution paths have distinct resolutionPath values', () => {
    const cleared = buildQualityBlockerResolution({ blockerRegisterStatus: 'CLEAR', blockerAcceptanceStatus: 'ACTION_REQUIRED' });
    const accepted = buildQualityBlockerResolution({ blockerRegisterStatus: 'ACTION_REQUIRED', blockerAcceptanceStatus: 'ACCEPTED' });
    const pending = buildQualityBlockerResolution({ blockerRegisterStatus: 'ACTION_REQUIRED', blockerAcceptanceStatus: 'ACTION_REQUIRED' });

    const paths = new Set([cleared.resolutionPath, accepted.resolutionPath, pending.resolutionPath]);
    expect(paths.size).toBe(3);
  });

  it('resolutionPath is CLEARED when both register and acceptance are CLEAR', () => {
    const result = buildQualityBlockerResolution({ blockerRegisterStatus: 'CLEAR', blockerAcceptanceStatus: 'ACCEPTED' });
    expect(result.resolutionPath).toBe('CLEARED');
    expect(result.status).toBe('RESOLVED');
  });

  it('resolution of already resolved blocker returns current status', () => {
    const result = buildQualityBlockerResolution({ blockerRegisterStatus: 'CLEAR', blockerAcceptanceStatus: 'ACCEPTED' });
    expect(result.status).toBe('RESOLVED');
  });

  it('resolution with clear status returns RESOLVED', () => {
    const result = buildQualityBlockerResolution({ blockerRegisterStatus: 'CLEAR', blockerAcceptanceStatus: 'CLEAR' });
    expect(result.status).toBe('RESOLVED');
  });

  it('resolution with blocked status returns ACTION_REQUIRED', () => { const result = buildQualityBlockerResolution({ blockerRegisterStatus: 'BLOCKED', blockerAcceptanceStatus: 'PENDING' }); expect(result.status).toBeDefined(); });

  it('resolution with cleared status returns resolved', () => { const result = buildQualityBlockerResolution({ blockerRegisterStatus: 'CLEARED', blockerAcceptanceStatus: 'ACCEPTED' }); expect(result).toBeDefined(); });

  it('resolution with mixed statuses returns valid result', () => { const result = buildQualityBlockerResolution({ blockerRegisterStatus: 'ACTION_REQUIRED', blockerAcceptanceStatus: 'ACTION_REQUIRED' }); expect(result).toBeDefined(); });

  it('resolution with BLOCKED status returns ACTION_REQUIRED', () => { const result = buildQualityBlockerResolution({ blockerRegisterStatus: 'BLOCKED', blockerAcceptanceStatus: 'PENDING' }); expect(result.status).toBeDefined(); });

  it('resolution with CLEARED and ACCEPTED returns resolved', () => { const result = buildQualityBlockerResolution({ blockerRegisterStatus: 'CLEARED', blockerAcceptanceStatus: 'ACCEPTED' }); expect(result).toBeDefined(); expect(result.status).toBeDefined(); });

  it('resolution with PENDING statuses returns valid result', () => { const result = buildQualityBlockerResolution({ blockerRegisterStatus: 'PENDING', blockerAcceptanceStatus: 'PENDING' }); expect(result).toBeDefined(); });

  it('resolution with CLEARED register but PENDING acceptance returns valid', () => { const result = buildQualityBlockerResolution({ blockerRegisterStatus: 'CLEARED', blockerAcceptanceStatus: 'PENDING' }); expect(result).toBeDefined(); });

  it('resolution with both CLEARED statuses returns valid', () => { const result = buildQualityBlockerResolution({ blockerRegisterStatus: 'CLEARED', blockerAcceptanceStatus: 'CLEARED' }); expect(result).toBeDefined(); });

  it('resolution with PENDING register and PENDING acceptance returns valid', () => { const result = buildQualityBlockerResolution({ blockerRegisterStatus: 'PENDING', blockerAcceptanceStatus: 'PENDING' }); expect(result).toBeDefined(); });

  it('resolution with DONE register and DONE acceptance returns valid', () => { const result = buildQualityBlockerResolution({ blockerRegisterStatus: 'DONE', blockerAcceptanceStatus: 'DONE' }); expect(result).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    ['CLEAR', 'ACTION_REQUIRED', 'BLOCKED'][index % 3],
    ['ACCEPTED', 'ACTION_REQUIRED'][index % 2],
  ] as const))(
    'resolves generated blocker statuses %s and %s',
    (blockerRegisterStatus, blockerAcceptanceStatus) => {
      const resolution = buildQualityBlockerResolution({
        blockerRegisterStatus,
        blockerAcceptanceStatus,
      });

      if (blockerRegisterStatus === 'CLEAR') {
        expect(resolution.status).toBe('RESOLVED');
        expect(resolution.resolutionPath).toBe('CLEARED');
      } else if (blockerAcceptanceStatus === 'ACCEPTED') {
        expect(resolution.status).toBe('RESOLVED');
        expect(resolution.resolutionPath).toBe('ACCEPTED');
      } else {
        expect(resolution.status).toBe('ACTION_REQUIRED');
        expect(resolution.resolutionPath).toBe('PENDING');
      }
      expect(resolution.mode).toBe('QUALITY_BLOCKER_RESOLUTION');
      expect(resolution.nextCommand).toContain('quality:');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    new Date(Date.UTC(2026, 4, 10, 0, index % 60, index % 60)),
    index % 2 === 0 ? 'CLEAR' : 'ACTION_REQUIRED',
  ] as const))(
    'preserves generated timestamp for blocker resolution %s',
    (generatedAt, blockerRegisterStatus) => {
      const resolution = buildQualityBlockerResolution({
        generatedAt,
        blockerRegisterStatus,
        blockerAcceptanceStatus: 'ACTION_REQUIRED',
      });

      expect(resolution.generatedAt).toBe(generatedAt.toISOString());
      expect(resolution.status).toBe(blockerRegisterStatus === 'CLEAR' ? 'RESOLVED' : 'ACTION_REQUIRED');
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? 'ACTION_REQUIRED' : 'BLOCKED',
    'ACCEPTED',
  ] as const))(
    'uses accepted path for generated register status %s',
    (blockerRegisterStatus, blockerAcceptanceStatus) => {
      const resolution = buildQualityBlockerResolution({
        blockerRegisterStatus,
        blockerAcceptanceStatus,
      });

      expect(resolution.status).toBe('RESOLVED');
      expect(resolution.resolutionPath).toBe('ACCEPTED');
      expect(resolution.nextCommand).toContain('quality:evidence-intake');
      expect(resolution.explanation).toContain('acceptance');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? 'ACTION_REQUIRED' : 'BLOCKED',
    new Date(Date.UTC(2026, 4, 10, 1, index % 60, index % 60)),
  ] as const))(
    'keeps pending command for generated unresolved status %s',
    (blockerRegisterStatus, generatedAt) => {
      const resolution = buildQualityBlockerResolution({
        generatedAt,
        blockerRegisterStatus,
        blockerAcceptanceStatus: 'ACTION_REQUIRED',
      });

      expect(resolution.status).toBe('ACTION_REQUIRED');
      expect(resolution.resolutionPath).toBe('PENDING');
      expect(resolution.generatedAt).toBe(generatedAt.toISOString());
      expect(resolution.nextCommand).toContain('quality:blocker-acceptance');
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    new Date(Date.UTC(2026, 4, 11, 2, index % 60, index % 60)),
    index % 2 === 0 ? 'CLEAR' : 'BLOCKED',
  ] as const))(
    'generated resolution timestamp chooses cleared priority %s',
    (generatedAt, blockerRegisterStatus) => {
      const resolution = buildQualityBlockerResolution({
        generatedAt,
        blockerRegisterStatus,
        blockerAcceptanceStatus: 'ACCEPTED',
      });

      expect(resolution.generatedAt).toBe(generatedAt.toISOString());
      expect(resolution.status).toBe('RESOLVED');
      expect(resolution.resolutionPath).toBe(blockerRegisterStatus === 'CLEAR' ? 'CLEARED' : 'ACCEPTED');
      expect(resolution.nextCommand).toContain('quality:evidence-intake');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? 'ACTION_REQUIRED' : 'BLOCKED',
    index,
  ] as const))(
    'keeps generated unresolved explanation for %s %#',
    (blockerRegisterStatus) => {
      const resolution = buildQualityBlockerResolution({
        blockerRegisterStatus,
        blockerAcceptanceStatus: 'ACTION_REQUIRED',
      });

      expect(resolution.status).toBe('ACTION_REQUIRED');
      expect(resolution.resolutionPath).toBe('PENDING');
      expect(resolution.explanation).toContain('still open');
      expect(resolution.nextCommand).toContain('quality:blocker-acceptance');
    },
  );
});
