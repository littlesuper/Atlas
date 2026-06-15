# 通用能力注册层 + project.create 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 AI 助手加一个通用「能力注册层」，让声明式 Capability（Zod 契约 + mode 驱动通用 diff）以近零样板接入；首个落地能力 `project.create`（自然语言新建项目）。

**Architecture:** 与现有 `AssistantActionAdapter` 框架**共存**（不动 schedule/project/risk）。新增 `services/assistant/capability/` 子目录：Capability 接口 + 注册表 + 通用编排（LLM 选能力填参〔边缘〕→ Zod 校验 → 缺必填则 `need_input` → 代码算 diff → 确认 → `execute`）。路由层把 capabilities 一并交给现有 `classifyDomain`，命中 capability 时走新编排、**跳过** `resolveProjectTarget`（解决「新建无 targetId」摩擦）。

**Tech Stack:** Express + TypeScript + Zod + Prisma + Vitest（后端）；React + Zustand + Vitest（前端）。

设计依据：同目录 [`00-design.md`](./00-design.md)。

---

## 文件结构

**新增（后端，均在 `server/src/services/assistant/capability/`）**
- `types.ts` — `Capability` 接口 + `CapabilityContext`/`EntitySnapshot`/`CapabilityProposeOutcome` 类型
- `registry.ts`（+ `.test.ts`）— capability 注册表 + 按权限过滤
- `genericPreview.ts`（+ `.test.ts`）— mode 驱动的通用 diff
- `projectCreate.ts`（+ `.test.ts`）— project.create 能力
- `orchestrator.ts`（+ `.test.ts`）— `capabilityPropose` / `capabilityApply`
- `bootstrap.ts` — 注册 `projectCreateCapability`

**修改（后端）**
- `server/src/services/assistant/proposalStore.ts` — `StoredProposal` 增加可选 `capabilityName?`/`args?`
- `server/src/routes/assistant.ts` — 分类 options 纳入 capabilities；propose/apply 分发到 capability 编排

**修改（前端）**
- `client/src/types/index.ts` — `AssistantMessage` status variant 增加 `'need_input'`
- `client/src/hooks/useAssistantChat.ts`（+ `.test.tsx`）— 映射 `need_input`
- `client/src/pages/Home/MessageList.tsx` — `need_input` 气泡（复用 status 样式）

---

## Task 1: Capability 类型 + 注册表

**Files:**
- Create: `server/src/services/assistant/capability/types.ts`
- Create: `server/src/services/assistant/capability/registry.ts`
- Test: `server/src/services/assistant/capability/registry.test.ts`

- [ ] **Step 1: 写类型（无测试，纯声明）**

Create `server/src/services/assistant/capability/types.ts`:
```ts
import type { Request } from 'express';
import type { z } from 'zod';
import type { AssistantPreview, AssistantDiffRow, AssistantRisk } from '../types';

/** 调用方上下文：权限边界 + 默认值来源 */
export interface CapabilityContext {
  userId: string;
  userName: string;
  permissions: string[];
  contextProjectId?: string | null;
  projects: { id: string; name: string }[]; // 该用户权限可见的项目（id 白名单/默认值用）
}

/** update/delete 时目标实体快照（create 不用） */
export interface EntitySnapshot {
  id: string;
  fingerprint: string;
  fields: Record<string, unknown>;
}

export type CapabilityMode = 'create' | 'update' | 'delete' | 'custom';

export interface Capability<TInput = Record<string, unknown>> {
  name: string; // 命名空间化，如 'project.create'（不与现有 domain key 冲突）
  description: string; // 给 LLM 路由 + 填参
  permission: { resource: string; action: string };
  danger?: 'normal' | 'dangerous';
  mode: CapabilityMode;
  /** 全字段可选 + 枚举约束：用于 parse 阶段拦类型/枚举；业务必填交给 missingRequired */
  inputSchema: z.ZodType<TInput>;
  /** 填参 prompt（含字段说明 + 「绝不编造未陈述值」铁律） */
  buildPrompt(utterance: string, ctx: CapabilityContext): { system: string; user: string };
  /** 缺失必填字段的中文名清单；不提供则视为无缺失 */
  missingRequired?(input: TInput, ctx: CapabilityContext): string[];
  /** 在 missingRequired 通过后补默认值（如 managerId=当前用户），返回用于预览/写入的完整 input */
  applyDefaults?(input: TInput, ctx: CapabilityContext): TInput;
  /** genericPreview 的展示配置（mode!=custom 时建议提供） */
  previewLabels?: Record<string, string>;
  previewDisplay?(key: string, value: unknown, ctx: CapabilityContext): string;
  /** custom 模式自定义预览（排期等复杂领域）；提供则覆盖 genericPreview */
  buildPreview?(input: TInput, entity: EntitySnapshot | undefined, ctx: CapabilityContext): AssistantPreview;
  /** update/delete 取目标实体；create 不提供 */
  loadEntity?(id: string, ctx: CapabilityContext): Promise<EntitySnapshot | null>;
  /** update/delete 用实体快照哈希；create 默认用 args 哈希（编排里兜底） */
  fingerprint?(entity?: EntitySnapshot): string;
  /** 写入：调现有 service/prisma（自带校验+审计语义） */
  execute(input: TInput, ctx: CapabilityContext, req: Request): Promise<{ rows: AssistantDiffRow[]; risks: AssistantRisk[] }>;
}
```

