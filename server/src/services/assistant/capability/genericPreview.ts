import type { AssistantPreview, AssistantDiffRow, AssistantRisk } from '../types';
import type { CapabilityContext, CapabilityMode, EntitySnapshot } from './types';

interface PreviewOpts {
  labels?: Record<string, string>;
  display?: (key: string, value: unknown, ctx: CapabilityContext) => string;
}

const isEmpty = (v: unknown) => v == null || v === '';

export function genericPreview(
  mode: CapabilityMode,
  input: Record<string, unknown>,
  entity: EntitySnapshot | undefined,
  opts: PreviewOpts,
  ctx: CapabilityContext
): AssistantPreview {
  const label = (k: string) => opts.labels?.[k] ?? k;
  const show = (k: string, v: unknown) => (opts.display ? opts.display(k, v, ctx) : isEmpty(v) ? '（空）' : String(v));
  const rows: AssistantDiffRow[] = [];
  const risks: AssistantRisk[] = [];

  if (mode === 'create') {
    for (const [k, v] of Object.entries(input)) {
      if (isEmpty(v)) continue;
      rows.push({ key: k, label: label(k), before: '（空）', after: show(k, v) });
    }
  } else if (mode === 'update') {
    const cur = entity?.fields ?? {};
    for (const [k, v] of Object.entries(input)) {
      if (isEmpty(v)) continue;
      if (String(cur[k]) === String(v)) continue; // 未变化跳过
      rows.push({ key: k, label: label(k), before: show(k, cur[k]), after: show(k, v) });
    }
  } else if (mode === 'delete') {
    const cur = entity?.fields ?? {};
    for (const [k, v] of Object.entries(cur)) rows.push({ key: k, label: label(k), before: show(k, v), after: '（删除）' });
    risks.push({ kind: '删除操作', severity: 'danger', text: '该操作将永久删除数据，确认后不可自动恢复。' });
  }
  return { rows, risks };
}
