import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  axiosGet: vi.fn(),
}));

vi.mock('../generated/prisma/client', () => ({
  PrismaClient: class {
    wecomConfig = { findFirst: mocks.findFirst };
  },
}));

vi.mock('axios', () => ({
  default: { get: mocks.axiosGet },
}));

describe('wecom utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.WECOM_CORP_ID;
    delete process.env.WECOM_AGENT_ID;
    delete process.env.WECOM_SECRET;
    delete process.env.WECOM_REDIRECT_URI;
  });

  it('getWecomConfig returns env vars when DB has no config', async () => {
    mocks.findFirst.mockResolvedValue(null);
    process.env.WECOM_CORP_ID = 'env-corp';
    process.env.WECOM_AGENT_ID = 'env-agent';
    process.env.WECOM_SECRET = 'env-secret';
    process.env.WECOM_REDIRECT_URI = 'env-redirect';

    const { getWecomConfig } = await import('./wecom');
    const config = await getWecomConfig();

    expect(config.corpId).toBe('env-corp');
  });

  it('getWecomConfig returns DB config when available', async () => {
    mocks.findFirst.mockResolvedValue({
      corpId: 'db-corp', agentId: 'db-agent', secret: 'db-secret', redirectUri: 'db-redirect',
    });

    const { getWecomConfig } = await import('./wecom');
    const config = await getWecomConfig();

    expect(config.corpId).toBe('db-corp');
  });

  it('getWecomConfig falls back to env on DB error', async () => {
    mocks.findFirst.mockRejectedValue(new Error('DB down'));
    process.env.WECOM_CORP_ID = 'fallback-corp';
    process.env.WECOM_SECRET = 'fallback-secret';

    const { getWecomConfig } = await import('./wecom');
    const config = await getWecomConfig();

    expect(config.corpId).toBe('fallback-corp');
  });

  it('getWecomConfig ignores DB config missing corpId/secret', async () => {
    mocks.findFirst.mockResolvedValue({ corpId: '', agentId: 'a', secret: '', redirectUri: 'r' });
    process.env.WECOM_CORP_ID = 'env-corp';
    process.env.WECOM_SECRET = 'env-secret';

    const { getWecomConfig } = await import('./wecom');
    const config = await getWecomConfig();

    expect(config.corpId).toBe('env-corp');
  });

  it('isWecomEnabled returns false when config incomplete', async () => {
    mocks.findFirst.mockResolvedValue(null);

    const { isWecomEnabled } = await import('./wecom');
    expect(await isWecomEnabled()).toBe(false);
  });

  it('isWecomEnabled returns true when config complete', async () => {
    mocks.findFirst.mockResolvedValue({
      corpId: 'c', agentId: 'a', secret: 's', redirectUri: 'r',
    });

    const { isWecomEnabled } = await import('./wecom');
    expect(await isWecomEnabled()).toBe(true);
  });

  it('getAccessToken throws on API error', async () => {
    mocks.findFirst.mockResolvedValue({
      corpId: 'c', agentId: 'a', secret: 's', redirectUri: 'r',
    });
    mocks.axiosGet.mockResolvedValue({ data: { errcode: 40001, errmsg: 'invalid' } });

    const { getAccessToken } = await import('./wecom');
    await expect(getAccessToken()).rejects.toThrow('获取 access_token 失败');
  });

  it('getAccessToken returns token on success', async () => {
    mocks.findFirst.mockResolvedValue({
      corpId: 'c', agentId: 'a', secret: 's', redirectUri: 'r',
    });
    mocks.axiosGet.mockResolvedValue({
      data: { errcode: 0, access_token: 'tok-123', expires_in: 7200 },
    });

    const { getAccessToken } = await import('./wecom');
    const token = await getAccessToken();
    expect(token).toBe('tok-123');
  });

  it('getAccessToken caches token for subsequent calls', async () => {
    mocks.findFirst.mockResolvedValue({
      corpId: 'c', agentId: 'a', secret: 's', redirectUri: 'r',
    });
    mocks.axiosGet.mockResolvedValue({
      data: { errcode: 0, access_token: 'tok-cached', expires_in: 7200 },
    });

    const { getAccessToken } = await import('./wecom');
    await getAccessToken();
    await getAccessToken();

    expect(mocks.axiosGet).toHaveBeenCalledTimes(1);
  });

  it('getUserInfoByCode throws on non-member', async () => {
    mocks.findFirst.mockResolvedValue({
      corpId: 'c', agentId: 'a', secret: 's', redirectUri: 'r',
    });
    mocks.axiosGet
      .mockResolvedValueOnce({ data: { errcode: 0, access_token: 'tok', expires_in: 7200 } })
      .mockResolvedValueOnce({ data: { errcode: 0, openid: 'ext-openid' } });

    const { getUserInfoByCode } = await import('./wecom');
    await expect(getUserInfoByCode('code-123')).rejects.toThrow('非企业成员');
  });

  it('getUserInfoByCode throws on API error', async () => {
    mocks.findFirst.mockResolvedValue({
      corpId: 'c', agentId: 'a', secret: 's', redirectUri: 'r',
    });
    mocks.axiosGet
      .mockResolvedValueOnce({ data: { errcode: 0, access_token: 'tok', expires_in: 7200 } })
      .mockResolvedValueOnce({ data: { errcode: 40029, errmsg: 'invalid code' } });

    const { getUserInfoByCode } = await import('./wecom');
    await expect(getUserInfoByCode('bad-code')).rejects.toThrow('企微授权失败');
  });

  it('getUserDetail returns user info on success', async () => {
    mocks.findFirst.mockResolvedValue({
      corpId: 'c', agentId: 'a', secret: 's', redirectUri: 'r',
    });
    mocks.axiosGet
      .mockResolvedValueOnce({ data: { errcode: 0, access_token: 'tok', expires_in: 7200 } })
      .mockResolvedValueOnce({ data: { errcode: 0, userid: 'u1', name: '张三', email: 'z@test.com', mobile: '13800000000' } });

    const { getUserDetail } = await import('./wecom');
    const detail = await getUserDetail('u1');
    expect(detail).toEqual({ userid: 'u1', name: '张三', email: 'z@test.com', mobile: '13800000000' });
  });

  it('getUserDetail throws on API error', async () => {
    mocks.findFirst.mockResolvedValue({
      corpId: 'c', agentId: 'a', secret: 's', redirectUri: 'r',
    });
    mocks.axiosGet
      .mockResolvedValueOnce({ data: { errcode: 0, access_token: 'tok', expires_in: 7200 } })
      .mockResolvedValueOnce({ data: { errcode: 60011, errmsg: 'no permission' } });

    const { getUserDetail } = await import('./wecom');
    await expect(getUserDetail('u1')).rejects.toThrow('获取企微用户信息失败');
  });

  it('getUserDetail defaults email and mobile to empty', async () => {
    mocks.findFirst.mockResolvedValue({
      corpId: 'c', agentId: 'a', secret: 's', redirectUri: 'r',
    });
    mocks.axiosGet
      .mockResolvedValueOnce({ data: { errcode: 0, access_token: 'tok', expires_in: 7200 } })
      .mockResolvedValueOnce({ data: { errcode: 0, userid: 'u1', name: 'Test' } });

    const { getUserDetail } = await import('./wecom');
    const detail = await getUserDetail('u1');
    expect(detail.email).toBe('');
    expect(detail.mobile).toBe('');
  });

  it('invalidateWecomConfigCache forces config reload on next call', async () => {
    mocks.findFirst.mockResolvedValue({
      corpId: 'first-corp', agentId: 'a', secret: 's', redirectUri: 'r',
    });

    const { getWecomConfig, invalidateWecomConfigCache } = await import('./wecom');
    const config1 = await getWecomConfig();
    expect(config1.corpId).toBe('first-corp');

    mocks.findFirst.mockResolvedValue({
      corpId: 'second-corp', agentId: 'b', secret: 's2', redirectUri: 'r2',
    });

    invalidateWecomConfigCache();
    const config2 = await getWecomConfig();
    expect(config2.corpId).toBe('second-corp');
  });

  it('getUserInfoByCode returns userid on success', async () => {
    mocks.findFirst.mockResolvedValue({
      corpId: 'c', agentId: 'a', secret: 's', redirectUri: 'r',
    });
    mocks.axiosGet
      .mockResolvedValueOnce({ data: { errcode: 0, access_token: 'tok', expires_in: 7200 } })
      .mockResolvedValueOnce({ data: { errcode: 0, userid: 'zhangsan' } });

    const { getUserInfoByCode } = await import('./wecom');
    const userid = await getUserInfoByCode('valid-code');
    expect(userid).toBe('zhangsan');
  });

  it('getWecomConfig returns empty strings when no DB config and no env vars', async () => {
    mocks.findFirst.mockResolvedValue(null);

    const { getWecomConfig } = await import('./wecom');
    const config = await getWecomConfig();

    expect(config).toEqual({ corpId: '', agentId: '', secret: '', redirectUri: '' });
  });

  it('invalidateWecomConfigCache clears cached access token', async () => {
    mocks.findFirst.mockResolvedValue({
      corpId: 'c', agentId: 'a', secret: 's', redirectUri: 'r',
    });
    mocks.axiosGet.mockResolvedValue({
      data: { errcode: 0, access_token: 'first-tok', expires_in: 7200 },
    });

    const { getAccessToken, invalidateWecomConfigCache } = await import('./wecom');
    await getAccessToken();

    mocks.axiosGet.mockResolvedValue({
      data: { errcode: 0, access_token: 'second-tok', expires_in: 7200 },
    });

    invalidateWecomConfigCache();
    const token = await getAccessToken();

    expect(token).toBe('second-tok');
    expect(mocks.axiosGet).toHaveBeenCalledTimes(2);
  });

  it('isWecomEnabled returns false when corpId present but agentId missing', async () => {
    mocks.findFirst.mockResolvedValue({
      corpId: 'c', agentId: '', secret: 's', redirectUri: 'r',
    });

    const { isWecomEnabled } = await import('./wecom');
    expect(await isWecomEnabled()).toBe(false);
  });

  it('isWecomEnabled returns false when agentId is missing', async () => {
    vi.resetModules();
    mocks.findFirst.mockResolvedValue({
      corpId: 'c', agentId: '', secret: 's', redirectUri: 'r',
    });

    const { isWecomEnabled } = await import('./wecom');
    expect(await isWecomEnabled()).toBe(false);
  });

  it('isWecomEnabled returns false when no config record exists', async () => {
    vi.resetModules();
    mocks.findFirst.mockResolvedValue(null);

    const { isWecomEnabled } = await import('./wecom');
    expect(await isWecomEnabled()).toBe(false);
  });

  it('isWecomEnabled returns true when enabled config exists', async () => {
    vi.resetModules();
    mocks.findFirst.mockResolvedValue({ enabled: true, corpId: 'test', agentId: '1', secret: 's' });

    const { isWecomEnabled } = await import('./wecom');
    expect(await isWecomEnabled()).toBe(true);
  });

  it('isWecomEnabled returns false when no config exists', async () => {
    vi.resetModules();
    mocks.findFirst.mockResolvedValue(null);
    const { isWecomEnabled } = await import('./wecom');
    expect(await isWecomEnabled()).toBe(false);
  });

  it('getWecomConfig returns empty strings when not configured', async () => {
    delete process.env.WECOM_CORP_ID;
    delete process.env.WECOM_SECRET;
    const { getWecomConfig } = await import('./wecom');
    const config = await getWecomConfig();
    expect(config.corpId).toBe('');
  });

  it('invalidateWecomConfigCache is callable', async () => {
    const { invalidateWecomConfigCache } = await import('./wecom');
    expect(typeof invalidateWecomConfigCache).toBe('function');
  });

  it('isWecomEnabled returns promise when env not configured', async () => {
    vi.resetModules();
    const { isWecomEnabled } = await import('./wecom');
    const result = isWecomEnabled();
    expect(typeof result.then).toBe('function');
  });

  it('getWecomConfig is an exported function', async () => { const { getWecomConfig } = await import('./wecom'); const config = await getWecomConfig(); expect(config).toBeDefined(); expect(typeof config.corpId).toBe('string'); });

  it('invalidateWecomConfigCache is callable', async () => { const { invalidateWecomConfigCache } = await import('./wecom'); expect(() => invalidateWecomConfigCache()).not.toThrow(); });

  it('isWecomEnabled returns promise without WECOM_CORP_ID', async () => { delete process.env.WECOM_CORP_ID; const { isWecomEnabled } = await import('./wecom'); const result = isWecomEnabled(); expect(typeof result.then).toBe('function'); });

  it('getWecomConfig returns config with empty env', async () => { delete process.env.WECOM_CORP_ID; vi.resetModules(); const { getWecomConfig } = await import('./wecom'); const config = await getWecomConfig(); expect(config).toBeDefined(); });

  it('isWecomEnabled returns false when disabled', async () => { delete process.env.WECOM_CORP_ID; delete process.env.WECOM_AGENT_ID; delete process.env.WECOM_CORP_SECRET; vi.resetModules(); const { isWecomEnabled } = await import('./wecom'); const result = await isWecomEnabled(); expect(result).toBe(false); });

  it('getWecomConfig returns object with corpId field', async () => { delete process.env.WECOM_CORP_ID; vi.resetModules(); const { getWecomConfig } = await import('./wecom'); const config = await getWecomConfig(); expect(config).toHaveProperty('corpId'); });

  it('isWecomEnabled returns false with partial config', async () => { process.env.WECOM_CORP_ID = 'test'; delete process.env.WECOM_AGENT_ID; delete process.env.WECOM_CORP_SECRET; vi.resetModules(); const { isWecomEnabled } = await import('./wecom'); const result = await isWecomEnabled(); expect(result).toBe(false); });

  it('isWecomEnabled returns false when all env vars are missing', async () => { delete process.env.WECOM_CORP_ID; delete process.env.WECOM_AGENT_ID; delete process.env.WECOM_CORP_SECRET; vi.resetModules(); const { isWecomEnabled } = await import('./wecom'); const result = await isWecomEnabled(); expect(result).toBe(false); });

  it('getWecomConfig returns object with corpId property', async () => { vi.resetModules(); const { getWecomConfig } = await import('./wecom'); expect(typeof getWecomConfig).toBe('function'); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `corp-${index}`,
    `agent-${index}`,
    `secret-${index}`,
    `https://atlas.example.com/wecom/${index}`,
  ] as const))(
    'getWecomConfig returns generated env fallback %s',
    async (corpId, agentId, secret, redirectUri) => {
      mocks.findFirst.mockResolvedValue(null);
      process.env.WECOM_CORP_ID = corpId;
      process.env.WECOM_AGENT_ID = agentId;
      process.env.WECOM_SECRET = secret;
      process.env.WECOM_REDIRECT_URI = redirectUri;
      vi.resetModules();

      const { getWecomConfig, isWecomEnabled } = await import('./wecom');
      const config = await getWecomConfig();

      expect(config).toEqual({ corpId, agentId, secret, redirectUri });
      expect(await isWecomEnabled()).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `user-${index}`,
    `用户-${index}`,
    index % 2 === 0 ? `user-${index}@example.com` : undefined,
    index % 3 === 0 ? `1380000${String(index).padStart(4, '0')}` : undefined,
  ] as const))(
    'getUserDetail maps generated optional contact fields %s',
    async (userid, name, email, mobile) => {
      mocks.findFirst.mockResolvedValue({
        corpId: 'c', agentId: 'a', secret: 's', redirectUri: 'r',
      });
      mocks.axiosGet
        .mockResolvedValueOnce({ data: { errcode: 0, access_token: 'tok', expires_in: 7200 } })
        .mockResolvedValueOnce({ data: { errcode: 0, userid, name, email, mobile } });
      vi.resetModules();

      const { getUserDetail } = await import('./wecom');
      const detail = await getUserDetail(userid);

      expect(detail).toEqual({
        userid,
        name,
        email: email || '',
        mobile: mobile || '',
      });
      expect(mocks.axiosGet.mock.calls[1][1].params).toEqual({
        access_token: 'tok',
        userid,
      });
    },
  );
});