- [ ] **Step 2: 写注册表的失败测试**

Create `server/src/services/assistant/capability/registry.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { registerCapability, getCapability, listCapabilitiesForUser, __resetCapabilities } from './registry';
import type { Capability } from './types';
import { z } from 'zod';

const fake = (name: string, resource: string, action: string): Capability =>
  ({
    name,
    description: `desc ${name}`,
    permission: { resource, action },
    mode: 'create',
    inputSchema: z.object({}).passthrough(),
    buildPrompt: () => ({ system: '', user: '' }),
    execute: async () => ({ rows: [], risks: [] }),
  }) as Capability;

describe('capability registry', () => {
  beforeEach(() => __resetCapabilities());

  it('registers and gets by name', () => {
    const c = fake('project.create', 'project', 'create');
    registerCapability(c);
    expect(getCapability('project.create')).toBe(c);
    expect(getCapability('nope')).toBeUndefined();
  });

  it('lists only capabilities the user has permission for', () => {
    registerCapability(fake('project.create', 'project', 'create'));
    registerCapability(fake('risk.delete', 'risk', 'delete'));
    const perms = ['project:create']; // 无 risk:delete
    const visible = listCapabilitiesForUser(perms).map((c) => c.name);
    expect(visible).toEqual(['project.create']);
  });

  it('wildcard *:* sees everything', () => {
    registerCapability(fake('project.create', 'project', 'create'));
    registerCapability(fake('risk.delete', 'risk', 'delete'));
    expect(listCapabilitiesForUser(['*:*']).length).toBe(2);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `cd server && npx vitest run src/services/assistant/capability/registry.test.ts`
Expected: FAIL —「Cannot find module './registry'」。

- [ ] **Step 4: 实现注册表**

Create `server/src/services/assistant/capability/registry.ts`:
```ts
import type { Capability } from './types';

const capabilities = new Map<string, Capability>();

export function registerCapability(cap: Capability): void {
  capabilities.set(cap.name, cap);
}

export function getCapability(name: string): Capability | undefined {
  return capabilities.get(name);
}

export function listCapabilities(): Capability[] {
  return [...capabilities.values()];
}

/** 该用户有权限的能力（权限即能力边界） */
export function listCapabilitiesForUser(permissions: string[]): Capability[] {
  return listCapabilities().filter((c) => hasPermission(permissions, c.permission.resource, c.permission.action));
}

function hasPermission(perms: string[], resource: string, action: string): boolean {
  return perms.some((p) => {
    const [r, a] = p.split(':');
    if (r === '*' && a === '*') return true;
    if (r === '*' && a === action) return true;
    if (r === resource && a === '*') return true;
    return r === resource && a === action;
  });
}

/** 仅供测试 */
export function __resetCapabilities(): void {
  capabilities.clear();
}
```

- [ ] **Step 5: 运行确认通过**

Run: `cd server && npx vitest run src/services/assistant/capability/registry.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**
```bash
git add server/src/services/assistant/capability/types.ts server/src/services/assistant/capability/registry.ts server/src/services/assistant/capability/registry.test.ts
git commit -m "feat(assistant): add capability types + registry"
```

---

## Task 2: 通用预览 genericPreview

**Files:**
- Create: `server/src/services/assistant/capability/genericPreview.ts`
- Test: `server/src/services/assistant/capability/genericPreview.test.ts`

- [ ] **Step 1: 写失败测试**

Create `server/src/services/assistant/capability/genericPreview.test.ts`:
```ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `cd server && npx vitest run src/services/assistant/capability/genericPreview.test.ts`
Expected: FAIL —「Cannot find module './genericPreview'」。

- [ ] **Step 3: 实现**

Create `server/src/services/assistant/capability/genericPreview.ts`:
```ts
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
```

- [ ] **Step 4: 运行确认通过**

Run: `cd server && npx vitest run src/services/assistant/capability/genericPreview.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**
```bash
git add server/src/services/assistant/capability/genericPreview.ts server/src/services/assistant/capability/genericPreview.test.ts
git commit -m "feat(assistant): add mode-driven genericPreview"
```

---

## Task 3: proposalStore 扩展（承载 capability 提议）

**Files:**
- Modify: `server/src/services/assistant/proposalStore.ts`
- Test: `server/src/services/assistant/proposalStore.test.ts`（若不存在则创建）

- [ ] **Step 1: 写测试（capability 提议可存取）**

Create or append `server/src/services/assistant/proposalStore.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { proposalStore } from './proposalStore';

describe('proposalStore capability proposals', () => {
  beforeEach(() => proposalStore.__reset());

  it('stores and retrieves a capability proposal', () => {
    proposalStore.set('p1', {
      domain: 'capability',
      targetId: '__new__',
      capabilityName: 'project.create',
      args: { name: '项目甲' },
      rawUtterance: '建个项目甲',
      intent: null,
      fingerprint: 'fp1',
      createdAt: Date.now(),
    });
    const got = proposalStore.get('p1');
    expect(got?.capabilityName).toBe('project.create');
    expect(got?.args).toMatchObject({ name: '项目甲' });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd server && npx vitest run src/services/assistant/proposalStore.test.ts`
