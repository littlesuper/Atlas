import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AiCallOptions {
  feature: string;
  projectId?: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}

interface AiCallResult {
  content: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

interface AiApiResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
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
  const config = await getAiConfig(options.feature);

  if (!config.apiKey || !config.apiUrl) {
    return null;
  }

  const response = await fetch(config.apiUrl, {
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

  if (!response.ok) {
    throw new Error(`AI API 调用失败: ${response.status}`);
  }

  const result = (await response.json()) as AiApiResponse;
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
