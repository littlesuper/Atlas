# Phase 2 · PR1 能力层骨架升级 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给能力层补齐「作用于已有实体（update/custom）+ 引用 id 白名单 + 自定义解析 + 指纹并发复核 + LLM 叙述」骨架，使后续 activity.create / 三领域迁移可零阻力接入；现有 `project.create` 行为不变。

**Architecture:** 只改 `capability/types.ts`（接口扩展，全部向后兼容）+ `capability/orchestrator.ts`（重写 `capabilityPropose`/`capabilityApply`）+ `routes/assistant.ts`（处理新结局 `need_target`）。`target:'project'` 类能力在 propose 时复用现有 `resolveProjectTarget` 定位项目并 `loadEntity`，apply 时重载实体 + 指纹复核（不符抛 `VersionMismatchError`/409）。

**Tech Stack:** TypeScript + Express + Zod + Vitest；复用 `assistant/targetResolver.ts`、`assistant/orchestrator.ts` 的错误类、`utils/aiClient`/`circuitBreaker`/`auditLog`。

**工作目录：** `/Users/xbot03/PlayCode/Atlas-cap`（分支 `feat/ai-capability-expansion`）。提交只 `git add` 本计划列出的文件，**切勿 `git add -A`**。

**参考规格：** `docs/specs/ai-capability-registry/02-phase2-design.md` §3。

---

## 背景：相关现有代码（实现者必读）

- `capability/types.ts`：`Capability` 接口 + `CapabilityContext` + `EntitySnapshot`。本 PR 向其**新增可选成员**，不动既有成员。
- `capability/orchestrator.ts`：Phase 1 版只支持 create（无目标/无引用校验/无指纹复核/确定性叙述）。本 PR 整体重写。
- `assistant/targetResolver.ts`：`resolveProjectTarget({utterance, projects, contextProjectId})` → `{status:'ok',projectId}|{status:'unresolved'}|{status:'ai_unavailable'}`；内部先确定性 `matchProjectByName`（话里含项目名即命中，免 LLM），不中再走 LLM。
- `assistant/orchestrator.ts`：导出错误类 `VersionMismatchError`、`TargetNotFoundError`、`ProposalNotFoundError`（本 PR 复用，PR4 再迁移）。
- `assistant/proposalStore.ts`：`StoredProposal` 已含可选 `capabilityName?`/`args?` 和 `targetId`/`fingerprint`/`userId`。
- `routes/assistant.ts`：`/propose` 的能力分支在 lines 132-162（`switch(out.status)`）；`/apply` 的 catch 已映射 `VersionMismatchError`→409、`TargetNotFoundError`→404、`ProposalNotFoundError`→404。

---

## Task 1: 扩展 Capability 类型（向后兼容，纯增量）

**Files:**
- Modify: `server/src/services/assistant/capability/types.ts`
- Test: `server/src/services/assistant/capability/orchestrator.test.ts`（既有，仅用于验证仍编译/通过）

- [ ] **Step 1: 给 `CapabilityContext` 增加可选 `roles`**

把 `types.ts` 中 `CapabilityContext` 接口改为（新增最后一行）：

```ts
export interface CapabilityContext {
  userId: string;
  userName: string;
  permissions: string[];
  contextProjectId?: string | null;
  projects: { id: string; name: string }[]; // 该用户权限可见的项目（id 白名单/默认值用）
  roles?: { id: string; name: string }[]; // 角色名解析/展示（activity.create 等用）；未提供视为空
}
```

- [ ] **Step 2: 新增 `CapabilityParseResult` 类型**

在 `types.ts` 中 `export type CapabilityMode = ...` 一行之后插入：

```ts
export type CapabilityParseResult<TInput> =
  | { ok: true; input: TInput }
  | { ok: false; kind: 'not_understood' | 'fabricated' };
```

- [ ] **Step 3: 给 `Capability` 接口新增 4 个可选成员**

在 `Capability` 接口里、`loadEntity?` 一行**之前**插入：