Expected: FAIL（类型上 `StoredProposal` 无 `capabilityName`/`args`，tsc/vitest 报错）。

- [ ] **Step 3: 扩展 StoredProposal**

In `server/src/services/assistant/proposalStore.ts`, 把 `StoredProposal` 接口（行 11-19）改为：
```ts
export interface StoredProposal<TIntent = unknown> {
  domain: string;
  targetId: string;
  rawUtterance: string;
  intent: TIntent;
  fingerprint: string;
  createdAt: number;
  /** capability 提议专用：有此字段则 apply 走 capabilityApply */
  capabilityName?: string;
  args?: unknown;
  applied?: { at: number; rows: AssistantDiffRow[]; risks: AssistantRisk[] };
}
```
其余（set/get/markApplied/prune/__reset/PROPOSAL_TTL_MS）不变。

- [ ] **Step 4: 运行确认通过 + 现有 store 测试不破**

Run: `cd server && npx vitest run src/services/assistant/proposalStore.test.ts && npx tsc --noEmit`
Expected: PASS；tsc 0 error。

- [ ] **Step 5: Commit**
```bash
git add server/src/services/assistant/proposalStore.ts server/src/services/assistant/proposalStore.test.ts
git commit -m "feat(assistant): proposalStore carries capability proposals"
```

---

## Task 4: project.create 能力

**Files:**
- Create: `server/src/services/assistant/capability/projectCreate.ts`
- Test: `server/src/services/assistant/capability/projectCreate.test.ts`

- [ ] **Step 1: 写失败测试（纯逻辑：schema / missingRequired / applyDefaults / execute）**

Create `server/src/services/assistant/capability/projectCreate.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreate, mockFindUser } = vi.hoisted(() => ({ mockCreate: vi.fn(), mockFindUser: vi.fn() }));
vi.mock('../../../db', () => ({ default: { project: { create: mockCreate }, user: { findUnique: mockFindUser } } }));

import { projectCreateCapability } from './projectCreate';
import type { CapabilityContext } from './types';

const ctx: CapabilityContext = { userId: 'u1', userName: '张三', permissions: ['project:create'], projects: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mockFindUser.mockResolvedValue({ id: 'u1', realName: '张三' });
  mockCreate.mockResolvedValue({ id: 'newp', name: '项目甲' });
});

describe('projectCreateCapability', () => {
  it('inputSchema 接受部分字段、拦非法枚举', () => {
    expect(projectCreateCapability.inputSchema.safeParse({ productLine: '蒲公英' }).success).toBe(true);
    expect(projectCreateCapability.inputSchema.safeParse({ priority: 'WRONG' }).success).toBe(false);
  });

  it('missingRequired: 缺 name/productLine 时列出', () => {
    expect(projectCreateCapability.missingRequired!({ productLine: '蒲公英' }, ctx)).toEqual(['项目名称']);
    expect(projectCreateCapability.missingRequired!({}, ctx)).toEqual(['项目名称', '产品线']);
    expect(projectCreateCapability.missingRequired!({ name: '甲', productLine: '蒲公英' }, ctx)).toEqual([]);
  });

  it('applyDefaults: managerId=当前用户、status/priority 默认', () => {
    const full = projectCreateCapability.applyDefaults!({ name: '甲', productLine: '蒲公英' }, ctx);
    expect(full).toMatchObject({ name: '甲', productLine: '蒲公英', managerId: 'u1', status: 'IN_PROGRESS', priority: 'MEDIUM' });
  });

  it('execute: 调 prisma.project.create，校验负责人存在', async () => {
    const full = projectCreateCapability.applyDefaults!({ name: '甲', productLine: '蒲公英' }, ctx);
    const r = await projectCreateCapability.execute(full, ctx, {} as never);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(r.rows.find((x) => x.key === 'name')?.after).toBe('甲');
  });

  it('execute: 负责人不存在 → 抛错', async () => {
    mockFindUser.mockResolvedValueOnce(null);
    const full = projectCreateCapability.applyDefaults!({ name: '甲', productLine: '蒲公英', managerId: 'ghost' }, ctx);
    await expect(projectCreateCapability.execute(full, ctx, {} as never)).rejects.toThrow();
  });

  it('execute: 结束日早于开始日 → 抛错', async () => {
    const full = projectCreateCapability.applyDefaults!({ name: '甲', productLine: '蒲公英', startDate: '2026-06-10', endDate: '2026-06-01' }, ctx);
    await expect(projectCreateCapability.execute(full, ctx, {} as never)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd server && npx vitest run src/services/assistant/capability/projectCreate.test.ts`
Expected: FAIL —「Cannot find module './projectCreate'」。

- [ ] **Step 3: 实现能力**

