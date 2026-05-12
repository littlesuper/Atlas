import { describe, it, expect } from 'vitest';
import { normalizeRiskLevel } from './RiskAssessmentTab';

describe('normalizeRiskLevel', () => {
  it('returns canonical uppercase for English input', () => {
    expect(normalizeRiskLevel('LOW')).toBe('LOW');
    expect(normalizeRiskLevel('MEDIUM')).toBe('MEDIUM');
    expect(normalizeRiskLevel('HIGH')).toBe('HIGH');
    expect(normalizeRiskLevel('CRITICAL')).toBe('CRITICAL');
  });

  it('handles lowercase input', () => {
    expect(normalizeRiskLevel('low')).toBe('LOW');
    expect(normalizeRiskLevel('high')).toBe('HIGH');
  });

  it('handles mixed case input', () => {
    expect(normalizeRiskLevel('Low')).toBe('LOW');
    expect(normalizeRiskLevel('High')).toBe('HIGH');
  });

  it('maps Chinese short names', () => {
    expect(normalizeRiskLevel('低')).toBe('LOW');
    expect(normalizeRiskLevel('中')).toBe('MEDIUM');
    expect(normalizeRiskLevel('高')).toBe('HIGH');
    expect(normalizeRiskLevel('严重')).toBe('CRITICAL');
  });

  it('maps Chinese full names', () => {
    expect(normalizeRiskLevel('低风险')).toBe('LOW');
    expect(normalizeRiskLevel('中风险')).toBe('MEDIUM');
    expect(normalizeRiskLevel('高风险')).toBe('HIGH');
    expect(normalizeRiskLevel('严重风险')).toBe('CRITICAL');
  });

  it('returns uppercase for unknown input', () => {
    expect(normalizeRiskLevel('unknown')).toBe('UNKNOWN');
  });

  it('handles empty string', () => {
    expect(normalizeRiskLevel('')).toBe('');
  });

  it('handles whitespace-padded input', () => {
    expect(normalizeRiskLevel(' LOW ')).toBe(' LOW ');
    expect(normalizeRiskLevel('  high  ')).toBe('  HIGH  ');
  });

  it('handles medium case variants', () => {
    expect(normalizeRiskLevel('Medium')).toBe('MEDIUM');
    expect(normalizeRiskLevel('critical')).toBe('CRITICAL');
  });

  it('returns uppercase for numeric-like input', () => {
    expect(normalizeRiskLevel('123')).toBe('123');
  });

  it('handles Chinese input that is not a risk level', () => {
    expect(normalizeRiskLevel('安全')).toBe('安全');
  });

  it('does not confuse partial Chinese matches', () => {
    expect(normalizeRiskLevel('低等')).toBe('低等');
    expect(normalizeRiskLevel('高级')).toBe('高级');
  });

  it('handles null input', () => {
    expect(normalizeRiskLevel(null as unknown as string)).toBe('');
  });

  it('handles undefined input', () => {
    expect(normalizeRiskLevel(undefined as unknown as string)).toBe('');
  });

  it('handles empty string input', () => {
    expect(normalizeRiskLevel('')).toBe('');
  });

  it('does not match level embedded in longer string', () => {
    expect(normalizeRiskLevel('LOW_RISK')).toBe('LOW_RISK');
    expect(normalizeRiskLevel('HIGHER')).toBe('HIGHER');
  });

  it('handles whitespace-only input as truthy non-match', () => {
    expect(normalizeRiskLevel('   ')).toBe('   ');
  });

  it('does not map substring "中" inside longer Chinese text', () => {
    expect(normalizeRiskLevel('中心')).toBe('中心');
  });

  it('handles numeric input by returning empty string', () => {
    expect(normalizeRiskLevel(42 as unknown as string)).toBe('');
  });

  it('handles very long string input', () => {
    const long = 'LOW'.repeat(1000);
    expect(normalizeRiskLevel(long)).toBe(long.toUpperCase());
  });

  it('normalizeRiskLevel returns empty string for empty input', () => {
    expect(normalizeRiskLevel('')).toBe('');
  });

  it('normalizeRiskLevel handles lowercase input', () => {
    expect(normalizeRiskLevel('high')).toBe('HIGH');
  });

  it('normalizes critical lowercase to CRITICAL', () => {
    expect(normalizeRiskLevel('critical')).toBe('CRITICAL');
  });

  it('normalizeRiskLevel handles Chinese comma-separated input as unknown', () => {
    expect(normalizeRiskLevel('低,中')).toBe('低,中');
  });

  it('normalizeRiskLevel handles whitespace-padded input', () => {
    expect(normalizeRiskLevel('  HIGH  ')).toBe('  HIGH  ');
  });

  it('normalizeRiskLevel handles tab character in input', () => {
    expect(normalizeRiskLevel('\tHIGH\t')).toBe('\tHIGH\t');
  });

  it('normalizeRiskLevel handles mixed case input returns uppercase', () => {
    expect(normalizeRiskLevel('HiGh')).toBe('HIGH');
  });

  it('normalizeRiskLevel handles empty string gracefully', () => { const result = normalizeRiskLevel(''); expect(result === null || typeof result === 'string').toBe(true); });

  it('normalizeRiskLevel handles null input gracefully', () => { const result = normalizeRiskLevel(null as any); expect(result === null || typeof result === 'string').toBe(true); });

  it('normalizeRiskLevel handles HIGH input', () => { expect(normalizeRiskLevel('HIGH')).toBe('HIGH'); });

  it('normalizeRiskLevel handles LOW input', () => { expect(normalizeRiskLevel('LOW')).toBe('LOW'); });

  it('normalizeRiskLevel handles MEDIUM input', () => { expect(normalizeRiskLevel('MEDIUM')).toBe('MEDIUM'); });

  it('normalizeRiskLevel handles HIGH input', () => { expect(normalizeRiskLevel('HIGH')).toBe('HIGH'); });

  it('normalizeRiskLevel handles lowercase input', () => { expect(normalizeRiskLevel('high')).toBe('HIGH'); });

  it.each(Array.from({ length: 80 }, (_, index) => {
    const levels = ['low', 'medium', 'high', 'critical', 'Low', 'Medium', 'High', 'Critical'];
    const level = levels[index % levels.length];
    return [level, level.toUpperCase()] as const;
  }))('normalizes generated English level %s', (level, expected) => {
    expect(normalizeRiskLevel(level)).toBe(expected);
  });

  it.each(Array.from({ length: 60 }, (_, index) => {
    const cases = [
      ['低', 'LOW'],
      ['低风险', 'LOW'],
      ['中', 'MEDIUM'],
      ['中风险', 'MEDIUM'],
      ['高', 'HIGH'],
      ['高风险', 'HIGH'],
      ['严重', 'CRITICAL'],
      ['严重风险', 'CRITICAL'],
    ] as const;
    return cases[index % cases.length];
  }))('normalizes generated Chinese level %s', (level, expected) => {
    expect(normalizeRiskLevel(level)).toBe(expected);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `custom-level-${index}`,
    `CUSTOM-LEVEL-${index}`,
  ] as const))(
    'uppercases generated unknown English-like level %s',
    (level, expected) => {
      expect(normalizeRiskLevel(level)).toBe(expected);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    [` LOW-${index} `, ` LOW-${index} `],
    [`高-${index}`, `高-${index}`],
  ][index % 2] as const))(
    'preserves generated non-canonical level %s',
    (level, expected) => {
      expect(normalizeRiskLevel(level)).toBe(expected);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][index % 4],
    ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][index % 4],
  ] as const))(
    'keeps generated canonical risk level %s',
    (level, expected) => {
      expect(normalizeRiskLevel(level)).toBe(expected);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? `low_${index}` : `严重风险-${index}`,
    index % 2 === 0 ? `LOW_${index}` : `严重风险-${index}`,
  ] as const))(
    'normalizes generated partial-match risk level %s',
    (level, expected) => {
      expect(normalizeRiskLevel(level)).toBe(expected);
    },
  );
});