```ts
  /** 'project' = 作用于某个项目的 update/custom 能力：编排会 resolveProjectTarget + loadEntity。
   *  缺省 = create 类，无目标实体（projectId 等以输入字段形式出现，经 validateRefs 白名单）。 */
  target?: 'project';
  /** 默认解析管线（extractJson → inputSchema → validateRefs）中的引用 id 白名单钩子。
   *  target 类能力会收到 loadEntity 得到的 entity（如 risk.update 用它校验 riskItemId）。 */
  validateRefs?(input: TInput, ctx: CapabilityContext, entity?: EntitySnapshot):
    | { ok: true }
    | { ok: false; fabricated: string[] };
  /** 复杂解析能力整体接管解析；提供则跳过默认管线（inputSchema/validateRefs 不再调用）。 */
  parseArgs?(rawLLM: string, ctx: CapabilityContext, entity?: EntitySnapshot): CapabilityParseResult<TInput>;
  /** 自定义叙述 user prompt；提供则触发 LLM 复述，缺省走确定性叙述。 */
  narrate?(preview: AssistantPreview): string;
```

- [ ] **Step 4: 给 `execute` 增加可选第 4 参 `target`**

把 `Capability` 接口里现有的 `execute(...)` 一行替换为：

```ts
  /** 写入：调现有 service/prisma（自带校验+审计语义）。target 类能力额外收到新鲜目标 {id, entity}。 */
  execute(
    input: TInput,
    ctx: CapabilityContext,
    req: Request,
    target?: { id: string; entity: EntitySnapshot }
  ): Promise<{ rows: AssistantDiffRow[]; risks: AssistantRisk[] }>;
```

- [ ] **Step 5: 验证类型编译且既有能力测试仍通过**

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx vitest run src/services/assistant/capability/`
Expected: PASS（全部既有用例绿；新增字段均可选，`projectCreate`/`genericPreview`/`registry`/`orchestrator` 测试不受影响）。

- [ ] **Step 6: Commit**

```bash
cd /Users/xbot03/PlayCode/Atlas-cap
git add server/src/services/assistant/capability/types.ts
git commit -m "feat(capability): extend Capability with target/validateRefs/parseArgs/narrate + roles ctx

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 重写 capability orchestrator（目标定位 + 解析管线 + 指纹复核 + 叙述）

**Files:**
- Modify: `server/src/services/assistant/capability/orchestrator.ts`（整体替换）
- Test: `server/src/services/assistant/capability/orchestrator.test.ts`（追加新 describe 块）

- [ ] **Step 1: 先写新增的失败测试**

把下面这段**追加**到 `orchestrator.test.ts` 文件末尾（保留文件顶部既有 import 与既有 describe 块）。它需要顶部已有的 `mockCallAi` mock。先在文件顶部 import 区补三行 import：

在 `import type { CapabilityContext } from './types';` 之后加：

```ts
import { z } from 'zod';
import type { Capability, EntitySnapshot } from './types';
import { VersionMismatchError } from '../orchestrator';
```

然后在文件末尾追加：