Create `server/src/services/assistant/capability/projectCreate.ts`:
```ts
import type { Request } from 'express';
import { z } from 'zod';
import prisma from '../../../db';
import { isValidDateRange } from '../../../utils/validation';
import type { AssistantDiffRow } from '../types';
import type { Capability, CapabilityContext } from './types';

export class CapabilityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapabilityValidationError';
  }
}

// 全字段可选 + 枚举约束：parse 阶段只拦类型/枚举，业务必填交给 missingRequired
const projectCreateInputSchema = z.object({
  name: z.string().min(1).optional(),
  productLine: z.string().min(1).optional(),
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'ON_HOLD']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  managerId: z.string().min(1).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().optional(),
});
type ProjectCreateInput = z.infer<typeof projectCreateInputSchema>;

const STATUS_LABEL: Record<string, string> = { IN_PROGRESS: '进行中', COMPLETED: '已完成', ON_HOLD: '已暂停' };
const PRIORITY_LABEL: Record<string, string> = { LOW: '低', MEDIUM: '中', HIGH: '高', CRITICAL: '紧急' };

export const projectCreateCapability: Capability<ProjectCreateInput> = {
  name: 'project.create',
  description: '新建/创建一个项目。当用户想"建一个项目/新增项目/创建项目"时用此能力。',
  permission: { resource: 'project', action: 'create' },
  danger: 'normal',
  mode: 'create',
  inputSchema: projectCreateInputSchema,

  buildPrompt(utterance) {
    return {
      system: `你是项目管理系统的"新建项目意图解析器"。把用户的话解析成创建项目所需字段。
可填字段：
- name：项目名称（字符串）
- productLine：产品线（字符串，如"蒲公英""向日葵"）
- status：IN_PROGRESS(进行中)/COMPLETED(已完成)/ON_HOLD(已暂停)，一般不填（默认进行中）
- priority：LOW/MEDIUM/HIGH/CRITICAL，不填默认 MEDIUM
- startDate/endDate：YYYY-MM-DD
- description：描述
铁律：
- 只填用户**明确说出**的字段；**绝不编造**名称、产品线、日期。用户没说就不要填该字段（留空，交给系统追问）。
- status/priority 映射不到枚举就不要填。
严格输出 JSON：{"name":"...","productLine":"...","priority":"...","startDate":"...","endDate":"...","description":"..."}（只含用户说了的键）。`,
      user: `## 用户的话\n${utterance}\n\n请输出 JSON。`,
    };
  },

  missingRequired(input) {
    const missing: string[] = [];
    if (!input.name) missing.push('项目名称');
    if (!input.productLine) missing.push('产品线');
    return missing;
  },

  applyDefaults(input, ctx) {
    return {
      ...input,
      managerId: input.managerId ?? ctx.userId, // 默认负责人=当前用户
      status: input.status ?? 'IN_PROGRESS',
      priority: input.priority ?? 'MEDIUM',
    };
  },

  previewLabels: {
    name: '名称', productLine: '产品线', status: '状态', priority: '优先级',
    managerId: '负责人', startDate: '计划开始', endDate: '计划结束', description: '描述',
  },
  previewDisplay(key, value, ctx) {
    if (value == null || value === '') return '（空）';
    if (key === 'status') return STATUS_LABEL[String(value)] ?? String(value);
    if (key === 'priority') return PRIORITY_LABEL[String(value)] ?? String(value);
    if (key === 'managerId') return String(value) === ctx.userId ? `${ctx.userName}（我）` : String(value);
    return String(value);
  },

  async execute(input, _ctx, _req: Request) {
    const managerId = input.managerId!;
    if (input.startDate && input.endDate && !isValidDateRange(input.startDate, input.endDate)) {
      throw new CapabilityValidationError('结束日期不能早于开始日期');
    }
    const manager = await prisma.user.findUnique({ where: { id: managerId } });
    if (!manager) throw new CapabilityValidationError('项目负责人不存在');

    await prisma.project.create({
      data: {
        name: input.name!,
        productLine: input.productLine!,
        status: input.status ?? 'IN_PROGRESS',
        priority: input.priority ?? 'MEDIUM',
        managerId,
        startDate: input.startDate ? new Date(`${input.startDate}T00:00:00.000Z`) : null,
        endDate: input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null,
        description: input.description ?? null,
      },
    });

    const rows: AssistantDiffRow[] = [
      { key: 'name', label: '名称', before: '（空）', after: input.name! },
      { key: 'productLine', label: '产品线', before: '（空）', after: input.productLine! },
      { key: 'status', label: '状态', before: '（空）', after: STATUS_LABEL[input.status ?? 'IN_PROGRESS'] },
      { key: 'priority', label: '优先级', before: '（空）', after: PRIORITY_LABEL[input.priority ?? 'MEDIUM'] },
    ];
    return { rows, risks: [] };
  },
};
```

- [ ] **Step 4: 运行确认通过**

Run: `cd server && npx vitest run src/services/assistant/capability/projectCreate.test.ts`
Expected: PASS（6 用例）。

- [ ] **Step 5: Commit**
```bash
git add server/src/services/assistant/capability/projectCreate.ts server/src/services/assistant/capability/projectCreate.test.ts
git commit -m "feat(assistant): add project.create capability"
```

---

## Task 5: 通用编排 capabilityPropose / capabilityApply

**Files:**
- Create: `server/src/services/assistant/capability/orchestrator.ts`
- Test: `server/src/services/assistant/capability/orchestrator.test.ts`

> 参照 `server/src/services/assistant/orchestrator.ts` 顶部 import 与 `runPropose`（约行 104-145）中 `callAi`/`aiCircuitBreaker` 的用法。本文件在 `capability/` 子目录，工具 import 多一层：`../../../utils/aiClient`、`../../../utils/circuitBreaker`、`../../../utils/logger`。

- [ ] **Step 1: 写失败测试**

Create `server/src/services/assistant/capability/orchestrator.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCallAi } = vi.hoisted(() => ({ mockCallAi: vi.fn() }));
vi.mock('../../../utils/aiClient', () => ({ callAi: mockCallAi }));
vi.mock('../../../utils/circuitBreaker', () => ({ aiCircuitBreaker: { execute: (fn: () => unknown) => fn() } }));

