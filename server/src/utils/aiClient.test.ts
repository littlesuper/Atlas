import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindMany, mockUsageCreate } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockUsageCreate: vi.fn(),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    aiConfig = { findMany: mockFindMany };
    aiUsageLog = { create: mockUsageCreate };
  },
}));

// mock global fetch for callAi tests
const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', mockFetch);

import { getAiConfig, callAi } from './aiClient';

// ===== 帮助函数 =====

function makeConfig(overrides = {}) {
  return {
    id: 'cfg-1',
    name: '默认配置',
    apiKey: 'sk-test-key',
    apiUrl: 'https://api.example.com/v1/chat/completions',
    modelName: 'gpt-4o-mini',
    features: '',
    ...overrides,
  };
}

// ============ getAiConfig ============

describe('getAiConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AI_API_KEY;
    delete process.env.AI_API_URL;
    delete process.env.AI_MODEL;
  });

  it('按功能匹配：features 包含 risk 的配置优先返回', async () => {
    mockFindMany.mockResolvedValue([
      makeConfig({ id: 'cfg-1', features: 'weekly_report', apiKey: 'sk-weekly', apiUrl: 'https://weekly.api' }),
      makeConfig({ id: 'cfg-2', features: 'risk', apiKey: 'sk-risk', apiUrl: 'https://risk.api' }),
    ]);
    const config = await getAiConfig('risk');
    expect(config.apiKey).toBe('sk-risk');
    expect(config.apiUrl).toBe('https://risk.api');
  });

  it('按功能匹配：features 包含多个逗号分隔的功能时正确匹配', async () => {
    mockFindMany.mockResolvedValue([
      makeConfig({ features: 'risk,weekly_report', apiKey: 'sk-all', apiUrl: 'https://all.api' }),
    ]);
    const config = await getAiConfig('weekly_report');
    expect(config.apiKey).toBe('sk-all');
  });

  it('功能匹配的配置缺少 apiKey 时回退到其他有效配置', async () => {
    mockFindMany.mockResolvedValue([
      makeConfig({ features: 'risk', apiKey: '', apiUrl: 'https://risk.api' }),
      makeConfig({ id: 'cfg-2', features: '', apiKey: 'sk-fallback', apiUrl: 'https://fallback.api' }),
    ]);
    const config = await getAiConfig('risk');
    expect(config.apiKey).toBe('sk-fallback');
  });

  it('功能匹配的配置缺少 apiUrl 时回退到其他有效配置', async () => {
    mockFindMany.mockResolvedValue([
      makeConfig({ features: 'risk', apiKey: 'sk-risk', apiUrl: '' }),
      makeConfig({ id: 'cfg-2', features: '', apiKey: 'sk-fallback', apiUrl: 'https://fallback.api' }),
    ]);
    const config = await getAiConfig('risk');
    expect(config.apiKey).toBe('sk-fallback');
  });

  it('无 feature 参数时返回第一个有效配置', async () => {
    mockFindMany.mockResolvedValue([
      makeConfig({ apiKey: '', apiUrl: '' }),
      makeConfig({ id: 'cfg-2', apiKey: 'sk-valid', apiUrl: 'https://valid.api', modelName: 'gpt-4o' }),
    ]);
    const config = await getAiConfig();
    expect(config.apiKey).toBe('sk-valid');
    expect(config.modelName).toBe('gpt-4o');
  });

  it('无有效配置时回退到环境变量', async () => {
    process.env.AI_API_KEY = 'env-key';
    process.env.AI_API_URL = 'https://env.api';
    process.env.AI_MODEL = 'env-model';
    mockFindMany.mockResolvedValue([]);
    const config = await getAiConfig('risk');
    expect(config.apiKey).toBe('env-key');
    expect(config.apiUrl).toBe('https://env.api');
    expect(config.modelName).toBe('env-model');
  });

  it('无配置且无环境变量时返回空字符串', async () => {
    mockFindMany.mockResolvedValue([]);
    const config = await getAiConfig();
    expect(config.apiKey).toBe('');
    expect(config.apiUrl).toBe('');
    expect(config.modelName).toBe('gpt-4o-mini');
  });

  it('modelName 为空时默认 gpt-4o-mini', async () => {
    mockFindMany.mockResolvedValue([
      makeConfig({ modelName: '', features: 'risk' }),
    ]);
    const config = await getAiConfig('risk');
    expect(config.modelName).toBe('gpt-4o-mini');
  });

  it('features 中有空格时正确匹配（trim 处理）', async () => {
    mockFindMany.mockResolvedValue([
      makeConfig({ features: ' risk , weekly_report ', apiKey: 'sk-trim', apiUrl: 'https://trim.api' }),
    ]);
    const config = await getAiConfig('risk');
    expect(config.apiKey).toBe('sk-trim');
  });
});

// ============ callAi ============

describe('callAi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsageCreate.mockResolvedValue({});
  });

  const baseOptions = {
    feature: 'risk',
    systemPrompt: '你是专家',
    userPrompt: '分析项目',
  };

  it('未配置 apiKey 时返回 null', async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await callAi(baseOptions);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('未配置 apiUrl 时返回 null', async () => {
    mockFindMany.mockResolvedValue([makeConfig({ apiUrl: '' })]);
    const result = await callAi(baseOptions);
    expect(result).toBeNull();
  });

  it('成功调用返回 content 和 usage', async () => {
    mockFindMany.mockResolvedValue([makeConfig({ features: 'risk' })]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '分析结果' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    });

    const result = await callAi(baseOptions);
    expect(result).toEqual({
      content: '分析结果',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });
  });

  it('成功调用时记录 token 用量到 aiUsageLog', async () => {
    mockFindMany.mockResolvedValue([makeConfig({ features: 'risk' })]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    });

    await callAi({ ...baseOptions, projectId: 'proj-1' });
    expect(mockUsageCreate).toHaveBeenCalledWith({
      data: {
        feature: 'risk',
        projectId: 'proj-1',
        modelName: 'gpt-4o-mini',
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    });
  });

  it('API 返回无 usage 时不记录日志，返回 usage 为 undefined', async () => {
    mockFindMany.mockResolvedValue([makeConfig({ features: 'risk' })]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '结果' } }],
      }),
    });

    const result = await callAi(baseOptions);
    expect(result?.content).toBe('结果');
    expect(result?.usage).toBeUndefined();
    expect(mockUsageCreate).not.toHaveBeenCalled();
  });

  it('API 返回非 200 时抛出错误', async () => {
    mockFindMany.mockResolvedValue([makeConfig({ features: 'risk' })]);
    mockFetch.mockResolvedValue({ ok: false, status: 429 });

    await expect(callAi(baseOptions)).rejects.toThrow('AI API 调用失败: 429');
  });

  it('使用正确的请求参数调用 fetch', async () => {
    mockFindMany.mockResolvedValue([makeConfig({ features: 'risk', modelName: 'gpt-4o' })]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '' } }] }),
    });

    await callAi({ ...baseOptions, temperature: 0.3 });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer sk-test-key',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: '你是专家' },
            { role: 'user', content: '分析项目' },
          ],
          temperature: 0.3,
        }),
      }),
    );
  });

  it('未指定 temperature 时默认 0.7', async () => {
    mockFindMany.mockResolvedValue([makeConfig({ features: 'risk' })]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '' } }] }),
    });

    await callAi(baseOptions);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.7);
  });
});