```ts
// —— PR1 骨架：target 类能力（目标定位 + 指纹复核 + 引用校验 + 自定义解析 + 叙述） ——
const targetCtx: CapabilityContext = {
  userId: 'u1', userName: '张三', permissions: ['x:update'],
  projects: [{ id: 'p1', name: '甲项目' }],
};

let fakeFp = 'fp1';
const fakeUpdateCap: Capability = {
  name: 'fake.update',
  description: '改测试实体的值。',
  permission: { resource: 'x', action: 'update' },
  mode: 'update',
  target: 'project',
  inputSchema: z.object({ value: z.string().optional() }),
  buildPrompt: () => ({ system: 's', user: 'u' }),
  loadEntity: async (id) => ({ id, fingerprint: fakeFp, fields: { value: 'old' } }) as EntitySnapshot,
  fingerprint: (e) => e?.fingerprint ?? '',
  buildPreview: (input) => ({
    rows: [{ key: 'value', label: '值', before: 'old', after: String((input as { value?: string }).value ?? '') }],
    risks: [],
  }),
  execute: async () => ({ rows: [{ key: 'value', label: '值', before: 'old', after: 'new' }], risks: [] }),
};

describe('capabilityPropose · target 类', () => {
  beforeEach(() => { fakeFp = 'fp1'; registerCapability(fakeUpdateCap); });

  it('话里点名项目 → 确定性定位 + loadEntity + 出预览', async () => {
    mockCallAi.mockResolvedValue({ content: '{"value":"new"}' });
    const r = await capabilityPropose('fake.update', '把甲项目的值改成 new', targetCtx);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.preview.rows[0].after).toBe('new');
      expect(proposalStore.get(r.proposalId)?.targetId).toBe('p1');
      expect(proposalStore.get(r.proposalId)?.fingerprint).toBe('fp1');
    }
  });

  it('认不出项目 → need_target', async () => {
    mockCallAi.mockResolvedValue({ content: '{"value":"new"}' });
    const r = await capabilityPropose('fake.update', '把那个东西改一下', targetCtx);
    expect(r.status).toBe('need_target');
  });
});

describe('capabilityApply · 指纹复核', () => {
  beforeEach(() => { fakeFp = 'fp1'; registerCapability(fakeUpdateCap); });

  it('propose 后实体被并发改动 → apply 抛 VersionMismatchError', async () => {
    mockCallAi.mockResolvedValue({ content: '{"value":"new"}' });
    const r = await capabilityPropose('fake.update', '把甲项目的值改成 new', targetCtx);
    if (r.status !== 'ok') throw new Error('expected ok');
    fakeFp = 'fp2'; // 模拟并发改动
    await expect(capabilityApply(r.proposalId, targetCtx, {} as never)).rejects.toBeInstanceOf(VersionMismatchError);
  });
});

describe('capabilityPropose · 解析护栏', () => {
  it('validateRefs 判编造 id → not_understood', async () => {
    const refCap: Capability = {
      name: 'ref.create', description: '建带引用的东西。',
      permission: { resource: 'x', action: 'create' }, mode: 'create',
      inputSchema: z.object({ refId: z.string().optional() }),
      buildPrompt: () => ({ system: 's', user: 'u' }),
      validateRefs: (input) => {
        const id = (input as { refId?: string }).refId;
        return id === 'real' ? { ok: true } : { ok: false, fabricated: [String(id)] };
      },
      execute: async () => ({ rows: [], risks: [] }),
    };
    registerCapability(refCap);
    mockCallAi.mockResolvedValue({ content: '{"refId":"造假的"}' });
    const r = await capabilityPropose('ref.create', 'x', { ...ctx, permissions: ['x:create'] });
    expect(r.status).toBe('not_understood');
  });

  it('parseArgs 接管解析（绕过 inputSchema）→ ok', async () => {
    const customCap: Capability = {
      name: 'custom.create', description: '自定义解析。',
      permission: { resource: 'x', action: 'create' }, mode: 'create',
      inputSchema: z.object({}),
      buildPrompt: () => ({ system: 's', user: 'u' }),
      parseArgs: (raw) => (raw.includes('好') ? { ok: true, input: { v: 1 } } : { ok: false, kind: 'not_understood' }),
      buildPreview: () => ({ rows: [{ key: 'v', label: 'V', before: '（空）', after: '1' }], risks: [] }),
      execute: async () => ({ rows: [], risks: [] }),
    };
    registerCapability(customCap);
    mockCallAi.mockResolvedValue({ content: '好的' });
    const r = await capabilityPropose('custom.create', 'x', { ...ctx, permissions: ['x:create'] });
    expect(r.status).toBe('ok');
  });
});

describe('capabilityPropose · 叙述', () => {
  it('能力带 narrate → 走 LLM 复述', async () => {
    const narrateCap: Capability = {
      name: 'narr.create', description: '带叙述。',
      permission: { resource: 'x', action: 'create' }, mode: 'create',
      inputSchema: z.object({ a: z.string().optional() }),
      buildPrompt: () => ({ system: 's', user: 'u' }),
      narrate: () => '请复述：值已设置',
      buildPreview: () => ({ rows: [{ key: 'a', label: 'A', before: '（空）', after: 'x' }], risks: [] }),
      execute: async () => ({ rows: [], risks: [] }),
    };
    registerCapability(narrateCap);
    mockCallAi
      .mockResolvedValueOnce({ content: '{"a":"x"}' }) // 填参
      .mockResolvedValueOnce({ content: '值已设置。' }); // 叙述
    const r = await capabilityPropose('narr.create', 'x', { ...ctx, permissions: ['x:create'] });
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.narrative).toBe('值已设置。');
    expect(mockCallAi).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx vitest run src/services/assistant/capability/orchestrator.test.ts`
Expected: 新增用例 FAIL（现版 orchestrator 无 target/need_target/指纹复核/narrate/parseArgs/validateRefs 支持；`need_target` 不是合法 status，`VersionMismatchError` 不会被抛出）。既有用例仍 PASS。

- [ ] **Step 3: 用下面完整内容替换 `capability/orchestrator.ts`**