import { capabilityPropose, capabilityApply } from './orchestrator';
import { registerCapability, __resetCapabilities } from './registry';
import { projectCreateCapability } from './projectCreate';
import { proposalStore } from '../proposalStore';
import type { CapabilityContext } from './types';

const ctx: CapabilityContext = { userId: 'u1', userName: '张三', permissions: ['project:create'], projects: [] };

beforeEach(() => {
  vi.clearAllMocks();
  __resetCapabilities();
  proposalStore.__reset();
  registerCapability(projectCreateCapability);
});

describe('capabilityPropose', () => {
  it('齐全 → ok + 预览', async () => {
    mockCallAi.mockResolvedValue({ content: '{"name":"项目甲","productLine":"蒲公英"}' });
    const r = await capabilityPropose('project.create', '建个项目甲，产品线蒲公英', ctx);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.preview.rows.find((x) => x.key === 'name')?.after).toBe('项目甲');
      expect(proposalStore.get(r.proposalId)?.capabilityName).toBe('project.create');
    }
  });

  it('缺必填 → need_input + 缺失清单', async () => {
    mockCallAi.mockResolvedValue({ content: '{"productLine":"蒲公英"}' });
    const r = await capabilityPropose('project.create', '帮我建个新项目', ctx);
    expect(r.status).toBe('need_input');
    if (r.status === 'need_input') expect(r.missing).toContain('项目名称');
  });

  it('LLM 不可用 → ai_unavailable', async () => {
    mockCallAi.mockResolvedValue(null);
    const r = await capabilityPropose('project.create', 'x', ctx);
    expect(r.status).toBe('ai_unavailable');
  });

  it('非法枚举 → not_understood', async () => {
    mockCallAi.mockResolvedValue({ content: '{"name":"甲","productLine":"蒲公英","priority":"WRONG"}' });
    const r = await capabilityPropose('project.create', 'x', ctx);
    expect(r.status).toBe('not_understood');
  });
});

