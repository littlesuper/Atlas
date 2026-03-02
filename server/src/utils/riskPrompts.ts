/**
 * 风险评估 Prompt 构建器
 * 结构化多层分析框架，产出更丰富、更可操作的 AI 输出
 */

import { RiskContext } from './riskContext';

/**
 * 构建系统 prompt
 */
export function buildRiskSystemPrompt(): string {
  return `你是一位资深的硬件项目管理风险分析专家，擅长从多维度数据中识别潜在风险并提供可操作的建议。

## 你的角色
- 你将收到规则引擎已量化的项目风险指标和完整的项目数据
- 你的任务是在规则引擎的量化基础上进行**深度研判**，而非重复计算
- 重点关注规则引擎无法捕捉的**模式性风险**和**交叉影响**

## 分析维度
1. **进度与排期**：整体进度偏差、里程碑风险、工期估算准确性趋势
2. **资源与负载**：人员分配不均、关键人员过载、单点依赖
3. **依赖与关键路径**：关键路径上的薄弱环节、依赖瓶颈、连锁风险
4. **阶段集中度**：是否存在阶段瓶颈、下一阶段准备度
5. **趋势分析**：风险等级变化趋势、是否持续恶化或改善
6. **跨项目影响**：资源冲突对项目的潜在影响

## 严重度校准
- LOW：轻微影响，可通过常规管理解决
- MEDIUM：需要关注，可能影响部分排期
- HIGH：严重影响，需要立即干预
- CRITICAL：项目面临失败风险，需紧急决策

## 输出要求
严格输出 JSON 格式（不要包含 markdown 代码块标记），结构如下：
{
  "riskLevel": "LOW|MEDIUM|HIGH|CRITICAL",
  "riskFactors": [
    {
      "factor": "风险因素名称",
      "severity": "LOW|MEDIUM|HIGH",
      "description": "具体描述",
      "triggeredActivities": [{"id": "活动ID", "name": "活动名称", "detail": "补充说明"}]
    }
  ],
  "suggestions": ["具体可操作的建议1", "建议2"],
  "aiInsights": "2-3句自然语言总结，概括项目核心风险态势",
  "trendPrediction": "IMPROVING|STABLE|WORSENING - 一句话解释趋势判断依据",
  "criticalPathAnalysis": "关键路径分析摘要，如无关键路径信息则省略",
  "actionItems": [
    {
      "action": "具体行动项",
      "assignee": "建议负责人姓名（如有）",
      "relatedActivityId": "关联活动ID（如有）",
      "priority": "HIGH|MEDIUM|LOW",
      "deadline": "建议完成期限描述"
    }
  ],
  "resourceBottlenecks": [
    {
      "person": "人员姓名",
      "issue": "问题描述",
      "suggestion": "解决建议"
    }
  ]
}

注意：
- riskFactors 中的 triggeredActivities 应引用实际活动 ID
- actionItems 应具体、可执行，避免泛泛而谈
- 如果某个字段信息不足以分析，可以省略该字段
- 所有文本使用中文`;
}

/**
 * 构建用户 prompt（包含项目数据）
 */
