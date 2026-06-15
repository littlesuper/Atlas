import { describe, it, expect } from 'vitest';
import { genericPreview } from './genericPreview';
import type { CapabilityContext } from './types';

const ctx: CapabilityContext = { userId: 'u1', userName: '张三', permissions: [], projects: [] };
const labels = { name: '名称', productLine: '产品线', priority: '优先级' };

describe('genericPreview', () => {
  it('create: 有值字段 空→新值', () => {
    const pv = genericPreview('create', { name: '项目甲', productLine: '蒲公英', description: '' }, undefined, { labels }, ctx);
    expect(pv.rows).toEqual([
      { key: 'name', label: '名称', before: '（空）', after: '项目甲' },
      { key: 'productLine', label: '产品线', before: '（空）', after: '蒲公英' },
    ]); // description 空值被跳过
    expect(pv.risks).toEqual([]);
  });

  it('create: 用 display 把枚举转中文', () => {
    const pv = genericPreview('create', { priority: 'HIGH' }, undefined, { labels, display: (k, v) => (k === 'priority' ? '高' : String(v)) }, ctx);
    expect(pv.rows[0]).toEqual({ key: 'priority', label: '优先级', before: '（空）', after: '高' });
  });

  it('update: 旧→新，仅变化字段', () => {
    const entity = { id: 'p1', fingerprint: 'fp', fields: { name: '老名', priority: 'LOW' } };
    const pv = genericPreview('update', { name: '新名', priority: 'LOW' }, entity, { labels }, ctx);
    expect(pv.rows).toEqual([{ key: 'name', label: '名称', before: '老名', after: '新名' }]); // priority 未变被跳过
  });
});
