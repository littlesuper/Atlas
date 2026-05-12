import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, isEncrypted, maskSecret } from './crypto';

describe('crypto utils', () => {
  it('encrypts and decrypts round-trip', () => {
    const original = 'my-secret-value';
    const encrypted = encrypt(original);

    expect(encrypted).not.toBe(original);
    expect(decrypt(encrypted)).toBe(original);
  });

  it('returns empty string for encrypt/decrypt of empty input', () => {
    expect(encrypt('')).toBe('');
    expect(decrypt('')).toBe('');
  });

  it('detects encrypted values', () => {
    const encrypted = encrypt('test');
    expect(isEncrypted(encrypted)).toBe(true);
  });

  it('detects plaintext as not encrypted', () => {
    expect(isEncrypted('plaintext')).toBe(false);
    expect(isEncrypted('')).toBe(false);
  });

  it('masks secrets showing last 4 chars', () => {
    const encrypted = encrypt('sk-12345678');
    const masked = maskSecret(encrypted);

    expect(masked).toBe('****5678');
  });

  it('masks short secrets fully', () => {
    const encrypted = encrypt('ab');
    const masked = maskSecret(encrypted);

    expect(masked).toBe('****');
  });

  it('returns empty for empty maskSecret input', () => {
    expect(maskSecret('')).toBe('');
  });

  it('returns original on corrupted ciphertext', () => {
    const result = decrypt('not-valid-base64-encrypted-data');
    expect(result).toBe('not-valid-base64-encrypted-data');
  });

  it('encrypts and decrypts unicode characters', () => {
    const original = '密码🔑中文';
    const encrypted = encrypt(original);
    expect(decrypt(encrypted)).toBe(original);
  });

  it('produces different ciphertext each time (random IV)', () => {
    const encrypted1 = encrypt('same-input');
    const encrypted2 = encrypt('same-input');
    expect(encrypted1).not.toBe(encrypted2);
    expect(decrypt(encrypted1)).toBe('same-input');
    expect(decrypt(encrypted2)).toBe('same-input');
  });

  it('isEncrypted returns false for non-base64 strings', () => {
    expect(isEncrypted('not-base64!!!')).toBe(false);
  });

  it('isEncrypted returns false for valid but too-short base64', () => {
    expect(isEncrypted(Buffer.from('short').toString('base64'))).toBe(false);
  });

  it('maskSecret masks plaintext (non-encrypted) input', () => {
    const masked = maskSecret('plaintext-secret');
    expect(masked).toBe('****cret');
  });

  it('maskSecret returns empty for falsy input', () => {
    expect(maskSecret('')).toBe('');
  });

  it('decrypt returns original for base64 with no ciphertext portion', () => {
    const noCiphertext = Buffer.alloc(32).toString('base64');
    expect(decrypt(noCiphertext)).toBe(noCiphertext);
  });

  it('isEncrypted returns true for exactly minimum valid length', () => {
    const iv = Buffer.alloc(16);
    const tag = Buffer.alloc(16);
    const oneByte = Buffer.from('x');
    const combined = Buffer.concat([iv, tag, oneByte]);
    expect(isEncrypted(combined.toString('base64'))).toBe(true);
  });

  it('encrypts and decrypts very long strings', () => {
    const original = 'a'.repeat(10000);
    const encrypted = encrypt(original);
    expect(decrypt(encrypted)).toBe(original);
  });

  it('isEncrypted returns false for valid base64 at exactly 32 bytes', () => {
    const exactly32 = Buffer.alloc(32).toString('base64');
    expect(isEncrypted(exactly32)).toBe(false);
  });

  it('maskSecret masks exactly 4-character string fully', () => {
    const encrypted = encrypt('abcd');
    expect(maskSecret(encrypted)).toBe('****');
  });

  it('maskSecret shows last 4 chars for 5-character secret', () => {
    const encrypted = encrypt('abcde');
    const masked = maskSecret(encrypted);
    expect(masked).toBe('****bcde');
  });

  it('decrypt returns original for valid base64 that is not encrypted', () => {
    const plain = Buffer.from('this is just plain text data').toString('base64');
    expect(decrypt(plain)).toBe(plain);
  });

  it('isEncrypted returns false for non-base64 string with special chars', () => {
    expect(isEncrypted('not!base64@chars')).toBe(false);
  });

  it('identifies empty string as not encrypted', () => {
    expect(isEncrypted('')).toBe(false);
  });

  it('encrypt then decrypt returns original value', () => {
    const original = 'test-secret-value';
    const encrypted = encrypt(original);
    expect(encrypted).not.toBe(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('encrypt and decrypt handle unicode content', () => { const original = '中文测试🎉'; const encrypted = encrypt(original); expect(decrypt(encrypted)).toBe(original); });

  it('encrypt produces different ciphertext for same input', () => { const a = encrypt('test'); const b = encrypt('test'); expect(a).not.toBe(b); });

  it('isEncrypted returns true for encrypted values', () => { const encrypted = encrypt('test'); expect(isEncrypted(encrypted)).toBe(true); });

  it('decrypt returns original string for invalid ciphertext', () => { const bad = 'not-encrypted'; expect(decrypt(bad)).toBe(bad); });

  it('isEncrypted returns false for plain text', () => { expect(isEncrypted('plain-text')).toBe(false); });

  it('encrypt and decrypt handle empty string', () => { const encrypted = encrypt(''); expect(decrypt(encrypted)).toBe(''); });

  it('encrypt and decrypt handle unicode characters', () => { const original = '你好世界🌍'; const encrypted = encrypt(original); expect(decrypt(encrypted)).toBe(original); });

  it('encrypt produces different ciphertext each time', () => { const e1 = encrypt('same'); const e2 = encrypt('same'); expect(e1).not.toBe(e2); });

  it('decrypt handles empty string plaintext', () => { const encrypted = encrypt(''); expect(decrypt(encrypted)).toBe(''); });

  it('encrypt and decrypt roundtrip preserves unicode text', () => { const original = '中文测试 🚀 émojis'; const encrypted = encrypt(original); expect(decrypt(encrypted)).toBe(original); });

  it.each(Array.from({ length: 80 }, (_, index) => `batch107-secret-${index}-中文-${index % 7}`))(
    'encrypt/decrypt preserves generated secret %s',
    (secret) => {
      const encrypted = encrypt(secret);

      expect(encrypted).not.toBe(secret);
      expect(isEncrypted(encrypted)).toBe(true);
      expect(decrypt(encrypted)).toBe(secret);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => `plain-secret-${index}`))(
    'maskSecret masks generated plaintext %s',
    (secret) => {
      const masked = maskSecret(secret);

      expect(masked).toBe(`****${secret.slice(-4)}`);
      expect(masked).not.toContain(secret.slice(0, -4));
    },
  );
});