export function buildRiskUserPrompt(context: RiskContext): string {
  const lines: string[] = [];

  lines.push('# 项目风险评估数据');
  lines.push('');

  // Project overview
  lines.push('## 项目概况');
  lines.push(`- 名称：${context.project.name}`);
  lines.push(`- 状态：${context.project.status}`);
  lines.push(`- 优先级：${context.project.priority}`);
  lines.push(`- 整体进度：${context.project.progress.toFixed(1)}%`);
  lines.push(`- 计划周期：${context.project.startDate || '未设定'} ~ ${context.project.endDate || '未设定'}`);
  lines.push(`- 项目经理：${context.project.managerName}`);
  lines.push(`- 团队人数：${context.project.memberCount}`);
  lines.push(`- 活动总数：${context.project.totalActivities}`);
  lines.push('');

  // Rule engine metrics
  lines.push('## 规则引擎量化结果（已计算）');
  lines.push(`- 综合风险等级：${context.ruleEngineMetrics.riskLevel}`);
  lines.push(`- 风险得分：${context.ruleEngineMetrics.riskScore}/14`);
  if (context.ruleEngineMetrics.factors.length > 0) {
    lines.push('- 识别的风险因素：');
    for (const f of context.ruleEngineMetrics.factors) {
      lines.push(`  - [${f.severity}] ${f.factor}：${f.description}（得分 ${f.score ?? '-'}）`);
    }
  }
  lines.push('');

  // Summary stats
  lines.push('## 活动统计摘要');
  const s = context.summary;
  lines.push(`- 已完成：${s.completedCount} | 进行中：${s.inProgressCount} | 未开始：${s.notStartedCount}`);
  lines.push(`- 逾期数：${s.overdueCount} | 未分配：${s.unassignedCount}`);
  if (s.avgDurationDeviation !== null) {
    lines.push(`- 平均工期偏差：${s.avgDurationDeviation}%`);
  }
  lines.push(`- 最长依赖链：${s.longestDependencyChain} 级`);
  lines.push(`- 跨项目资源冲突：${s.crossProjectConflictCount} 人`);
  lines.push('');

  // Critical path
  if (context.criticalPathActivityIds.length > 0) {
    lines.push(`## 关键路径（${context.criticalPathActivityIds.length} 个活动）`);
    const cpActivities = context.activities.filter(a => a.isOnCriticalPath);
    for (const a of cpActivities) {
      const status = a.overdueDays ? `逾期${a.overdueDays}天` : a.status;
      lines.push(`- ${a.name} [${status}] ${a.assignees.join(', ') || '未分配'}`);
    }
    lines.push('');
  }

  // Activities detail (trimmed)
  lines.push(`## 活动详情（${context.activities.length} 个）`);
  for (const a of context.activities) {
    const parts = [`${a.name} [${a.type}/${a.status}]`];
    if (a.phase) parts.push(`阶段:${a.phase}`);
    if (a.assignees.length > 0) parts.push(`负责人:${a.assignees.join(',')}`);
    if (a.planStartDate && a.planEndDate) parts.push(`计划:${a.planStartDate}~${a.planEndDate}`);
    if (a.planDuration) parts.push(`计划工期:${a.planDuration}天`);
    if (a.duration) parts.push(`实际工期:${a.duration}天`);
    if (a.overdueDays) parts.push(`逾期:${a.overdueDays}天`);
    if (a.isOnCriticalPath) parts.push('[关键路径]');
    if (a.dependencyCount > 0) parts.push(`依赖:${a.dependencyCount}个`);
    lines.push(`- ${parts.join(' | ')}`);
  }
  lines.push('');

  // Historical trend
  if (context.historicalTrend.length > 0) {
    lines.push('## 历史风险趋势（最近10次）');
    for (const h of context.historicalTrend) {
      lines.push(`- ${h.assessedAt.slice(0, 16)} : ${h.riskLevel} (${h.source})`);
    }
    lines.push('');
  }

  // Latest weekly report risks
  if (context.latestWeeklyReportRisks) {
    const wr = context.latestWeeklyReportRisks;
    lines.push('## 最新周报风险信息');
    lines.push(`- 周报截止：${wr.weekEnd}`);
    lines.push(`- 进展状态：${wr.progressStatus}`);
    if (wr.riskWarning) {
      // Strip HTML tags for AI readability
      lines.push(`- 风险预警：${wr.riskWarning.replace(/<[^>]*>/g, '')}`);
    }
    lines.push('');
  }

  lines.push('请基于以上数据进行深度分析，输出 JSON 格式的评估结果。');

  return lines.join('\n');
}

/**
 * 从 AI 返回的文本中解析 JSON
 * 支持纯 JSON 和 ```json ... ``` 代码块格式
 */
export function parseAIResponse(content: string): any {
  let jsonStr = content.trim();

  // Extract from fenced code block
  const fenced = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    jsonStr = fenced[1].trim();
  }

  return JSON.parse(jsonStr);
}

/**
 * 校验 AI 输出的 riskLevel 是否合法
 */
export function validateRiskLevel(level: string): string {
  const valid = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const upper = level?.toUpperCase?.() || '';
  if (valid.includes(upper)) return upper;
  // Chinese fallback
  const cnMap: Record<string, string> = { '低': 'LOW', '中': 'MEDIUM', '高': 'HIGH', '严重': 'CRITICAL' };
  return cnMap[level] || 'MEDIUM';
}