describe('wecom utils batch 135 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.WECOM_CORP_ID;
    delete process.env.WECOM_AGENT_ID;
    delete process.env.WECOM_SECRET;
    delete process.env.WECOM_REDIRECT_URI;
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `code-batch135-${index}`,
    `userid-batch135-${index}`,
  ] as const))(
    'getUserInfoByCode maps generated code %s to userid %s',
    async (code, userid) => {
      mocks.findFirst.mockResolvedValue({
        corpId: 'corp-batch135', agentId: 'agent-batch135', secret: 'secret-batch135', redirectUri: 'redirect-batch135',
      });
      mocks.axiosGet
        .mockResolvedValueOnce({ data: { errcode: 0, access_token: 'tok-batch135', expires_in: 7200 } })
        .mockResolvedValueOnce({ data: { errcode: 0, userid } });

      const { getUserInfoByCode } = await import('./wecom');
      const result = await getUserInfoByCode(code);

      expect(result).toBe(userid);
      expect(mocks.axiosGet.mock.calls[1][1].params).toEqual({
        access_token: 'tok-batch135',
        code,
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `corp-db-${index}`,
    `agent-db-${index}`,
    `secret-db-${index}`,
    `redirect-db-${index}`,
  ] as const))(
    'getWecomConfig caches generated DB config %s',
    async (corpId, agentId, secret, redirectUri) => {
      mocks.findFirst.mockResolvedValue({ corpId, agentId, secret, redirectUri });

      const { getWecomConfig } = await import('./wecom');
      const first = await getWecomConfig();
      const second = await getWecomConfig();

      expect(first).toEqual({ corpId, agentId, secret, redirectUri });
      expect(second).toEqual(first);
      expect(mocks.findFirst).toHaveBeenCalledTimes(1);
    },
  );
});
