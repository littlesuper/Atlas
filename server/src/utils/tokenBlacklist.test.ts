import { describe, it, expect, vi, beforeEach } from 'vitest';
import { blacklistToken, isTokenBlacklisted } from './tokenBlacklist';

describe('tokenBlacklist', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('blacklists a token and reports it as blacklisted', () => {
    blacklistToken('token-1', 60000);

    expect(isTokenBlacklisted('token-1')).toBe(true);
  });

  it('reports unknown tokens as not blacklisted', () => {
    expect(isTokenBlacklisted('unknown')).toBe(false);
  });

  it('removes expired tokens on check', () => {
    vi.useFakeTimers();
    blacklistToken('token-expired', 1000);

    vi.advanceTimersByTime(2000);

    expect(isTokenBlacklisted('token-expired')).toBe(false);
    vi.useRealTimers();
  });

  it('uses default 8h TTL when expiresInMs not provided', () => {
    blacklistToken('token-default');

    expect(isTokenBlacklisted('token-default')).toBe(true);
  });

  it('handles multiple tokens independently', () => {
    blacklistToken('token-a', 60000);
    blacklistToken('token-b', 60000);

    expect(isTokenBlacklisted('token-a')).toBe(true);
    expect(isTokenBlacklisted('token-b')).toBe(true);
    expect(isTokenBlacklisted('token-c')).toBe(false);
  });

  it('allows re-blacklisting an already expired token', () => {
    vi.useFakeTimers();
    blacklistToken('token-re', 1000);
    vi.advanceTimersByTime(2000);
    expect(isTokenBlacklisted('token-re')).toBe(false);

    blacklistToken('token-re', 5000);
    expect(isTokenBlacklisted('token-re')).toBe(true);
    vi.useRealTimers();
  });

  it('overwrites previous blacklist entry on re-add', () => {
    blacklistToken('token-overwrite', 1000);
    blacklistToken('token-overwrite', 60000);

    expect(isTokenBlacklisted('token-overwrite')).toBe(true);
  });

  it('handles blacklist check for empty string token', () => {
    expect(isTokenBlacklisted('')).toBe(false);
  });

  it('default TTL is 8 hours', () => {
    vi.useFakeTimers();
    blacklistToken('token-8h');

    expect(isTokenBlacklisted('token-8h')).toBe(true);

    vi.advanceTimersByTime(7 * 60 * 60 * 1000);
    expect(isTokenBlacklisted('token-8h')).toBe(true);

    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    expect(isTokenBlacklisted('token-8h')).toBe(false);

    vi.useRealTimers();
  });

  it('clearing expired tokens does not affect non-expired ones', () => {
    vi.useFakeTimers();
    blacklistToken('short', 1000);
    blacklistToken('long', 60000);

    vi.advanceTimersByTime(2000);

    expect(isTokenBlacklisted('short')).toBe(false);
    expect(isTokenBlacklisted('long')).toBe(true);
    vi.useRealTimers();
  });

  it('token with TTL=0 is immediately expired', () => {
    blacklistToken('zero-ttl', 0);
    expect(isTokenBlacklisted('zero-ttl')).toBe(false);
  });

  it('different tokens do not interfere with each other', () => {
    vi.useFakeTimers();
    blacklistToken('a', 5000);
    blacklistToken('b', 10000);

    vi.advanceTimersByTime(6000);
    expect(isTokenBlacklisted('a')).toBe(false);
    expect(isTokenBlacklisted('b')).toBe(true);
    vi.useRealTimers();
  });

  it('isTokenBlacklisted returns false for non-blacklisted token', async () => {
    const { blacklistToken, isTokenBlacklisted } = await import('./tokenBlacklist');
    blacklistToken('jti-1', 3600);
    expect(isTokenBlacklisted('jti-other')).toBe(false);
  });

  it('token with negative TTL is immediately expired', () => {
    blacklistToken('neg-ttl', -1000);
    expect(isTokenBlacklisted('neg-ttl')).toBe(false);
  });

  it('checking same expired token twice returns false both times', () => {
    vi.useFakeTimers();
    blacklistToken('double-check', 1000);

    vi.advanceTimersByTime(2000);

    expect(isTokenBlacklisted('double-check')).toBe(false);
    expect(isTokenBlacklisted('double-check')).toBe(false);
    vi.useRealTimers();
  });

  it('prefix substring of blacklisted token is not blacklisted', () => {
    blacklistToken('token-full-value', 60000);
    expect(isTokenBlacklisted('token-full')).toBe(false);
    expect(isTokenBlacklisted('token-full-value-extra')).toBe(false);
  });

  it('overwriting with longer TTL keeps token valid past original expiry', () => {
    vi.useFakeTimers();
    blacklistToken('token-extend', 5000);
    blacklistToken('token-extend', 60000);

    vi.advanceTimersByTime(10000);

    expect(isTokenBlacklisted('token-extend')).toBe(true);
    vi.useRealTimers();
  });

  it('handles token with special characters correctly', () => {
    const specialToken = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ';
    blacklistToken(specialToken, 60000);
    expect(isTokenBlacklisted(specialToken)).toBe(true);
    expect(isTokenBlacklisted('eyJhbGciOiJIUzI1NiJ9')).toBe(false);
  });

  it('very large TTL keeps token valid', () => {
    blacklistToken('long-lived', 365 * 24 * 60 * 60 * 1000);
    expect(isTokenBlacklisted('long-lived')).toBe(true);
  });

  it('non-blacklisted token returns false', () => {
    expect(isTokenBlacklisted('never-blacklisted')).toBe(false);
  });

  it('blacklisting same token twice still reports blacklisted', () => {
    blacklistToken('dup-token', 60000);
    blacklistToken('dup-token', 60000);
    expect(isTokenBlacklisted('dup-token')).toBe(true);
  });

  it('blacklisted token is reported as blacklisted', () => {
    blacklistToken('test-expire', 1);
    expect(isTokenBlacklisted('test-expire')).toBe(true);
  });

  it('blacklistToken adds token and isTokenBlacklisted confirms it', () => {
    vi.useFakeTimers();
    blacklistToken('new-token', 60);
    expect(isTokenBlacklisted('new-token')).toBe(true);
    vi.useRealTimers();
  });

  it('isTokenBlacklisted returns false for unknown token', () => {
    expect(isTokenBlacklisted('nonexistent-token-' + Date.now())).toBe(false);
  });

  it('blacklisted token is detected by isTokenBlacklisted', () => { const token = 'test-token-' + Date.now(); blacklistToken(token, 60000); expect(isTokenBlacklisted(token)).toBe(true); });

  it('non-blacklisted token returns false', () => { const token = 'non-blacklisted-' + Date.now(); expect(isTokenBlacklisted(token)).toBe(false); });

  it('blacklisted token expires after TTL', () => { vi.useFakeTimers(); const token = 'expiring-token'; blacklistToken(token, 1000); expect(isTokenBlacklisted(token)).toBe(true); vi.advanceTimersByTime(1001); expect(isTokenBlacklisted(token)).toBe(false); vi.useRealTimers(); });

  it('blacklisting same token twice does not throw', () => { const token = 'dup-token-' + Date.now(); blacklistToken(token, 60000); expect(() => blacklistToken(token, 60000)).not.toThrow(); });

  it('isTokenBlacklisted returns false for empty string token', () => { expect(isTokenBlacklisted('')).toBe(false); });

  it('blacklisted token with zero TTL expires immediately', () => { vi.useFakeTimers(); const token = 'zero-ttl'; blacklistToken(token, 0); vi.advanceTimersByTime(1); expect(isTokenBlacklisted(token)).toBe(false); vi.useRealTimers(); });

  it('blacklisting multiple tokens works independently', () => { const token1 = 'multi-1-' + Date.now(); const token2 = 'multi-2-' + Date.now(); blacklistToken(token1, 60000); blacklistToken(token2, 60000); expect(isTokenBlacklisted(token1)).toBe(true); expect(isTokenBlacklisted(token2)).toBe(true); });

  it('isTokenBlacklisted returns false for never-blacklisted token', () => { expect(isTokenBlacklisted('never-seen-token')).toBe(false); });

  it('blacklisted token becomes unblacklisted after TTL expires', () => { vi.useFakeTimers(); const token = 'ttl-token'; blacklistToken(token, 1000); expect(isTokenBlacklisted(token)).toBe(true); vi.advanceTimersByTime(1001); expect(isTokenBlacklisted(token)).toBe(false); vi.useRealTimers(); });

  it('isTokenBlacklisted returns false for never-blacklisted token', () => { expect(isTokenBlacklisted('never-seen-token')).toBe(false); });

  it.each(Array.from({ length: 80 }, (_, index) => [`batch106-expiring-${index}`, 1000 + index] as const))(
    'blacklisted generated token %s expires after ttl %s',
    (token, ttl) => {
      vi.useFakeTimers();
      blacklistToken(token, ttl);

      vi.advanceTimersByTime(ttl - 1);
      expect(isTokenBlacklisted(token)).toBe(true);

      vi.advanceTimersByTime(1);
      expect(isTokenBlacklisted(token)).toBe(false);
      vi.useRealTimers();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch106-token-${index}.segment_${index}!${index}`,
    `batch106-token-${index}.segment_${index}`,
  ] as const))(
    'blacklisted generated token %s does not match prefix %s',
    (token, prefix) => {
      blacklistToken(token, 60000);

      expect(isTokenBlacklisted(token)).toBe(true);
      expect(isTokenBlacklisted(prefix)).toBe(false);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch117-overwrite-${index}`,
    1000 + index,
    5000 + index,
  ] as const))(
    'generated token %s uses latest longer ttl',
    (token, shortTtl, longTtl) => {
      vi.useFakeTimers();
      blacklistToken(token, shortTtl);
      blacklistToken(token, longTtl);

      vi.advanceTimersByTime(shortTtl + 1);
      expect(isTokenBlacklisted(token)).toBe(true);

      vi.advanceTimersByTime(longTtl - shortTtl);
      expect(isTokenBlacklisted(token)).toBe(false);
      vi.useRealTimers();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch117-token-${index}-中文-<${index}>`,
    `batch117-token-${index}-中文`,
  ] as const))(
    'generated unicode token %s remains exact-match only',
    (token, partial) => {
      blacklistToken(token, 60000);

      expect(isTokenBlacklisted(token)).toBe(true);
      expect(isTokenBlacklisted(partial)).toBe(false);
    },
  );
});

describe('tokenBlacklist batch 173 matrices', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch173-zero-ttl-${index}`,
    index,
  ] as const))(
    'generated token %s with non-positive ttl is never active',
    (token, offset) => {
      vi.useFakeTimers();
      blacklistToken(token, -offset);

      expect(isTokenBlacklisted(token)).toBe(false);
      vi.useRealTimers();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch173-readd-${index}`,
    1000 + index,
    3000 + index,
  ] as const))(
    'generated token %s can be re-added after expiry',
    (token, firstTtl, secondTtl) => {
      vi.useFakeTimers();
      blacklistToken(token, firstTtl);
      vi.advanceTimersByTime(firstTtl + 1);
      expect(isTokenBlacklisted(token)).toBe(false);

      blacklistToken(token, secondTtl);
      expect(isTokenBlacklisted(token)).toBe(true);
      vi.advanceTimersByTime(secondTtl);
      expect(isTokenBlacklisted(token)).toBe(false);
      vi.useRealTimers();
    },
  );
});

describe('tokenBlacklist batch 134 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch134-expire-${index}`,
    2000 + index,
  ] as const))(
    'generated token %s remains valid until exact ttl',
    (token, ttl) => {
      vi.useFakeTimers();
      blacklistToken(token, ttl);

      vi.advanceTimersByTime(ttl - 1);
      expect(isTokenBlacklisted(token)).toBe(true);

      vi.advanceTimersByTime(1);
      expect(isTokenBlacklisted(token)).toBe(false);
      vi.useRealTimers();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch134-token-${index}`,
    `batch134-token-${index}-other`,
  ] as const))(
    'generated tokens stay independent %s/%s',
    (first, second) => {
      blacklistToken(first, 60000);

      expect(isTokenBlacklisted(first)).toBe(true);
      expect(isTokenBlacklisted(second)).toBe(false);
    },
  );
});
