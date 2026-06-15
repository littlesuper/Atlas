/**
 * 助手框架 · 共享展示类型（preview / diff / risk）
 *
 * 见 docs/specs/system-wide-assistant/00-framework-and-safety.md。
 * 安全模型：LLM 只在边缘；每次写入需用户确认；走现有校验路由；代码层护栏；全程审计。
 * （旧 AssistantActionAdapter 接口随 adapter 体系在 Phase 2 PR4 删除，仅保留 preview/diff/risk 展示类型。）
 */

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
