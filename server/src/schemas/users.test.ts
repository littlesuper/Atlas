import { describe, it, expect } from 'vitest';
import { createUserSchema, updateUserSchema, userIdParamSchema } from './users';

describe('users schemas', () => {
  it('createUserSchema accepts valid login user', () => {
    const result = createUserSchema.parse({
      realName: '张三',
      username: 'zhangsan',
      password: '123456',
      canLogin: true,
    });
    expect(result.realName).toBe('张三');
  });

  it('createUserSchema accepts non-login user without username/password', () => {
    const result = createUserSchema.parse({
      realName: '李四',
      canLogin: false,
    });
    expect(result.canLogin).toBe(false);
  });

  it('createUserSchema rejects canLogin=true without username', () => {
    expect(() =>
      createUserSchema.parse({ realName: '张三', password: '123456', canLogin: true }),
    ).toThrow();
  });

  it('createUserSchema defaults canLogin to true', () => {
    const result = createUserSchema.parse({
      realName: '张三',
      username: 'zhangsan',
      password: '123456',
    });
    expect(result.canLogin).toBe(true);
  });

  it('updateUserSchema accepts partial update', () => {
    const result = updateUserSchema.parse({ realName: '新名字' });
    expect(result.realName).toBe('新名字');
  });

  it('updateUserSchema accepts status enum', () => {
    expect(updateUserSchema.parse({ status: 'ACTIVE' }).status).toBe('ACTIVE');
    expect(updateUserSchema.parse({ status: 'DISABLED' }).status).toBe('DISABLED');
  });

  it('updateUserSchema rejects invalid status', () => {
    expect(() => updateUserSchema.parse({ status: 'INVALID' })).toThrow();
  });

  it('updateUserSchema rejects short password', () => {
    expect(() => updateUserSchema.parse({ password: '12345' })).toThrow();
  });

  it('userIdParamSchema accepts valid id', () => {
    expect(userIdParamSchema.parse({ id: '123' })).toEqual({ id: '123' });
  });

  it('userIdParamSchema rejects empty id', () => {
    expect(() => userIdParamSchema.parse({ id: '' })).toThrow();
  });

  it('createUserSchema rejects empty realName', () => {
    expect(() =>
      createUserSchema.parse({ realName: '', username: 'a', password: '123456', canLogin: true }),
    ).toThrow();
  });

  it('updateUserSchema accepts empty optional fields', () => {
    const result = updateUserSchema.parse({ realName: 'Test', wecomUserId: '' });
    expect(result.realName).toBe('Test');
  });

  it('createUserSchema rejects canLogin=true without password', () => {
    expect(() =>
      createUserSchema.parse({ realName: '张三', username: 'zhangsan', canLogin: true }),
    ).toThrow();
  });

  it('updateUserSchema accepts nullable wecomUserId', () => {
    const result = updateUserSchema.parse({ wecomUserId: null });
    expect(result.wecomUserId).toBeNull();
  });

  it('createUserSchema accepts roleIds array', () => {
    const result = createUserSchema.parse({
      realName: '王五',
      username: 'wangwu',
      password: '123456',
      roleIds: ['role-1', 'role-2'],
    });
    expect(result.roleIds).toEqual(['role-1', 'role-2']);
  });

  it('updateUserSchema accepts valid password with minimum length', () => {
    const result = updateUserSchema.parse({ password: '123456' });
    expect(result.password).toBe('123456');
  });

  it('updateUserSchema accepts empty roleIds array', () => {
    const result = updateUserSchema.parse({ roleIds: [] });
    expect(result.roleIds).toEqual([]);
  });

  it('createUserSchema rejects canLogin=true with empty string username', () => {
    expect(() =>
      createUserSchema.parse({ realName: '张三', username: '', password: '123456', canLogin: true }),
    ).toThrow();
  });

  it('createUserSchema accepts canLogin=false with roleIds', () => {
    const result = createUserSchema.parse({
      realName: '联系人',
      canLogin: false,
      roleIds: ['role-1'],
    });
    expect(result.canLogin).toBe(false);
    expect(result.roleIds).toEqual(['role-1']);
  });

  it('updateUserSchema accepts canLogin field alone', () => {
    const result = updateUserSchema.parse({ canLogin: false });
    expect(result.canLogin).toBe(false);
    expect(result).not.toHaveProperty('realName');
  });

  it('updateUserSchema rejects non-array roleIds', () => {
    expect(() => updateUserSchema.parse({ roleIds: 'not-array' })).toThrow();
  });

  it('createUserSchema rejects missing realName field entirely', () => {
    expect(() =>
      createUserSchema.parse({ username: 'test', password: '123456', canLogin: true })
    ).toThrow();
  });

  it('createUserSchema rejects missing username for canLogin user', () => {
    const result = createUserSchema.safeParse({ realName: 'test', canLogin: true });
    expect(result.success).toBe(false);
  });

  it('createUserSchema rejects empty realName', () => {
    expect(() => createUserSchema.parse({ realName: '', canLogin: false })).toThrow();
  });

  it('updateUserSchema accepts status ACTIVE', () => {
    const result = updateUserSchema.parse({ status: 'ACTIVE' });
    expect(result.status).toBe('ACTIVE');
  });

  it('updateUserSchema rejects invalid status value', () => {
    expect(() => updateUserSchema.parse({ status: 'INVALID' })).toThrow();
  });

  it('createUserSchema accepts canLogin=false without roleIds', () => {
    const result = createUserSchema.parse({ realName: '联系人', canLogin: false });
    expect(result.canLogin).toBe(false);
    expect(result.roleIds).toBeUndefined();
  });

  it('updateUserSchema accepts status DISABLED', () => {
    const result = updateUserSchema.parse({ status: 'DISABLED' });
    expect(result.status).toBe('DISABLED');
  });

  it('createUserSchema rejects empty realName', () => {
    expect(() => createUserSchema.parse({ realName: '', canLogin: false })).toThrow();
  });

  it('updateUserSchema accepts canLogin toggle', () => {
    const result = updateUserSchema.parse({ canLogin: true });
    expect(result.canLogin).toBe(true);
  });

  it('createUserSchema accepts canLogin false without username', () => {
    const result = createUserSchema.parse({ realName: 'Contact Only', canLogin: false });
    expect(result.canLogin).toBe(false);
    expect(result.username).toBeUndefined();
  });

  it('updateUserSchema accepts empty partial body', () => {
    const result = updateUserSchema.parse({});
    expect(result.realName).toBeUndefined();
  });

  it('createUserSchema rejects empty realName', () => {
    expect(() => createUserSchema.parse({ realName: '', canLogin: false })).toThrow();
  });

  it('updateUserSchema accepts realName and status together', () => {
    const result = updateUserSchema.parse({ realName: '新名', status: 'DISABLED' });
    expect(result.realName).toBe('新名');
    expect(result.status).toBe('DISABLED');
  });

  it('createUserSchema rejects missing realName', () => {
    expect(() => createUserSchema.parse({ username: 'test' })).toThrow();
  });
});

describe('users schemas batch 131 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `联系人-${index}-<tag>`,
    [`role-${index}`, `role-${index + 1}`],
  ] as const))(
    'createUserSchema accepts generated contact %s without login fields',
    (realName, roleIds) => {
      const result = createUserSchema.parse({ realName, canLogin: false, roleIds });

      expect(result.realName).toBe(realName);
      expect(result.canLogin).toBe(false);
      expect(result.roleIds).toEqual(roleIds);
      expect(result.username).toBeUndefined();
      expect(result.password).toBeUndefined();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `user-${index}`,
    index % 2 === 0 ? 'ACTIVE' : 'DISABLED',
    `pwd-${String(index).padStart(3, '0')}`,
  ] as const))(
    'updateUserSchema accepts generated partial login update %s',
    (username, status, password) => {
      const result = updateUserSchema.parse({ username, status, password });

      expect(result.username).toBe(username);
      expect(result.status).toBe(status);
      expect(result.password).toBe(password);
    },
  );
});
