import { isFeatureEnabled, parseFeatureFlags } from './featureFlags';
import { logger } from './logger';
import prisma from '../db';

interface AiCallOptions {
  feature: string;
  projectId?: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  /** 仅用于耗时日志，区分同一 feature 下的不同阶段（如 classify/target/grounded）；不影响配置匹配 */
  label?: string;
}

interface AiCallResult {
  content: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

/**
 * 按功能匹配 AI 配置：
 * 1. 查找 features 字段包含该 feature 的配置
 * 2. 回退到第一个有效配置（apiKey + apiUrl 非空）
 * 3. 最终回退到环境变量
 */
export async function getAiConfig(feature?: string) {
  const allConfigs = await prisma.aiConfig.findMany();

  // 1. 按功能匹配
  if (feature) {
    const matched = allConfigs.find((c) => {
      const list = c.features.split(',').map((f) => f.trim()).filter(Boolean);
      return list.includes(feature);
    });
    if (matched && matched.apiKey && matched.apiUrl) {
      return {
        apiKey: matched.apiKey,
        apiUrl: matched.apiUrl,
        modelName: matched.modelName || 'gpt-4o-mini',
      };
    }
  }

  // 2. 回退到第一个有效配置
  const fallback = allConfigs.find((c) => c.apiKey && c.apiUrl);
  if (fallback) {
    return {
      apiKey: fallback.apiKey,
      apiUrl: fallback.apiUrl,
      modelName: fallback.modelName || 'gpt-4o-mini',
    };
  }

  // 3. 环境变量
  return {
    apiKey: process.env.AI_API_KEY || '',
    apiUrl: process.env.AI_API_URL || '',
    modelName: process.env.AI_MODEL || 'gpt-4o-mini',
  };
}

/**
 * 调用 AI API 并记录 token 用量
 * 返回 null 表示 AI 未配置
 */
export async function callAi(options: AiCallOptions): Promise<AiCallResult | null> {
  if (!isFeatureEnabled(parseFeatureFlags(process.env.FEATURE_FLAGS), 'ai.external-calls', true)) {
    return null;
  }

  const t0 = Date.now();
  const config = await getAiConfig(options.feature);
  const tConfig = Date.now();

  if (!config.apiKey || !config.apiUrl) {
    return null;
  }

  let response: Response;
  try {
    response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelName,
        messages: [
          { role: 'system', content: options.systemPrompt },
          { role: 'user', content: options.userPrompt },
        ],
        temperature: options.temperature ?? 0.7,
      }),
    });
  } catch (err) {
    logger.warn(
      { feature: options.feature, label: options.label, model: config.modelName, configMs: tConfig - t0, llmMs: Date.now() - tConfig },
      'AI 调用网络失败'
    );
    throw err;
  }
  const tFetch = Date.now();

  if (!response.ok) {
    logger.warn(
      { feature: options.feature, label: options.label, model: config.modelName, status: response.status, llmMs: tFetch - tConfig },
      'AI 调用返回非 2xx'
    );
    throw new Error(`AI API 调用失败: ${response.status}`);
  }

  const result = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const content = result.choices?.[0]?.message?.content;
  const usage = result.usage;

  // 记录 token 用量
  if (usage) {
    await prisma.aiUsageLog.create({
      data: {
        feature: options.feature,
        projectId: options.projectId,
        modelName: config.modelName,
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
      },
    });
  }

  const tEnd = Date.now();
  // 分段耗时：configMs=读AI配置(DB)；llmMs=LLM 往返(主要嫌疑)；postMs=解析+写用量(DB)
  logger.info(
    {
      feature: options.feature,
      label: options.label,
      model: config.modelName,
      configMs: tConfig - t0,
      llmMs: tFetch - tConfig,
      postMs: tEnd - tFetch,
      totalMs: tEnd - t0,
    },
    'AI 调用耗时'
  );

  return {
    content: content || '',
    usage: usage
      ? {
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
        }
      : undefined,
  };
}