```ts
import crypto from 'crypto';
import type { Request } from 'express';
import { callAi } from '../../../utils/aiClient';
import { aiCircuitBreaker } from '../../../utils/circuitBreaker';
import { logger } from '../../../utils/logger';
import { auditLog } from '../../../utils/auditLog';
import { resolveProjectTarget } from '../targetResolver';
import { VersionMismatchError, TargetNotFoundError, ProposalNotFoundError } from '../orchestrator';
import type { AssistantPreview, AssistantDiffRow, AssistantRisk } from '../types';
import { proposalStore } from '../proposalStore';
import { getCapability } from './registry';
import { genericPreview } from './genericPreview';
import type { Capability, CapabilityContext, EntitySnapshot } from './types';

export type CapabilityProposeOutcome =
  | { status: 'ok'; proposalId: string; preview: AssistantPreview; narrative: string }
  | { status: 'need_input'; missing: string[]; partialArgs: Record<string, unknown> }
  | { status: 'need_target' }
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

const NARRATE_SYSTEM = `你是项目管理系统的"改动复述助手"。系统已用确定性代码算好一次改动的"改动清单"和"风险清单"，你只需用一段简洁中文复述给用户。
铁律：只复述给你的内容，不得新增任何事实、数字、日期、风险或建议；改动为空就说"无改动"，风险为空就说"未发现风险"。2-4 句，朴实，不要 markdown。`;

/** 通用叙述 user prompt（供能力在 narrate 钩子里复用，等价旧 adapter 的通用叙述） */
export function genericNarrateUserPrompt(preview: AssistantPreview): string {
  const lines: string[] = ['## 改动清单'];
  if (preview.rows.length === 0) lines.push('（无改动）');
  else for (const r of preview.rows) lines.push(`- ${r.label}：${r.before} → ${r.after}`);
  lines.push('', '## 风险清单');
  if (preview.risks.length === 0) lines.push('（无风险）');
  else for (const r of preview.risks) lines.push(`- ${r.text}`);
  lines.push('', '请用 2-4 句中文复述，不要新增任何信息。');
  return lines.join('\n');
}

async function llmNarrate(userPrompt: string): Promise<string> {
  try {
    const res = await aiCircuitBreaker.execute(() =>
      callAi({ feature: 'assistant', label: 'narrate', systemPrompt: NARRATE_SYSTEM, userPrompt, temperature: 0.2 })
    );
    return res?.content?.trim() ?? '';
  } catch (e) {
    logger.warn({ err: e }, '能力叙述生成失败，降级为结构化预览');
    return '';
  }
}

function deterministicNarrative(cap: Capability, preview: AssistantPreview): string {
  return `将${cap.description.replace(/。.*/, '')}：共 ${preview.rows.length} 项。`;
}

/** 默认解析管线：extractJson → inputSchema → validateRefs。parseArgs 存在则整体接管。 */
function parseInput(
  cap: Capability,
  rawLLM: string,
  ctx: CapabilityContext,
  entity: EntitySnapshot | undefined
): { ok: true; input: Record<string, unknown> } | { ok: false } {
  if (cap.parseArgs) {
    const r = cap.parseArgs(rawLLM, ctx, entity);
    return r.ok ? { ok: true, input: r.input as Record<string, unknown> } : { ok: false };
  }
  const raw = extractJson(rawLLM);
  if (raw == null) return { ok: false };
  const parsed = cap.inputSchema.safeParse(raw);
  if (!parsed.success) {
    logger.info({ capabilityName: cap.name, issues: parsed.error.issues.map((i) => i.message) }, '能力参数未通过校验');
    return { ok: false };
  }
  if (cap.validateRefs) {
    const v = cap.validateRefs(parsed.data, ctx, entity);
    if (!v.ok) {
      logger.info({ capabilityName: cap.name, fabricated: v.fabricated }, '能力引用 id 未通过白名单');
      return { ok: false };
    }
  }
  return { ok: true, input: parsed.data as Record<string, unknown> };
}

export async function capabilityPropose(
  capabilityName: string,
  utterance: string,
  ctx: CapabilityContext
): Promise<CapabilityProposeOutcome> {
  const cap = getCapability(capabilityName);
  if (!cap) return { status: 'unknown_capability' };

  // 目标定位（仅 target 类）：resolveProjectTarget → loadEntity
  let targetId = '__new__';
  let entity: EntitySnapshot | undefined;
  if (cap.target === 'project') {
    const t = await resolveProjectTarget({ utterance, projects: ctx.projects, contextProjectId: ctx.contextProjectId });
    if (t.status === 'ai_unavailable') return { status: 'ai_unavailable' };
    if (t.status === 'unresolved') return { status: 'need_target' };
    targetId = t.projectId;
    const loaded = cap.loadEntity ? await cap.loadEntity(targetId, ctx) : null;
    if (!loaded) return { status: 'need_target' };
    entity = loaded;
  }

  // LLM 边缘：填参
  const prompt = cap.buildPrompt(utterance, ctx);
  let content: string | null = null;
  try {
    const res = await aiCircuitBreaker.execute(() =>
      callAi({ feature: 'assistant', label: 'intent', systemPrompt: prompt.system, userPrompt: prompt.user, temperature: 0 })
    );
    content = res?.content ?? null;
  } catch (err) {
    logger.warn({ err, capabilityName }, '能力填参 AI 调用失败');
    return { status: 'ai_unavailable' };
  }
  if (!content) return { status: 'ai_unavailable' };

  const parsed = parseInput(cap, content, ctx, entity);
  if (!parsed.ok) return { status: 'not_understood' };

  // 缺失必填 → 追问（PR1 一次性；PR3 接入跨轮记忆）
  const missing = cap.missingRequired ? cap.missingRequired(parsed.input as never, ctx) : [];
  if (missing.length > 0) return { status: 'need_input', missing, partialArgs: parsed.input };

  const input = (cap.applyDefaults ? cap.applyDefaults(parsed.input as never, ctx) : parsed.input) as Record<string, unknown>;

  const preview: AssistantPreview = cap.buildPreview
    ? cap.buildPreview(input as never, entity, ctx)
    : genericPreview(
        cap.mode,
        input,
        entity,
        { labels: cap.previewLabels, display: cap.previewDisplay ? (k, v) => cap.previewDisplay!(k, v, ctx) : undefined },
        ctx
      );
  if (preview.rows.length === 0) return { status: 'noop' };

  const narrative = cap.narrate ? await llmNarrate(cap.narrate(preview)) : deterministicNarrative(cap, preview);

  const proposalId = crypto.randomUUID();
  const fingerprint =
    cap.target === 'project' && cap.fingerprint
      ? cap.fingerprint(entity)
      : crypto.createHash('sha256').update(capabilityName + JSON.stringify(input)).digest('hex').slice(0, 16);
  proposalStore.set(proposalId, {
    domain: 'capability',
    targetId,
    userId: ctx.userId,
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
  if (!cached || !cached.capabilityName) throw new ProposalNotFoundError();
  if (cached.applied) return { rows: cached.applied.rows, risks: cached.applied.risks };
  const cap = getCapability(cached.capabilityName);
  if (!cap) throw new Error('UNKNOWN_CAPABILITY');

  // target 类：重载实体 + 指纹复核（并发保护）
  let target: { id: string; entity: EntitySnapshot } | undefined;
  if (cap.target === 'project') {
    const fresh = cap.loadEntity ? await cap.loadEntity(cached.targetId, ctx) : null;
    if (!fresh) throw new TargetNotFoundError();
    if (cap.fingerprint && cap.fingerprint(fresh) !== cached.fingerprint) throw new VersionMismatchError();
    target = { id: cached.targetId, entity: fresh };
  }

  const result = await cap.execute(cached.args as never, ctx, req, target);

  await auditLog({
    req,
    action: cap.mode === 'create' ? 'CREATE' : 'UPDATE',
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

- [ ] **Step 4: 跑测试确认全绿**

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx vitest run src/services/assistant/capability/orchestrator.test.ts`
Expected: PASS（既有 4 个 propose + 1 个 apply 用例 + 新增 target/need_target/指纹复核/validateRefs/parseArgs/narrate 用例全绿）。

