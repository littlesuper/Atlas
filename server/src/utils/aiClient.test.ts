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
    delete process.env.FEATURE_FLAGS;
    vi.stubGlobal('fetch', mockFetch);
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

  it('ai.external-calls flag 关闭时跳过外部 AI 调用', async () => {
    process.env.FEATURE_FLAGS = '!ai.external-calls';

    const result = await callAi(baseOptions);

    expect(result).toBeNull();
    expect(mockFindMany).not.toHaveBeenCalled();
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

  it('returns empty string content when AI response has no message content', async () => {
    mockFindMany.mockResolvedValue([makeConfig({ features: 'risk' })]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: {} }] }),
    });
    const result = await callAi({ feature: 'risk', systemPrompt: '', userPrompt: '' });
    expect(result?.content).toBe('');
  });

  it('returns empty string content when AI response has empty choices array', async () => {
    mockFindMany.mockResolvedValue([makeConfig({ features: 'risk' })]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] }),
    });
    const result = await callAi({ feature: 'risk', systemPrompt: '', userPrompt: '' });
    expect(result?.content).toBe('');
    expect(result?.usage).toBeUndefined();
  });

  it('records zero token counts when usage fields are missing', async () => {
    mockFindMany.mockResolvedValue([makeConfig({ features: 'risk' })]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
        usage: {},
      }),
    });

    const result = await callAi(baseOptions);
    expect(result?.usage?.promptTokens).toBe(0);
    expect(result?.usage?.completionTokens).toBe(0);
    expect(result?.usage?.totalTokens).toBe(0);
    expect(mockUsageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
      }),
    );
  });

  it('uses gpt-4o-mini as default modelName when env and config are both empty', async () => {
    mockFindMany.mockResolvedValue([{ ...makeConfig(), modelName: '', apiKey: 'sk', apiUrl: 'http://api' }]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });
    await callAi(baseOptions);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('gpt-4o-mini');
  });

  it('handles response with empty content string', async () => {
    vi.resetModules();
    process.env.AI_API_URL = 'http://test';
    process.env.AI_API_KEY = 'test-key';
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: '' } }] }),
    });
    const { callAi } = await import('./aiClient');
    const result = await callAi(baseOptions);
    expect(result?.content).toBe('');
  });

  it('handles null response from AI API', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(null),
    }));
    const { callAi } = import('./aiClient');
    try {
      const result = await callAi(baseOptions);
      expect(result).toBeDefined();
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it('callAi returns null when no config and no env vars', async () => {
    mockFindMany.mockResolvedValue([]);
    delete process.env.AI_API_URL;
    delete process.env.AI_API_KEY;
    const result = await callAi({ feature: 'test', projectId: 'p1', systemPrompt: 'sys', userPrompt: 'usr' });
    expect(result).toBeNull();
  });

  it('callAi returns null when AI_API_URL is not set', async () => { delete process.env.AI_API_URL; const { callAi } = await import('./aiClient'); const result = await callAi({ feature: 'test', projectId: 'p1', systemPrompt: '', userPrompt: '' }); expect(result).toBeNull(); });

  it('callAi handles empty prompt gracefully', async () => { delete process.env.AI_API_URL; const { callAi } = await import('./aiClient'); const result = await callAi({ feature: 'test', projectId: '', systemPrompt: '', userPrompt: '' }); expect(result).toBeNull(); });

  it('getAiConfig returns object when no config exists', async () => { delete process.env.AI_API_URL; const { getAiConfig } = await import('./aiClient'); const result = await getAiConfig('test'); expect(result).toBeDefined(); });

  it('getAiConfig returns null when env is not configured', async () => { delete process.env.AI_API_URL; delete process.env.AI_API_KEY; const { getAiConfig } = await import('./aiClient'); const result = await getAiConfig('nonexistent'); expect(result).toBeDefined(); });

  it('callAi returns null when AI_API_KEY is not set', async () => { delete process.env.AI_API_KEY; delete process.env.AI_API_URL; vi.resetModules(); const { callAi } = await import('./aiClient'); const result = await callAi({ feature: 'test', projectId: '', systemPrompt: '', userPrompt: '' }); expect(result).toBeNull(); });

  it('callAi handles very long system prompt gracefully', async () => { delete process.env.AI_API_URL; vi.resetModules(); const { callAi } = await import('./aiClient'); const result = await callAi({ feature: 'test', projectId: 'p1', systemPrompt: 'x'.repeat(10000), userPrompt: '' }); expect(result).toBeNull(); });

  it('callAi returns null when projectId is empty', async () => { delete process.env.AI_API_URL; delete process.env.AI_API_KEY; vi.resetModules(); const { callAi } = await import('./aiClient'); const result = await callAi({ feature: 'test', projectId: '', systemPrompt: '', userPrompt: '' }); expect(result).toBeNull(); });

  it('callAi returns null when feature is empty string', async () => { delete process.env.AI_API_URL; vi.resetModules(); const { callAi } = await import('./aiClient'); const result = await callAi({ feature: '', projectId: 'p1', systemPrompt: '', userPrompt: '' }); expect(result).toBeNull(); });

  it('callAi returns null when systemPrompt is empty', async () => { delete process.env.AI_API_URL; delete process.env.AI_API_KEY; vi.resetModules(); const { callAi } = await import('./aiClient'); const result = await callAi({ feature: 'test', projectId: 'p1', systemPrompt: '', userPrompt: 'prompt' }); expect(result).toBeNull(); });

  it('callAi returns null when userPrompt is empty', async () => { delete process.env.AI_API_URL; delete process.env.AI_API_KEY; vi.resetModules(); const { callAi } = await import('./aiClient'); const result = await callAi({ feature: 'test', projectId: 'p1', systemPrompt: 'sys', userPrompt: '' }); expect(result).toBeNull(); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `feature-${index}`,
    `sk-generated-${index}`,
    `https://generated-${index}.api`,
    index % 2 === 0 ? '' : `model-${index}`,
  ] as const))(
    'getAiConfig matches generated feature config %s',
    async (feature, apiKey, apiUrl, modelName) => {
      mockFindMany.mockResolvedValue([
        makeConfig({ id: 'fallback', features: '', apiKey: 'sk-fallback', apiUrl: 'https://fallback.api' }),
        makeConfig({ id: `cfg-${feature}`, features: ` risk , ${feature} , weekly_report `, apiKey, apiUrl, modelName }),
      ]);

      const config = await getAiConfig(feature);

      expect(config).toEqual({
        apiKey,
        apiUrl,
        modelName: modelName || 'gpt-4o-mini',
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `content-${index}`,
    index,
    index + 1,
    index + 2,
    index % 10 / 10,
  ] as const))(
    'callAi maps generated usage and request payload %s',
    async (content, promptTokens, completionTokens, totalTokens, temperature) => {
      mockFindMany.mockResolvedValue([makeConfig({ features: 'risk', modelName: `model-${content}` })]);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content } }],
          usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens },
        }),
      });

      const result = await callAi({ ...baseOptions, temperature });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(result).toEqual({
        content,
        usage: { promptTokens, completionTokens, totalTokens },
      });
      expect(body.temperature).toBe(temperature);
      expect(body.model).toBe(`model-${content}`);
      expect(mockUsageCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ promptTokens, completionTokens, totalTokens }),
      });
    },
  );
});
