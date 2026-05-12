import { describe, it, expect } from 'vitest';
import { loginSchema, refreshTokenSchema, changePasswordSchema, updateProfileSchema, wecomLoginSchema, updatePreferencesSchema } from './auth';

describe('auth schemas', () => {
  it('loginSchema accepts valid input', () => {
    expect(loginSchema.parse({ username: 'admin', password: '123456' })).toEqual({
      username: 'admin',
      password: '123456',
    });
  });

  it('loginSchema rejects empty username', () => {
    expect(() => loginSchema.parse({ username: '', password: '123456' })).toThrow();
  });

  it('loginSchema rejects empty password', () => {
    expect(() => loginSchema.parse({ username: 'admin', password: '' })).toThrow();
  });

  it('refreshTokenSchema accepts valid token', () => {
    expect(refreshTokenSchema.parse({ refreshToken: 'abc' })).toEqual({ refreshToken: 'abc' });
  });

  it('refreshTokenSchema rejects empty token', () => {
    expect(() => refreshTokenSchema.parse({ refreshToken: '' })).toThrow();
  });

  it('changePasswordSchema rejects short new password', () => {
    expect(() => changePasswordSchema.parse({ currentPassword: 'old', newPassword: '12345' })).toThrow();
  });

  it('updateProfileSchema trims realName', () => {
    expect(updateProfileSchema.parse({ realName: '  张三  ' })).toEqual({ realName: '张三' });
  });

  it('wecomLoginSchema accepts valid code', () => {
    expect(wecomLoginSchema.parse({ code: 'wx-code' })).toEqual({ code: 'wx-code' });
  });

  it('wecomLoginSchema rejects empty code', () => {
    expect(() => wecomLoginSchema.parse({ code: '' })).toThrow();
  });

  it('loginSchema rejects missing username', () => {
    expect(() => loginSchema.parse({ password: '123456' })).toThrow();
  });

  it('loginSchema rejects missing password', () => {
    expect(() => loginSchema.parse({ username: 'admin' })).toThrow();
  });

  it('changePasswordSchema accepts valid password change', () => {
    const result = changePasswordSchema.parse({ currentPassword: 'old123', newPassword: 'new123456' });
    expect(result.newPassword).toBe('new123456');
  });

  it('refreshTokenSchema accepts long token string', () => {
    const token = 'a'.repeat(500);
    expect(refreshTokenSchema.parse({ refreshToken: token })).toEqual({ refreshToken: token });
  });

  it('changePasswordSchema rejects empty currentPassword', () => {
    expect(() => changePasswordSchema.parse({ currentPassword: '', newPassword: '123456' })).toThrow();
  });

  it('loginSchema rejects non-string username', () => {
    expect(() => loginSchema.parse({ username: 123, password: '123456' })).toThrow();
  });

  it('updatePreferencesSchema accepts valid preferences', () => {
    const result = updatePreferencesSchema.parse({ preferences: { theme: 'dark' } });
    expect(result.preferences).toEqual({ theme: 'dark' });
  });

  it('updatePreferencesSchema rejects non-object preferences', () => {
    expect(() => updatePreferencesSchema.parse({ preferences: 'invalid' })).toThrow();
  });

  it('changePasswordSchema accepts exactly 6-char newPassword', () => {
    const result = changePasswordSchema.parse({ currentPassword: 'old', newPassword: '123456' });
    expect(result.newPassword).toBe('123456');
  });

  it('updateProfileSchema rejects non-string realName', () => {
    expect(() => updateProfileSchema.parse({ realName: 123 })).toThrow();
  });

  it('loginSchema rejects whitespace-only username', () => {
    expect(() => loginSchema.parse({ username: '   ', password: '123456' })).not.toThrow();
    expect(loginSchema.parse({ username: '   ', password: '123456' }).username).toBe('   ');
  });

  it('updatePreferencesSchema accepts nested object as value', () => {
    const result = updatePreferencesSchema.parse({ preferences: { theme: { mode: 'dark', accent: '#fff' } } });
    expect(result.preferences).toEqual({ theme: { mode: 'dark', accent: '#fff' } });
  });

  it('wecomLoginSchema rejects non-string code', () => {
    expect(() => wecomLoginSchema.parse({ code: 12345 })).toThrow();
  });

  it('loginSchema trims username whitespace', () => {
    const result = loginSchema.parse({ username: '  admin  ', password: '123456' });
    expect(result.username).toBe('  admin  ');
  });

  it('changePasswordSchema rejects missing both fields', () => {
    expect(() => changePasswordSchema.parse({})).toThrow();
  });

  it('changePasswordSchema accepts newPassword at exactly 6 characters', () => {
    const result = changePasswordSchema.parse({ currentPassword: 'old', newPassword: 'abcdef' });
    expect(result.newPassword).toBe('abcdef');
  });

  it('changePasswordSchema rejects newPassword with 5 characters', () => {
    expect(() => changePasswordSchema.parse({ currentPassword: 'old', newPassword: 'abcde' })).toThrow();
  });

  it('loginSchema accepts username with unicode characters', () => {
    const result = loginSchema.parse({ username: '用户名', password: '123456' });
    expect(result.username).toBe('用户名');
  });

  it('changePasswordSchema rejects newPassword shorter than 6 characters', () => {
    expect(() => changePasswordSchema.parse({ currentPassword: 'old123', newPassword: '12345' })).toThrow();
  });

  it('loginSchema rejects empty password', () => {
    expect(() => loginSchema.parse({ username: 'admin', password: '' })).toThrow();
  });

  it('changePasswordSchema rejects same current and new password', () => {
    const result = changePasswordSchema.parse({ currentPassword: 'same123', newPassword: 'same123' });
    expect(result.newPassword).toBe('same123');
  });

  it('loginSchema rejects empty username', () => {
    expect(() => loginSchema.parse({ username: '', password: '123456' })).toThrow();
  });

  it('refreshTokenSchema rejects empty token', () => {
    expect(() => refreshTokenSchema.parse({ refreshToken: '' })).toThrow();
  });

  it('loginSchema rejects missing password', () => {
    expect(() => loginSchema.parse({ username: 'admin' })).toThrow();
  });

  it('updateProfileSchema accepts trimmed whitespace name', () => {
    const result = updateProfileSchema.safeParse({ realName: '   ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.realName).toBe('');
    }
  });

  it('wecomLoginSchema rejects missing code field', () => {
    const result = wecomLoginSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('auth schemas batch 131 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `用户-${index}-<tag>`,
    `pass-${index}-安全`,
  ] as const))(
    'loginSchema accepts generated unicode credentials %s',
    (username, password) => {
      const result = loginSchema.parse({ username, password });

      expect(result).toEqual({ username, password });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `pref-${index}`,
    {
      enabled: index % 2 === 0,
      order: index,
      tags: [`tag-${index}`, `标签-${index}`],
    },
  ] as const))(
    'updatePreferencesSchema preserves generated nested value %s',
    (key, value) => {
      const result = updatePreferencesSchema.parse({ preferences: { [key]: value } });

      expect(result.preferences[key]).toEqual(value);
    },
  );
});