describe('capabilityApply', () => {
  it('apply 调 execute 并标记 applied', async () => {
    mockCallAi.mockResolvedValue({ content: '{"name":"项目甲","productLine":"蒲公英"}' });
    const r = await capabilityPropose('project.create', '建个项目甲，产品线蒲公英', ctx);
    if (r.status !== 'ok') throw new Error('expected ok');
    const spy = vi.spyOn(projectCreateCapability, 'execute').mockResolvedValue({ rows: [{ key: 'name', label: '名称', before: '（空）', after: '项目甲' }], risks: [] });
    const out = await capabilityApply(r.proposalId, ctx, {} as never);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(out.rows[0].after).toBe('项目甲');
    expect(proposalStore.get(r.proposalId)?.applied).toBeTruthy();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd server && npx vitest run src/services/assistant/capability/orchestrator.test.ts`
Expected: FAIL —「Cannot find module './orchestrator'」。

- [ ] **Step 3: 实现编排**

Create `server/src/services/assistant/capability/orchestrator.ts`:
```ts
import crypto from 'crypto';
import type { Request } from 'express';
import { callAi } from '../../../utils/aiClient';
import { aiCircuitBreaker } from '../../../utils/circuitBreaker';
import { logger } from '../../../utils/logger';
import { auditLog } from '../../../utils/auditLog'; // 与 assistant/orchestrator.ts 同一审计入口
import type { AssistantPreview, AssistantDiffRow, AssistantRisk } from '../types';
import { proposalStore } from '../proposalStore';
import { getCapability } from './registry';
import { genericPreview } from './genericPreview';
import type { CapabilityContext } from './types';

export type CapabilityProposeOutcome =
  | { status: 'ok'; proposalId: string; preview: AssistantPreview; narrative: string }
  | { status: 'need_input'; missing: string[] }
  | { status: 'noop' }
  | { status: 'not_understood' }
  | { status: 'ai_unavailable' }
  | { status: 'unknown_capability' };

function extractJson(raw: string): unknown | null {
  let s = raw.trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) s = fenced[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export async function capabilityPropose(
  capabilityName: string,
  utterance: string,
  ctx: CapabilityContext
): Promise<CapabilityProposeOutcome> {
  const cap = getCapability(capabilityName);
  if (!cap) return { status: 'unknown_capability' };

  // LLM 边缘：填参
  const prompt = cap.buildPrompt(utterance, ctx);
  let content: string | null = null;
  try {
    const res = await aiCircuitBreaker.execute(() =>
      callAi({ feature: 'assistant', systemPrompt: prompt.system, userPrompt: prompt.user, temperature: 0 })
    );
    content = res?.content ?? null;
  } catch (err) {
    logger.warn({ err, capabilityName }, '能力填参 AI 调用失败');
    return { status: 'ai_unavailable' };
  }
  if (!content) return { status: 'ai_unavailable' };

  const raw = extractJson(content);
  if (raw == null) return { status: 'not_understood' };
  const parsed = cap.inputSchema.safeParse(raw);
  if (!parsed.success) {
    logger.info({ capabilityName, issues: parsed.error.issues.map((i) => i.message) }, '能力参数未通过校验');
    return { status: 'not_understood' };
  }

  // 缺失必填 → 追问（一次性，无跨轮记忆）
  const missing = cap.missingRequired ? cap.missingRequired(parsed.data, ctx) : [];
  if (missing.length > 0) return { status: 'need_input', missing };

  const input = cap.applyDefaults ? cap.applyDefaults(parsed.data, ctx) : parsed.data;

  // create 无目标实体；update/delete 在此 loadEntity（首发不涉及）
  const preview: AssistantPreview = cap.buildPreview
    ? cap.buildPreview(input, undefined, ctx)
    : genericPreview(cap.mode, input as Record<string, unknown>, undefined, { labels: cap.previewLabels, display: cap.previewDisplay ? (k, v) => cap.previewDisplay!(k, v, ctx) : undefined }, ctx);
  if (preview.rows.length === 0) return { status: 'noop' };

  const narrative = `将${cap.description.replace(/。.*/, '')}：共 ${preview.rows.length} 项。`;
  const proposalId = crypto.randomUUID();
  const fingerprint = crypto.createHash('sha256').update(capabilityName + JSON.stringify(input)).digest('hex').slice(0, 16);
  proposalStore.set(proposalId, {
    domain: 'capability',
    targetId: '__new__',
    capabilityName,
    args: input,
    rawUtterance: utterance,
    intent: null,
    fingerprint,
    createdAt: Date.now(),
  });
  return { status: 'ok', proposalId, preview, narrative };
}

export async function capabilityApply(
  proposalId: string,
  ctx: CapabilityContext,
  req: Request
): Promise<{ rows: AssistantDiffRow[]; risks: AssistantRisk[] }> {
  const cached = proposalStore.get(proposalId);
  if (!cached || !cached.capabilityName) throw new Error('PROPOSAL_NOT_FOUND');
  if (cached.applied) return { rows: cached.applied.rows, risks: cached.applied.risks };
  const cap = getCapability(cached.capabilityName);
  if (!cap) throw new Error('UNKNOWN_CAPABILITY');

  const result = await cap.execute(cached.args as never, ctx, req);

  await auditLog({
    req,
    action: 'CREATE',
    resourceType: 'assistant',
    resourceId: proposalId,
    resourceName: `能力应用：${cached.capabilityName}`,
    changes: {
      rawUtterance: { from: null, to: cached.rawUtterance },
      args: { from: null, to: cached.args as unknown },
      appliedDiff: { from: null, to: result.rows as unknown },
    },
  });

  proposalStore.markApplied(proposalId, { at: Date.now(), rows: result.rows, risks: result.risks });
  return result;
}
```

> import 路径与 `assistant/orchestrator.ts` 顶部一致，本文件在 `capability/` 子目录深一层故用 `../../../utils/...`：`callAi`←`utils/aiClient`、`aiCircuitBreaker`←`utils/circuitBreaker`、`auditLog`←`utils/auditLog`、`logger`←`utils/logger`。`callAi`（`{feature,systemPrompt,userPrompt,temperature}`→`{content}`）与 `auditLog` 的调用形状照搬 `orchestrator.ts` 的 runPropose/runApply，`auditLog` 仅 `action` 改 `'CREATE'`。

- [ ] **Step 4: 运行确认通过**

Run: `cd server && npx vitest run src/services/assistant/capability/orchestrator.test.ts`
Expected: PASS（5 用例）。

- [ ] **Step 5: Commit**
```bash
git add server/src/services/assistant/capability/orchestrator.ts server/src/services/assistant/capability/orchestrator.test.ts
git commit -m "feat(assistant): add capability propose/apply orchestration"
```

---

## Task 6: bootstrap 注册 + 路由集成

**Files:**
- Create: `server/src/services/assistant/capability/bootstrap.ts`
- Modify: `server/src/routes/assistant.ts`

- [ ] **Step 1: 写 bootstrap**

Create `server/src/services/assistant/capability/bootstrap.ts`:
```ts
import { registerCapability } from './registry';
import { projectCreateCapability } from './projectCreate';

registerCapability(projectCreateCapability);
```

- [ ] **Step 2: 路由集成 — 引入 + 分类 options**

In `server/src/routes/assistant.ts`:

(a) 顶部加 import（紧跟现有 capability 无关 import 之后）：
```ts
import '../services/assistant/capability/bootstrap'; // 触发能力注册
import { listCapabilitiesForUser, getCapability } from '../services/assistant/capability/registry';
import { capabilityPropose, capabilityApply } from '../services/assistant/capability/orchestrator';
```

(b) 把分类 options 加入 capabilities（替换现有 `domainOptions` 一行，约 line 72）：
```ts
const userCaps = listCapabilitiesForUser(req.user?.permissions || []);
const domainOptions = [
  ...listAdapters().map((a) => ({ key: a.domain, description: a.description })),
  ...userCaps.map((c) => ({ key: c.name, description: c.description })),
  QUERY_DOMAIN,
];
```

(c) 在 `const isQuery = domain === QUERY_DOMAIN.key;`（约 line 90）之后、`manageable` 查询之后，加入 capability 分流。把现有「写领域」分支前插入：
```ts
// 能力分支：命中某个 Capability（如 project.create）。新建类不需要 targetId，跳过项目定位。
const capability = getCapability(domain);
if (capability) {
  const capCtx = {
    userId: req.user!.id,
    userName: req.user?.realName || req.user?.username || '我',
    permissions: req.user?.permissions || [],
    contextProjectId,
    projects: manageable,
  };
  const out = await capabilityPropose(domain, utterance, capCtx);
  switch (out.status) {
    case 'ai_unavailable':
      res.status(503).json({ error: 'AI_UNAVAILABLE', message: 'AI 助手暂不可用，请手动操作' });
      return;
    case 'unknown_capability':
      res.status(400).json({ error: 'UNKNOWN_DOMAIN', message: `未知能力：${domain}` });
      return;
    case 'need_input':
      reply({ proposalId: null, noOp: true, mode: 'need_input', missing: out.missing, preview: { rows: [], risks: [] }, narrative: `还需要补充：${out.missing.join('、')}` });
      return;
    case 'not_understood':
      reply({ proposalId: null, noOp: true, preview: { rows: [], risks: [] }, narrative: '没听懂这句话，请换个更明确的说法。' });
      return;
    case 'noop':
      reply({ proposalId: null, noOp: true, preview: { rows: [], risks: [] }, narrative: '没有可执行的改动。' });
      return;
    case 'ok':
      reply({ proposalId: out.proposalId, noOp: false, domain, preview: out.preview, narrative: out.narrative });
      return;
  }
}
```
> 注意：该 capability 分支要放在 `isQuery` 分支之后、现有 `const adapter = getAdapter(domain)` 写领域分支之前——这样 query/capability/adapter 三者互斥分流。capability 分支**不**调用 `resolveProjectTarget`。

(d) apply 路由分发（约 line 196-198）：把 `const result = await runApply(proposalId, req);` 替换为：
```ts
const cached = proposalStore.get(proposalId);
let result;
if (cached?.capabilityName) {
  const capCtx = {
    userId: req.user!.id,
    userName: req.user?.realName || req.user?.username || '我',
    permissions: req.user?.permissions || [],
    contextProjectId: null,
    projects: [],
  };
  result = await capabilityApply(proposalId, capCtx, req);
} else {
  result = await runApply(proposalId, req);
}
```
并在文件顶部 import：`import { proposalStore } from '../services/assistant/proposalStore';`。capabilityApply 抛的 `'PROPOSAL_NOT_FOUND'` 是普通 Error，会落到 500——可接受（MVP）；如需精确 404，可在 catch 里按 `error.message` 映射（可选，本计划不强制）。

- [ ] **Step 3: typecheck + 现有 assistant 测试不破**

Run: `cd server && npx tsc --noEmit && npx vitest run src/routes/assistant.test.ts src/services/assistant`
Expected: tsc 0 error；现有助手测试 + 新能力测试全绿。

- [ ] **Step 4: Commit**
```bash
git add server/src/services/assistant/capability/bootstrap.ts server/src/routes/assistant.ts
git commit -m "feat(assistant): wire capabilities into propose/apply routing"
```

---

## Task 7: 前端 need_input 气泡

**Files:**
- Modify: `client/src/types/index.ts`
- Modify: `client/src/hooks/useAssistantChat.ts`
- Test: `client/src/hooks/useAssistantChat.test.tsx`
- Modify: `client/src/pages/Home/MessageList.tsx`

- [ ] **Step 1: 类型加 variant**

In `client/src/types/index.ts`，把 `AssistantMessage` 的 status 成员 variant 联合（`'ai_unavailable' | 'noop' | 'need_target' | 'error'`）加上 `'need_input'`：
```ts
      variant: 'ai_unavailable' | 'noop' | 'need_target' | 'error' | 'need_input';
```
并在 `AssistantProposeResult` 接口加可选字段：
```ts
  /** 缺失必填项（mode==='need_input' 时有值） */
  missing?: string[];
```
并把 `AssistantProposeResult` 的 `mode?: 'answer'` 改为 `mode?: 'answer' | 'need_input'`。

- [ ] **Step 2: 写 hook 失败测试**

Append to `client/src/hooks/useAssistantChat.test.tsx`（在现有 describe 内加一例）：
```ts
  it('send maps need_input to a status message listing missing fields', async () => {
    mockPropose.mockResolvedValue({ data: { proposalId: null, noOp: true, mode: 'need_input', missing: ['项目名称', '产品线'], preview: { rows: [], risks: [] }, narrative: '还需要补充：项目名称、产品线' } });
    const { result } = renderHook(() => useAssistantChat());
    await act(async () => {
      await result.current.send('帮我建个新项目', null);
    });
    expect(useAssistantChatStore.getState().messages.at(-1)).toMatchObject({ kind: 'status', variant: 'need_input', text: '还需要补充：项目名称、产品线' });
  });
```

- [ ] **Step 3: 运行确认失败**

Run: `cd client && npx vitest run src/hooks/useAssistantChat.test.tsx`
Expected: FAIL（need_input 当前被映射成 noop/其它）。

- [ ] **Step 4: hook 映射 need_input**

In `client/src/hooks/useAssistantChat.ts` 的 `toAssistantDraft`，在 answer 判断之后、proposal 判断之前加入：
```ts
  if (r.mode === 'need_input') {
    return { role: 'assistant', kind: 'status', variant: 'need_input', text: r.narrative || `还需要补充：${(r.missing ?? []).join('、')}` };
  }
```

- [ ] **Step 5: 运行确认通过**

Run: `cd client && npx vitest run src/hooks/useAssistantChat.test.tsx`
Expected: PASS。

- [ ] **Step 6: MessageList 渲染 need_input（复用 status 气泡，加待补充徽标）**

In `client/src/pages/Home/MessageList.tsx` 的 status 分支，把纯文本气泡改为按 variant 区分（need_input 用琥珀色边框提示）：
```tsx
      // status
      return (
        <div
          key={m.id}
          className={
            m.variant === 'need_input'
              ? 'rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
              : 'text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm'
          }
        >
          {m.text}
        </div>
      );
```

- [ ] **Step 7: typecheck + lint + 前端测试**

Run: `cd client && npx tsc --noEmit && npx vitest run src/hooks src/pages/Home && cd .. && npm run lint`
Expected: 0 error，0 warning，测试全绿。

- [ ] **Step 8: Commit**
```bash
git add client/src/types/index.ts client/src/hooks/useAssistantChat.ts client/src/hooks/useAssistantChat.test.tsx client/src/pages/Home/MessageList.tsx
git commit -m "feat(assistant): render need_input prompt bubble on homepage chat"
```

---

## Task 8: 端到端验证

- [ ] **Step 1: 后端 typecheck + 全量后端测试**

Run: `cd server && npx tsc --noEmit && npm test`
Expected: 0 error；全绿（含新增 capability 测试 + 现有助手测试不破）。

- [ ] **Step 2: 前端 typecheck + lint + 单测**

Run: `cd client && npx tsc --noEmit && npx vitest run && cd .. && npm run lint`
Expected: 0 error，0 warning，全绿。

- [ ] **Step 3: 手动端到端（dev server）**

Run: `npm run dev`，登录后在首页聊天框依次验证（对照 `00-design.md` §10）：
1. 「帮我建个项目试点甲，产品线蒲公英」→ 出现「新建项目」改动预览（名称/产品线/状态/优先级/负责人=我）→ 确认应用 → 项目列表出现该项目。
2. 「帮我建个新项目」（不给名）→ 琥珀色「还需要补充：项目名称、产品线」气泡，不创建。
3. 用一个**无 `project:create` 权限**的账号说「建个项目」→ 仍回「没听懂」（该能力不在其清单）。
4. 现有功能不变：「把某项目优先级改成高」「某项目有几个高风险」仍正常。

- [ ] **Step 4: 最终提交（如手测发现微调）**
```bash
git add -A
git commit -m "polish(assistant): capability registry e2e tweaks"
```

---

## 自检：spec 覆盖对照

| `00-design.md` 要求 | 对应任务 |
|---|---|
| Capability 接口（mode/inputSchema/permission/danger/buildPreview/execute…） | Task 1 |
| 注册表 + 权限过滤（能力边界=权限） | Task 1 |
| 通用 diff（create/update/delete） | Task 2 |
| proposalStore 承载 capability 提议 | Task 3 |
| project.create 首发（必填 name+产品线、负责人默认当前用户、复用创建写入） | Task 4 |
| 通用编排（LLM 填参〔边缘〕→Zod→need_input→diff→确认→execute）+ 创建型摩擦松绑（无 targetId/不查实体/intent 哈希 fingerprint） | Task 5 |
| 路由集成（classifier options 纳入 capabilities；capability 跳过 resolveProjectTarget；apply 分发）+ 共存不动现有 | Task 6 |
| need_input 一次性追问（前端气泡） | Task 7 |
| 安全模型五条（边缘/确认/现有路径/Zod+白名单/审计） | Task 4(execute) + Task 5(审计/Zod) + Task 6(确认沿用现有 apply 流程) |
| 验收标准全项 | Task 8 |