- [ ] **Step 5: 跑整个 capability 目录 + assistant 路由测试，确认无回归**

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx vitest run src/services/assistant/`
Expected: PASS（`project.create` 行为不变；adapter/orchestrator/route 既有测试不受影响——`capabilityApply` 现抛 `ProposalNotFoundError` 而非裸 `Error`，是更正确的行为，路由 catch 已支持）。

- [ ] **Step 6: Commit**

```bash
cd /Users/xbot03/PlayCode/Atlas-cap
git add server/src/services/assistant/capability/orchestrator.ts server/src/services/assistant/capability/orchestrator.test.ts
git commit -m "feat(capability): target resolution + fingerprint recheck + parse pipeline + narrate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 路由处理 need_target 结局

**Files:**
- Modify: `server/src/routes/assistant.ts`（能力分支 `switch(out.status)`，约 lines 142-161）
- Test: `server/src/routes/assistant.test.ts`（既有，验证不回归）

- [ ] **Step 1: 在能力分支 switch 中新增 `need_target` case**

在 `routes/assistant.ts` 的能力分支里，`case 'need_input':` 之前插入下面这个 case（文案与 adapter 路径的 `needTarget` 提示一致）：

```ts
          case 'need_target':
            reply({
              proposalId: null,
              noOp: true,
              needTarget: true,
              preview: { rows: [], risks: [] },
              narrative: '没听清你指的是哪个项目，请在话里点明项目名称（例如"把『GW-X500』的硬件打样推迟两周"）。',
            });
            return;
```

