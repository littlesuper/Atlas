import { describe, it, expect } from 'vitest';
import { formatModelRevision } from './ProductsTab';

describe('formatModelRevision', () => {
  it('returns dash when both empty', () => {
    expect(formatModelRevision()).toBe('-');
  });

  it('returns model only', () => {
    expect(formatModelRevision('ABC')).toBe('ABC');
  });

  it('returns model and revision', () => {
    expect(formatModelRevision('ABC', 'v2')).toBe('ABC v2');
  });

  it('returns revision only when model missing', () => {
    expect(formatModelRevision(undefined, 'v2')).toBe('v2');
  });

  it('returns dash when model is empty string', () => {
    expect(formatModelRevision('', '')).toBe('-');
  });

  it('returns model only when revision is empty string', () => {
    expect(formatModelRevision('ABC', '')).toBe('ABC');
  });

  it('handles whitespace model', () => {
    expect(formatModelRevision('  X  ', 'v1')).toBe('  X   v1');
  });

  it('handles undefined model with empty revision', () => {
    expect(formatModelRevision(undefined, '')).toBe('-');
  });

  it('preserves numeric string values', () => {
    expect(formatModelRevision('0', '1')).toBe('0 1');
  });

  it('returns whitespace-only model as truthy', () => {
    expect(formatModelRevision(' ')).toBe(' ');
  });

  it('handles both undefined args explicitly', () => {
    expect(formatModelRevision(undefined, undefined)).toBe('-');
  });

  it('joins model and revision with a single space', () => {
    expect(formatModelRevision('X', 'Y')).toBe('X Y');
    const parts = formatModelRevision('X', 'Y').split(' ');
    expect(parts).toHaveLength(2);
  });

  it('treats string "false" as truthy model', () => {
    expect(formatModelRevision('false', 'v1')).toBe('false v1');
  });

  it('returns revision when model is empty string', () => {
    expect(formatModelRevision('', 'v1')).toBe('v1');
  });

  it('returns dash when both arguments are null', () => {
    expect(formatModelRevision(null as unknown as undefined, null as unknown as undefined)).toBe('-');
  });

  it('handles special characters in model and revision', () => {
    expect(formatModelRevision('A/B<C>', '"v1&2"')).toBe('A/B<C> "v1&2"');
  });

  it('handles unicode model and revision', () => {
    expect(formatModelRevision('型号α', '版本β')).toBe('型号α 版本β');
  });

  it('returns dash when model is numeric 0', () => {
    expect(formatModelRevision(0 as unknown as undefined)).toBe('-');
  });

  it('returns dash when model is empty string', () => {
    expect(formatModelRevision('')).toBe('-');
  });

  it('handles whitespace-only revision string', () => {
    expect(formatModelRevision(undefined, '  ')).toBe('  ');
  });

  it('formatModelRevision returns revision when model is undefined', () => {
    expect(formatModelRevision(undefined, 'rev-1')).toBe('rev-1');
  });

  it('formatModelRevision joins model and revision with space', () => {
    expect(formatModelRevision('model-a', 'rev-1')).toBe('model-a rev-1');
  });

  it('formatModelRevision returns dash for both null args', () => {
    expect(formatModelRevision(null as unknown as undefined, null as unknown as undefined)).toBe('-');
  });

  it('formatModelRevision handles model with no revision args', () => {
    expect(formatModelRevision('Model-X')).toBe('Model-X');
  });

  it('formatModelRevision handles empty revision with model', () => {
    expect(formatModelRevision('Model-X', '')).toBe('Model-X');
  });

  it('formatModelRevision handles very long model string', () => {
    const longModel = 'A'.repeat(500);
    expect(formatModelRevision(longModel, 'v1')).toBe(`${longModel} v1`);
  });

  it('formatModelRevision handles undefined model with defined revision', () => {
    expect(formatModelRevision(undefined, 'v2')).toBe('v2');
  });

  it('formatModelRevision handles both undefined gracefully', () => { const result = formatModelRevision(undefined, undefined); expect(typeof result).toBe('string'); });

  it('formatModelRevision handles defined model with undefined revision', () => { expect(formatModelRevision('TestModel', undefined)).toBe('TestModel'); });

  it('formatModelRevision handles empty string model', () => { expect(formatModelRevision('', 'v1')).toBe('v1'); });

  it('formatModelRevision handles both empty strings', () => { const result = formatModelRevision('', ''); expect(typeof result).toBe('string'); });

  it('formatModelRevision handles null model with valid revision', () => { const result = formatModelRevision(null as any, 'v2'); expect(typeof result).toBe('string'); });

  it('formatModelRevision handles both null inputs', () => { const result = formatModelRevision(null as any, null as any); expect(typeof result).toBe('string'); });

  it('formatModelRevision handles valid inputs', () => { const result = formatModelRevision('ModelA', 'Rev1'); expect(typeof result).toBe('string'); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `Model-${index}`,
    `Rev-${index}`,
  ] as const))('joins generated model and revision %s %s', (model, revision) => {
    expect(formatModelRevision(model, revision)).toBe(`${model} ${revision}`);
  });

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? '' : undefined,
    `Revision-${index}`,
  ] as const))('returns revision when generated model is missing for %s', (model, revision) => {
    expect(formatModelRevision(model, revision)).toBe(revision);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `型号-${index}<tag>`,
    `版本-${index} 🎯`,
  ] as const))('joins generated unicode model and revision %s', (model, revision) => {
    expect(formatModelRevision(model, revision)).toBe(`${model} ${revision}`);
  });

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 3 === 0 ? null : index % 3 === 1 ? 0 : false,
    index % 2 === 0 ? `revision-${index}` : '',
  ] as const))('handles generated falsy model value %#', (model, revision) => {
    const expected = revision || '-';

    expect(formatModelRevision(model as unknown as undefined, revision)).toBe(expected);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? `Model ${index}` : `型号 ${index}`,
    index % 3 === 0 ? undefined : `Rev ${index}`,
  ] as const))(
    'formats generated optional revision for model %s',
    (model, revision) => {
      expect(formatModelRevision(model, revision)).toBe(revision ? `${model} ${revision}` : model);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? ' ' : '',
    index % 3 === 0 ? ' ' : '',
  ] as const))(
    'preserves generated whitespace model or revision %#',
    (model, revision) => {
      const expected = [model, revision].filter(Boolean).join(' ') || '-';

      expect(formatModelRevision(model, revision)).toBe(expected);
    },
  );
});
