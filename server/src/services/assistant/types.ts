/**
 * 全系统 AI 助手框架 · 共享类型与适配器接口
 *
 * 见 docs/specs/system-wide-assistant/00-framework-and-safety.md。
 * 安全模型：LLM 只在边缘；每次写入需用户确认；走现有校验路由；代码层护栏；全程审计。
 */
import type { Request } from 'express';

/** 预览中的一行改动（活动级或字段级，统一成展示行） */
export interface AssistantDiffRow {
  key: string;
  label: string;
  before: string;
  after: string;
}

export interface AssistantRisk {
  kind: string;
  severity: 'info' | 'warning' | 'danger';
  text: string;
}

export interface AssistantPreview {
  rows: AssistantDiffRow[];
  risks: AssistantRisk[];
  /** LLM 对意图的置信度；'low' 时前端额外警示逐条核对（见 00 §1 / 排期 §G） */
  confidence?: 'high' | 'low';
  /** 领域特定原始数据（如完整 ScheduleDiff），前端可选用于更丰富渲染 */
  raw?: unknown;
}

/** 适配器加载的上下文：白名单 + 当前值 + 指纹。targetId/fingerprint 必有，其余领域自定义。 */
export interface AdapterContext {
  targetId: string;
  fingerprint: string;
  [key: string]: unknown;
}

/** 纯解析结果：成功带 intent，失败带原因（反幻觉兜底，见 00 §1.4） */
export type IntentParseResult<TIntent = unknown> =
  | { ok: true; intent: TIntent }
  | { ok: false; kind: 'unparseable' | 'invalid_schema' | 'fabricated_id'; detail?: string };

/**
 * 动作适配器：每个可写领域实现一个。
 * 框架的通用编排（缓存/确认/审计/护栏/降级）只认这个接口。
 */
export interface AssistantActionAdapter<TIntent = unknown> {
  /** 领域标识，如 'schedule' | 'project' */
  domain: string;
  /** 一句话描述本领域能做什么；供 domainClassifier 路由用户意图 */
  description: string;
  /** RBAC 权限点；orchestrator 在 propose/apply 前校验 */
  permission: { resource: string; action: string };

  /** 拉取上下文（白名单 + 当前值 + 指纹）；目标不存在返回 null */
  loadContext(targetId: string): Promise<AdapterContext | null>;

  /** LLM 边缘 1 的 prompt 构建（system + user） */
  buildIntentSystemPrompt(ctx: AdapterContext): string;
  buildIntentUserPrompt(utterance: string, ctx: AdapterContext): string;

  /** 纯解析 + Zod + id 白名单（不含 LLM 调用，可离线测试） */
  parseIntent(rawLLM: string, ctx: AdapterContext): IntentParseResult<TIntent>;

  /** 确定性预览：当前 → 提议的 diff + 风险（无副作用） */
  buildPreview(intent: TIntent, ctx: AdapterContext): AssistantPreview;

  /** 应用：经现有校验写入路径落库；返回实际改动行 */
  apply(
    intent: TIntent,
    freshCtx: AdapterContext,
    req: Request
  ): Promise<{ rows: AssistantDiffRow[]; risks: AssistantRisk[] }>;

  /** 可选：领域定制叙述；缺省由 orchestrator 用通用 diff 叙述 */
  describeForNarration?(preview: AssistantPreview): string;
}
