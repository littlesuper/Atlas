import { describe, it, expect } from 'vitest';
import { getUserLabel } from './ProjectFormDrawer';
import type { User } from '../../../types';

describe('getUserLabel', () => {
  it('returns realName when available', () => {
    const user = { realName: '张三', username: 'zhangsan', id: 'user-12345678' } as User;
    expect(getUserLabel(user)).toBe('张三');
  });

  it('returns username when realName is empty', () => {
    const user = { realName: '', username: 'lisi', id: 'user-12345678' } as User;
    expect(getUserLabel(user)).toBe('lisi');
  });

  it('returns truncated id when both realName and username are empty', () => {
    const user = { realName: '', username: '', id: 'user-abcdefghij' } as User;
    expect(getUserLabel(user)).toBe('user-abc');
  });

  it('prefers realName over username', () => {
    const user = { realName: '王五', username: 'wangwu', id: 'user-12345678' } as User;
    expect(getUserLabel(user)).toBe('王五');
  });

  it('slices id to first 8 characters', () => {
    const user = { realName: '', username: '', id: 'abcdefghijklmnop' } as User;
    expect(getUserLabel(user)).toBe('abcdefgh');
  });

  it('handles short id', () => {
    const user = { realName: '', username: '', id: 'abc' } as User;
    expect(getUserLabel(user)).toBe('abc');
  });

  it('prefers realName with special characters', () => {
    const user = { realName: '李·四', username: 'lisi', id: 'user-123' } as User;
    expect(getUserLabel(user)).toBe('李·四');
  });

  it('handles very long realName', () => {
    const longName = 'A'.repeat(200);
    const user = { realName: longName, username: 'u', id: 'user-1' } as User;
    expect(getUserLabel(user)).toBe(longName);
  });

  it('handles undefined username gracefully', () => {
    const user = { realName: '赵六', username: undefined, id: 'user-1' } as unknown as User;
    expect(getUserLabel(user)).toBe('赵六');
  });

  it('handles numeric realName', () => {
    const user = { realName: '123', username: 'u1', id: 'user-1' } as User;
    expect(getUserLabel(user)).toBe('123');
  });

  it('returns username when realName is undefined', () => {
    const user = { realName: undefined, username: 'fallback', id: 'user-123' } as unknown as User;
    expect(getUserLabel(user)).toBe('fallback');
  });

  it('returns id slice when both realName and username are undefined', () => {
    const user = { realName: undefined, username: undefined, id: 'user-abcdefghij' } as unknown as User;
    expect(getUserLabel(user)).toBe('user-abc');
  });

  it('returns whitespace realName because it is truthy', () => {
    const user = { realName: '   ', username: 'whitespace', id: 'user-123' } as User;
    expect(getUserLabel(user)).toBe('   ');
  });

  it('handles id with exactly 8 characters', () => {
    const user = { realName: '', username: '', id: '12345678' } as User;
    expect(getUserLabel(user)).toBe('12345678');
  });

  it('returns username "0" when realName is empty', () => {
    const user = { realName: '', username: '0', id: 'user-12345678' } as User;
    expect(getUserLabel(user)).toBe('0');
  });

  it('returns id slice when realName is empty string and username is undefined', () => {
    const user = { realName: '', username: undefined, id: 'abcdefghij' } as unknown as User;
    expect(getUserLabel(user)).toBe('abcdefgh');
  });

  it('returns id slice when all fields are empty strings', () => {
    const user = { realName: '', username: '', id: 'x' } as User;
    expect(getUserLabel(user)).toBe('x');
  });

  it('returns realName "0" as truthy label over username', () => {
    const user = { realName: '0', username: 'admin', id: 'user-123' } as User;
    expect(getUserLabel(user)).toBe('0');
  });

  it('returns empty string when all fields including id are empty', () => {
    const user = { realName: '', username: '', id: '' } as unknown as User;
    expect(getUserLabel(user)).toBe('');
  });

  it('handles id shorter than 8 characters', () => {
    const user = { realName: '', username: '', id: 'ab' } as User;
    expect(getUserLabel(user)).toBe('ab');
  });

  it('getUserLabel returns realName when it is one character', () => {
    const user = { realName: '张', username: 'zhang' };
    expect(getUserLabel(user)).toBe('张');
  });

  it('getUserLabel returns realName with username in parens when different', () => {
    const user = { realName: '张三', username: 'zhangsan' };
    const label = getUserLabel(user);
    expect(label).toContain('张三');
  });

  it('getUserLabel returns id slice when realName is 0 and username is empty', () => {
    const user = { realName: 0 as unknown as string, username: '', id: 'user-abc' } as unknown as User;
    expect(getUserLabel(user)).toBe('user-abc');
  });

  it('getUserLabel handles id with exactly 1 character', () => {
    const user = { realName: '', username: '', id: 'x' } as User;
    expect(getUserLabel(user)).toBe('x');
  });

  it('getUserLabel returns id when realName is whitespace-only and username is empty', () => {
    const user = { realName: '   ', username: '', id: 'user-abc' } as User;
    const label = getUserLabel(user);
    expect(label.length).toBeGreaterThan(0);
  });

  it('getUserLabel returns username when realName is empty', () => {
    const user = { realName: '', username: 'johndoe', id: 'user-123' } as User;
    expect(getUserLabel(user)).toBe('johndoe');
  });

  it('getUserLabel returns realName when both realName and username are set', () => {
    const user = { realName: '张三', username: 'zhangsan', id: 'user-1' } as User;
    expect(getUserLabel(user)).toBe('张三');
  });

  it('getUserLabel returns realName when only realName is set', () => {
    const user = { realName: '李四', id: 'user-2' } as User;
    expect(getUserLabel(user)).toBe('李四');
  });

  it('getUserLabel handles user with null username', () => {
    const user = { realName: '王五', username: null, id: 'user-3' } as unknown as User;
    expect(getUserLabel(user)).toBe('王五');
  });

  it('getUserLabel handles user with empty realName', () => {
    const user = { realName: '', username: 'user1', id: 'user-4' } as unknown as User;
    expect(getUserLabel(user)).toBe('user1');
  });

  it('getUserLabel handles user with both realName and username', () => {
    const user = { realName: '张三', username: 'zhangsan', id: 'user-5' } as unknown as User;
    expect(getUserLabel(user)).toContain('张三');
  });

  it('getUserLabel handles user with only realName', () => {
    const user = { realName: '李四', id: 'user-6' } as unknown as User;
    expect(getUserLabel(user)).toContain('李四');
  });

  it('getUserLabel handles user with both username and realName', () => {
    const user = { realName: '王五', username: 'wangwu', id: 'user-7' } as unknown as User;
    const label = getUserLabel(user);
    expect(label).toContain('王五');
  });

  it('getUserLabel handles undefined username', () => {
    const user = { realName: '赵六', id: 'user-8' } as unknown as User;
    expect(getUserLabel(user)).toBe('赵六');
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `真实姓名-${index}`,
    `username-${index}`,
    `user-${index.toString().padStart(8, '0')}`,
  ] as const))(
    'getUserLabel prefers generated realName %s',
    (realName, username, id) => {
      const user = { realName, username, id } as User;

      expect(getUserLabel(user)).toBe(realName);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `username-${index}`,
    `id-${index.toString().padStart(12, '0')}`,
  ] as const))(
    'getUserLabel falls back to generated username %s before id',
    (username, id) => {
      const user = { realName: '', username, id } as User;

      expect(getUserLabel(user)).toBe(username);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `id-${index.toString().padStart(12, '0')}`,
    `id-${index.toString().padStart(12, '0')}`.slice(0, 8),
  ] as const))(
    'getUserLabel falls back to generated id slice %s',
    (id, expected) => {
      const user = { realName: '', username: '', id } as User;

      expect(getUserLabel(user)).toBe(expected);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? ` 真实-${index} ` : `真实-${index}`,
    index % 3 === 0 ? ` username-${index} ` : '',
    `user-${index.toString().padStart(10, '0')}`,
  ] as const))(
    'getUserLabel preserves generated truthy realName exactly %s',
    (realName, username, id) => {
      const user = { realName, username, id } as User;

      expect(getUserLabel(user)).toBe(realName);
    },
  );
});