> 说明：`capabilityPropose` 现在可能返回 `need_target`（当某 `target:'project'` 能力定位不到项目时）。PR1 尚无 target 类能力注册，此分支暂不会触发，但必须先接住，否则未来的 target 能力会"穿透"到下方 adapter 处理逻辑。

- [ ] **Step 2: 验证路由测试不回归**

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx vitest run src/routes/assistant.test.ts`
Expected: PASS（既有 propose/apply 用例全绿；新增 case 不影响现有路径）。

- [ ] **Step 3: Commit**

```bash
cd /Users/xbot03/PlayCode/Atlas-cap
git add server/src/routes/assistant.ts
git commit -m "feat(assistant): handle capability need_target outcome in propose route

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: PR1 收尾验证

**Files:** 无新增（验证 + 文档勾选）

- [ ] **Step 1: 自有文件 typecheck 零新增报错**

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx tsc --noEmit 2>&1 | grep -E 'services/assistant/capability|routes/assistant\.ts'`
Expected: 无输出（本 PR 改动的文件零 error）。
> 注意：`npx tsc --noEmit` 全量会显示 ~573 个**既存无关报错**（`canary*`/各 `.test.ts`），与本 PR 无关，**只看上面 grep 过滤后的本批文件**是否干净。

- [ ] **Step 2: 整个 assistant 子系统测试全绿**

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx vitest run src/services/assistant/ src/routes/assistant.test.ts`
Expected: PASS。

- [ ] **Step 3: 根目录 lint 零警告（仅本 PR 文件）**

Run: `cd /Users/xbot03/PlayCode/Atlas-cap && npx eslint server/src/services/assistant/capability/orchestrator.ts server/src/services/assistant/capability/types.ts server/src/routes/assistant.ts`
Expected: 无输出（0 error / 0 warning）。

- [ ] **Step 4: 确认 project.create 行为未变（手动核对预期）**

核对：`project.create` 无 `target`/`validateRefs`/`parseArgs`/`narrate`，因此走「无目标 + 默认解析管线 + 确定性叙述 + intent 哈希指纹」——与 Phase 1 完全一致。Task 2 Step 5 的全绿即证明。

---

## Self-Review（计划 vs 规格 §3）

- **§3.1 接口扩展**（target/validateRefs/parseArgs/narrate/roles/execute 第 4 参）→ Task 1 全覆盖。
- **§3.2 编排升级**（目标定位/need_target/解析管线/applyDefaults/preview/narrate/fingerprint/apply 重载+指纹复核/mode-aware 审计）→ Task 2 全覆盖。
- **§3.3 默认解析管线**（extractJson→safeParse→validateRefs；parseArgs 接管）→ Task 2 `parseInput`。
- **§3.4 路由 need_target**→ Task 3。（pendingId/仅 capability+query 分发是 PR3/PR4 范围，本 PR 不动。）
- **类型一致性**：`CapabilityProposeOutcome.need_input` 带 `partialArgs`（PR3 用，PR1 已就位）；`execute(input,ctx,req,target?)` 与 `capabilityApply` 调用一致；`fingerprint(entity?)` 与调用一致。
- **零行为变更**：唯一对既有路径的语义变化是 `capabilityApply` 在「找不到提议」时抛 `ProposalNotFoundError`（原抛裸 `Error`）——路由本就 catch 该类 → 404，属修正非回归。

## 后续 PR（各自单独出计划）

- **PR2** activity.create（含角色绑定）+ 抽 `createActivityCore`。
- **PR3** 多轮槽位（pendingSlotStore + 续填 + 前端 pendingId/取消）+ need_input 琥珀气泡。
- **PR4** 迁移 project.update / risk.create+update / schedule.update，删除 adapter 体系。
