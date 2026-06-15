# Phase 2 · PR3 真·多轮槽位填充 + need_input 琥珀气泡 + apply 归属/权限校验 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让缺字段的能力对话支持**跨轮记忆**：第一轮缺啥问啥并返回不透明 `pendingId`，下一轮带 `pendingId` 续填、只解析增量、合并后缺啥再问、齐了出预览；前端 need_input 用琥珀气泡 + 取消入口；并补齐能力 apply 的**归属（应用者==发起者）+ 权限**校验。

**Architecture:** 服务端 `pendingSlotStore`（短 TTL，按用户归属）持有「已填字段」；`capabilityPropose` 新增 `priorArgs` 入参，把引用白名单 `validateRefs` 移到「合并后」执行、并在续填轮给 LLM 追加「已知字段」块；propose 路由识别 `pendingId` 跳过分类、走续填，need_input 时存/刷新 pending 回 `pendingId`，其余结局清 pending。`capabilityApply` 增加 `cached.userId===ctx.userId` 归属校验与 `cap.permission` 权限校验。前端只持有不透明 `pendingId`（半成品意图绝不回流前端）。

**Tech Stack:** TypeScript + Express + Zod + Vitest（后端）；React + Zustand + Vitest/RTL（前端）。

**工作目录：** `/Users/xbot03/PlayCode/Atlas-cap`（分支 `feat/ai-capability-expansion`，已含 PR1+PR2）。提交只 `git add` 各任务列出的文件，**切勿 `git add -A`**。前端文件（尤其 `MessageList.tsx`）可能被并发改——以 worktree 当前内容为准，最小增量修改。

**参考规格：** `docs/specs/ai-capability-registry/02-phase2-design.md` §5 + §3.1 安全模型。

---

## 背景：相关现有代码（实现者必读）

- `capability/orchestrator.ts`（PR1）：`capabilityPropose(name, utterance, ctx)` 内有私有 `parseInput(cap, rawLLM, ctx, entity)`（`parseArgs` 或 `extractJson`+`safeParse`+`validateRefs`）；`need_input` 已返回 `{ missing, partialArgs }`；`capabilityApply(proposalId, ctx, req)` 做指纹复核但**无归属/权限校验**。错误类从 `../orchestrator` 复用。
- `capability/registry.ts`：私有 `hasPermission(perms, resource, action)`（本 PR 导出复用）。
- `services/assistant/proposalStore.ts`：`StoredProposal.userId?`（PR1 加）；`capabilityPropose` 已写入 `userId: ctx.userId`。
- `routes/assistant.ts`：propose 先 `classifyDomain` → query/capability/adapter 分发；capability 分支构造 `capCtx`（含 `roles`，PR2 加）调 `capabilityPropose`，`switch(out.status)` 已含 `need_input`（仅回 `missing`，无 `pendingId`）。apply 分支 catch 链已映射多种错误。
- `schemas/assistant.ts`：`assistantProposeSchema = { utterance, contextProjectId? }`。
- 前端：`api/index.ts` 的 `assistantApi.propose(utterance, contextProjectId?)`；`store/assistantChatStore.ts`（`messages` + actions，persist 仅 messages）；`hooks/useAssistantChat.ts`（`send(text, contextProjectId)` → `toAssistantDraft`）；`pages/Home/MessageList.tsx`（status 走虚线灰框）；`pages/Home/index.tsx`（`useAssistantChat` → `MessageList`/`ChatInput`）；`types/index.ts` 的 `AssistantProposeResult`（已含 `mode:'need_input'`+`missing`）、`AssistantMessage` status variant（含 `'need_input'`）。

---

## Task 1: 服务端 pendingSlotStore

**Files:**
- Create: `server/src/services/assistant/capability/pendingSlotStore.ts`
- Test: `server/src/services/assistant/capability/pendingSlotStore.test.ts`

- [ ] **Step 1: 写测试（先失败）**

Create `pendingSlotStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { pendingSlotStore } from './pendingSlotStore';

beforeEach(() => pendingSlotStore.__reset());

describe('pendingSlotStore', () => {
  it('set 返回 id，get 按 userId 归属取回', () => {
    const id = pendingSlotStore.set({ userId: 'u1', capabilityName: 'activity.create', partialArgs: { projectId: 'p1' }, missing: ['活动名称'] });
    expect(typeof id).toBe('string');
    const slot = pendingSlotStore.get(id, 'u1');
    expect(slot?.partialArgs).toEqual({ projectId: 'p1' });
    expect(slot?.capabilityName).toBe('activity.create');
  });

  it('他人 userId 取不到（归属隔离）', () => {
    const id = pendingSlotStore.set({ userId: 'u1', capabilityName: 'x', partialArgs: {}, missing: [] });
    expect(pendingSlotStore.get(id, 'u2')).toBeNull();
  });

  it('delete 后取不到', () => {
    const id = pendingSlotStore.set({ userId: 'u1', capabilityName: 'x', partialArgs: {}, missing: [] });
    pendingSlotStore.delete(id);
    expect(pendingSlotStore.get(id, 'u1')).toBeNull();
  });

  it('过期取不到', () => {
    const id = pendingSlotStore.set({ userId: 'u1', capabilityName: 'x', partialArgs: {}, missing: [], createdAt: Date.now() - 6 * 60 * 1000 });
    expect(pendingSlotStore.get(id, 'u1')).toBeNull();
  });
});
```

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx vitest run src/services/assistant/capability/pendingSlotStore.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 2: 实现**

Create `pendingSlotStore.ts`:

```ts
import crypto from 'crypto';

export const PENDING_TTL_MS = 5 * 60 * 1000; // 5 分钟

export interface PendingSlot {
  userId: string;
  capabilityName: string;
  partialArgs: Record<string, unknown>;
  missing: string[];
  createdAt?: number;
}

interface StoredSlot extends PendingSlot {
  createdAt: number;
}

class PendingSlotStore {
  private store = new Map<string, StoredSlot>();

  set(slot: PendingSlot): string {
    const id = crypto.randomUUID();
    this.store.set(id, { ...slot, createdAt: slot.createdAt ?? Date.now() });
    this.prune();
    return id;
  }

  /** 取回并校验归属 + TTL；不符返回 null */
  get(id: string, userId: string): StoredSlot | null {
    const s = this.store.get(id);
    if (!s) return null;
    if (Date.now() - s.createdAt > PENDING_TTL_MS) {
      this.store.delete(id);
      return null;
    }
    if (s.userId !== userId) return null;
    return s;
  }

  delete(id: string): void {
    this.store.delete(id);
  }

  private prune(): void {
    const now = Date.now();
    for (const [k, v] of this.store) if (now - v.createdAt > PENDING_TTL_MS) this.store.delete(k);
  }

  /** 仅供测试 */
  __reset(): void {
    this.store.clear();
  }
}

export const pendingSlotStore = new PendingSlotStore();
```

Run: same command. Expected: PASS（4 用例）。

- [ ] **Step 3: Commit**

```bash
cd /Users/xbot03/PlayCode/Atlas-cap
git add server/src/services/assistant/capability/pendingSlotStore.ts server/src/services/assistant/capability/pendingSlotStore.test.ts
git commit -m "feat(capability): add pendingSlotStore for multi-turn slot filling

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: orchestrator 续填合并 + apply 归属/权限校验

**Files:**
- Modify: `server/src/services/assistant/capability/registry.ts`（导出 `hasPermission`）
- Modify: `server/src/services/assistant/capability/orchestrator.ts`
- Test: `server/src/services/assistant/capability/orchestrator.test.ts`（追加续填 + 归属/权限用例）

- [ ] **Step 1: 导出 `hasPermission`**

在 `registry.ts` 把 `function hasPermission(...)` 改为 `export function hasPermission(...)`（其余不动）。

- [ ] **Step 2: 改 orchestrator——`parseInput`→`parseIncrement`（去掉内部 validateRefs）**

把 `orchestrator.ts` 中现有的 `parseInput` 函数整体替换为（仅去掉 validateRefs 块、改名）：

```ts
/** 解析增量：parseArgs 整体接管，或 extractJson + inputSchema。引用白名单(validateRefs)移到合并后做。 */
function parseIncrement(
  cap: Capability,
  rawLLM: string
): { ok: true; input: Record<string, unknown> } | { ok: false } {
  if (cap.parseArgs) {
    const r = cap.parseArgs(rawLLM, { } as never, undefined);
    return r.ok ? { ok: true, input: r.input as Record<string, unknown> } : { ok: false };
  }
  const raw = extractJson(rawLLM);
  if (raw == null) return { ok: false };
  const parsed = cap.inputSchema.safeParse(raw);
  if (!parsed.success) {
    logger.info({ capabilityName: cap.name, issues: parsed.error.issues.map((i) => i.message) }, '能力参数未通过校验');
    return { ok: false };
  }
  return { ok: true, input: parsed.data as Record<string, unknown> };
}
```

> 注：`parseArgs` 当前唯一使用者是 PR4 的 schedule（自带白名单、无 slot-filling），且其 `parseArgs(rawLLM, ctx, entity)` 需要 ctx/entity。**改动提示**：保留 `parseArgs` 的真实 ctx/entity 传参——见下方 `capabilityPropose` 里改为 `cap.parseArgs(content, ctx, entity)` 调用，不要用上面的占位 `{}`。为避免重复，将解析逻辑直接内联进 `capabilityPropose`（见 Step 3 完整函数），**删除独立 `parseIncrement`**。

- [ ] **Step 3: 替换 `capabilityPropose` 为完整新版（含 priorArgs 合并 + 合并后 validateRefs + 续填 prompt）**

把 `orchestrator.ts` 的 `capabilityPropose` 整段替换为：

```ts
const isEmptyVal = (v: unknown) => v == null || v === '';

export async function capabilityPropose(
  capabilityName: string,
  utterance: string,
  ctx: CapabilityContext,
  priorArgs?: Record<string, unknown>
): Promise<CapabilityProposeOutcome> {
  const cap = getCapability(capabilityName);
  if (!cap) return { status: 'unknown_capability' };

  // 目标定位（仅 target 类）
  let targetId = '__new__';
  let entity: EntitySnapshot | undefined;
  if (cap.target === 'project') {
    const t = await resolveProjectTarget({ utterance, projects: ctx.projects, contextProjectId: ctx.contextProjectId });
    if (t.status === 'ai_unavailable') return { status: 'ai_unavailable' };
    if (t.status === 'unresolved') return { status: 'need_target' };
    targetId = t.projectId;
    const loaded = cap.loadEntity ? await cap.loadEntity(targetId, ctx) : null;
    if (!loaded) return { status: 'target_not_found' };
    entity = loaded;
  }

  // LLM 边缘：填参；续填轮追加「已知字段」块，让 LLM 只补增量
  const prompt = cap.buildPrompt(utterance, ctx);
  let userPrompt = prompt.user;
  if (priorArgs && Object.keys(priorArgs).length > 0) {
    userPrompt += `\n\n## 已确认字段（无需重复；只补未提供或用户明确纠正的字段）\n${JSON.stringify(priorArgs)}`;
  }
  let content: string | null = null;
  try {
    const res = await aiCircuitBreaker.execute(() =>
      callAi({ feature: 'assistant', label: 'intent', systemPrompt: prompt.system, userPrompt, temperature: 0 })
    );
    content = res?.content ?? null;
  } catch (err) {
    logger.warn({ err, capabilityName }, '能力填参 AI 调用失败');
    return { status: 'ai_unavailable' };
  }
  if (!content) return { status: 'ai_unavailable' };

  // 解析增量：parseArgs 整体接管，或 extractJson + inputSchema
  let increment: Record<string, unknown>;
  if (cap.parseArgs) {
    const r = cap.parseArgs(content, ctx, entity);
    if (!r.ok) return { status: 'not_understood' };
    increment = r.input as Record<string, unknown>;
  } else {
    const raw = extractJson(content);
    if (raw == null) return { status: 'not_understood' };
    const parsed = cap.inputSchema.safeParse(raw);
    if (!parsed.success) {
      logger.info({ capabilityName, issues: parsed.error.issues.map((i) => i.message) }, '能力参数未通过校验');
      return { status: 'not_understood' };
    }
    increment = parsed.data as Record<string, unknown>;
  }

  // 合并跨轮已填字段：本轮非空值覆盖/补全，空值绝不抹掉已填
  const merged: Record<string, unknown> = { ...(priorArgs ?? {}) };
  for (const [k, v] of Object.entries(increment)) if (!isEmptyVal(v)) merged[k] = v;

  // 引用 id 白名单（对合并后的完整意图）
  if (cap.validateRefs) {
    const v = cap.validateRefs(merged as never, ctx, entity);
    if (!v.ok) {
      logger.info({ capabilityName, fabricated: v.fabricated }, '能力引用 id 未通过白名单');
      return { status: 'not_understood' };
    }
  }

  // 缺失必填 → 追问（携带合并后的 partialArgs 供下一轮续填）
  const missing = cap.missingRequired ? cap.missingRequired(merged as never, ctx) : [];
  if (missing.length > 0) return { status: 'need_input', missing, partialArgs: merged };

  const input = (cap.applyDefaults ? cap.applyDefaults(merged as never, ctx) : merged) as Record<string, unknown>;

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
```

并**删除**原独立的 `parseInput`/`parseIncrement` 函数（逻辑已内联）。

- [ ] **Step 4: `capabilityApply` 增加归属 + 权限校验**

在 `orchestrator.ts` 顶部 import 区加：`import { hasPermission } from './registry';`，并新增错误类（放在文件已有 import 之后、`CapabilityProposeOutcome` 之前）：

```ts
export class CapabilityForbiddenError extends Error {
  constructor(message = '无权应用此提议') {
    super(message);
    this.name = 'CapabilityForbiddenError';
  }
}
```

把 `capabilityApply` 开头的校验段（从 `const cached = ...` 到 `const cap = ...; if (!cap) ...`）替换为：

```ts
  const cached = proposalStore.get(proposalId);
  if (!cached || !cached.capabilityName) throw new ProposalNotFoundError();
  // 归属：仅发起者本人可应用（拦截代他人应用 / 重放他人 proposalId）
  if (cached.userId && cached.userId !== ctx.userId) throw new CapabilityForbiddenError();
  const cap = getCapability(cached.capabilityName);
  if (!cap) throw new UnknownDomainError(cached.capabilityName);
  // 权限：能力边界 = 用户权限边界（apply 再核一次，防分类层被绕过）
  if (!hasPermission(ctx.permissions, cap.permission.resource, cap.permission.action)) {
    throw new CapabilityForbiddenError('权限不足');
  }
  if (cached.applied) return { rows: cached.applied.rows, risks: cached.applied.risks };
```

（其余 target 重载/指纹复核/execute/audit/markApplied 不变。）

- [ ] **Step 5: 追加测试**

在 `orchestrator.test.ts` 末尾追加：

```ts
import { CapabilityForbiddenError } from './orchestrator';

describe('capabilityPropose · 多轮续填', () => {
  beforeEach(() => { registerCapability(projectCreateCapability); });

  it('priorArgs 合并增量：上轮缺名、本轮补名 → ok（不再缺）', async () => {
    mockCallAi.mockResolvedValue({ content: '{"name":"项目甲"}' }); // 本轮只解析出 name
    const r = await capabilityPropose('project.create', '叫项目甲', ctx, { productLine: '蒲公英' });
    expect(r.status).toBe('ok');
  });

  it('priorArgs 空值不抹已填：本轮空 name 不覆盖已填 name', async () => {
    mockCallAi.mockResolvedValue({ content: '{"name":""}' });
    const r = await capabilityPropose('project.create', 'x', ctx, { name: '项目甲', productLine: '蒲公英' });
    expect(r.status).toBe('ok');
  });
});

describe('capabilityApply · 归属/权限', () => {
  beforeEach(() => { registerCapability(projectCreateCapability); });

  it('非发起者应用 → CapabilityForbiddenError', async () => {
    mockCallAi.mockResolvedValue({ content: '{"name":"甲","productLine":"蒲公英"}' });
    const r = await capabilityPropose('project.create', 'x', ctx); // ctx.userId='u1'
    if (r.status !== 'ok') throw new Error('expected ok');
    const other = { ...ctx, userId: 'u2' };
    await expect(capabilityApply(r.proposalId, other, {} as never)).rejects.toBeInstanceOf(CapabilityForbiddenError);
  });

  it('无权限应用 → CapabilityForbiddenError', async () => {
    mockCallAi.mockResolvedValue({ content: '{"name":"甲","productLine":"蒲公英"}' });
    const r = await capabilityPropose('project.create', 'x', ctx);
    if (r.status !== 'ok') throw new Error('expected ok');
    const noPerm = { ...ctx, permissions: [] };
    await expect(capabilityApply(r.proposalId, noPerm, {} as never)).rejects.toBeInstanceOf(CapabilityForbiddenError);
  });
});
```

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx vitest run src/services/assistant/capability/`
Expected: PASS（既有 + 新增续填/归属/权限用例全绿）。

- [ ] **Step 6: Commit**

```bash
cd /Users/xbot03/PlayCode/Atlas-cap
git add server/src/services/assistant/capability/registry.ts server/src/services/assistant/capability/orchestrator.ts server/src/services/assistant/capability/orchestrator.test.ts
git commit -m "feat(capability): multi-turn merge in propose + ownership/permission check in apply

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 路由 pendingId 续填接入 + schema + apply forbidden 映射

**Files:**
- Modify: `server/src/schemas/assistant.ts`
- Modify: `server/src/routes/assistant.ts`
- Test: `server/src/routes/assistant.test.ts`

- [ ] **Step 1: schema 加 pendingId**

`schemas/assistant.ts` 的 `assistantProposeSchema` 改为：

```ts
export const assistantProposeSchema = z.object({
  utterance: z.string().min(1, '请输入要表达的意图').max(2000, '单次输入过长'),
  contextProjectId: z.string().nullish(),
  /** 多轮续填：上一轮 need_input 返回的不透明 token */
  pendingId: z.string().nullish(),
});
```

- [ ] **Step 2: propose 路由——pendingId 续填分支**

在 `routes/assistant.ts` 顶部 import 加：
```ts
import { pendingSlotStore } from '../services/assistant/capability/pendingSlotStore';
import { CapabilityForbiddenError } from '../services/assistant/capability/orchestrator';
```

把 propose 处理体改为（关键改动：读 pendingId → 命中有效 pending 则跳过分类、带 priorArgs；能力分支管理 pending 生命周期）。具体：

(a) 解构加 `pendingId`：
```ts
      const { utterance, contextProjectId, pendingId } = req.body as {
        utterance: string;
        contextProjectId?: string | null;
        pendingId?: string | null;
      };
```

(b) 在「领域分类」之前插入续填判定，并把分类包进 else：
```ts
      // 多轮续填：命中有效 pending（归属本人）→ 跳过分类，直接续填该能力
      const pending = pendingId ? pendingSlotStore.get(pendingId, req.user!.id) : null;
      let domain: string;
      if (pending) {
        domain = pending.capabilityName;
      } else {
        const userCaps = listCapabilitiesForUser(req.user?.permissions || []);
        const domainOptions = [
          ...listAdapters().map((a) => ({ key: a.domain, description: a.description })),
          ...userCaps.map((c) => ({ key: c.name, description: c.description })),
          QUERY_DOMAIN,
        ];
        const classified = await classifyDomain({ utterance, domains: domainOptions });
        if (classified.status === 'ai_unavailable') {
          res.status(503).json({ error: 'AI_UNAVAILABLE', message: 'AI 助手暂不可用，请手动操作' });
          return;
        }
        if (classified.status === 'unresolved') {
          reply({ proposalId: null, noOp: true, needTarget: false, preview: { rows: [], risks: [] }, narrative: '没听懂你想做什么，请换个更明确的说法（支持调整排期、修改项目字段/风险项，或提问阶段工期等）。' });
          return;
        }
        domain = classified.domain;
      }

      const isQuery = domain === QUERY_DOMAIN.key;
```

> 删除原先独立的 `const userCaps/domainOptions/classified` 段（已并入上面的 else）。

(c) 能力分支：调用带 `pending?.partialArgs`，并在结局处管理 pending（先删旧，再按 need_input 建新）：
```ts
      const capability = getCapability(domain);
      if (capability) {
        const roles = await prisma.role.findMany({ select: { id: true, name: true } });
        const capCtx = {
          userId: req.user!.id,
          userName: req.user?.realName || req.user?.username || '我',
          permissions: req.user?.permissions || [],
          contextProjectId,
          projects: manageable,
          roles,
        };
        const out = await capabilityPropose(domain, utterance, capCtx, pending?.partialArgs);
        // 本轮消费掉旧 pending（若有）
        if (pending && pendingId) pendingSlotStore.delete(pendingId);
        if (out.status === 'need_input') {
          const newPendingId = pendingSlotStore.set({ userId: req.user!.id, capabilityName: domain, partialArgs: out.partialArgs, missing: out.missing });
          reply({ proposalId: null, noOp: true, mode: 'need_input', missing: out.missing, pendingId: newPendingId, preview: { rows: [], risks: [] }, narrative: `还需要补充：${out.missing.join('、')}` });
          return;
        }
        switch (out.status) {
          case 'ai_unavailable':
            res.status(503).json({ error: 'AI_UNAVAILABLE', message: 'AI 助手暂不可用，请手动操作' });
            return;
          case 'unknown_capability':
            res.status(400).json({ error: 'UNKNOWN_DOMAIN', message: `未知能力：${domain}` });
            return;
          case 'need_target':
            reply({ proposalId: null, noOp: true, needTarget: true, preview: { rows: [], risks: [] }, narrative: '没听清你指的是哪个项目，请在话里点明项目名称（例如"把『GW-X500』的硬件打样推迟两周"）。' });
            return;
          case 'target_not_found':
            res.status(404).json({ error: '目标对象不存在' });
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

> 说明：`isQuery` 分支（runAsk）保持在能力分支之前不变；pending 时 domain 必为能力名，isQuery 为 false，不会误入问答。`manageable` 的加载保持在 isQuery 判断之前不变。

- [ ] **Step 3: apply 路由映射 CapabilityForbiddenError → 403**

在 `routes/assistant.ts` 的 apply catch 链里（`ProposalNotFoundError` 之后即可）加：
```ts
      if (error instanceof CapabilityForbiddenError) {
        res.status(403).json({ error: 'FORBIDDEN', message: error.message });
        return;
      }
```

- [ ] **Step 4: 路由测试**

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx vitest run src/routes/assistant.test.ts`
Expected: PASS（既有不回归；如既有用例对 propose body 形状敏感，按需补 pendingId 可选）。

- [ ] **Step 5: Commit**

```bash
cd /Users/xbot03/PlayCode/Atlas-cap
git add server/src/schemas/assistant.ts server/src/routes/assistant.ts server/src/routes/assistant.test.ts
git commit -m "feat(assistant): route multi-turn pendingId continuation + forbidden mapping

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 前端——pendingId 续填 + need_input 琥珀气泡 + 取消

**Files:**
- Modify: `client/src/types/index.ts`
- Modify: `client/src/api/index.ts`
- Modify: `client/src/store/assistantChatStore.ts`
- Modify: `client/src/hooks/useAssistantChat.ts`
- Modify: `client/src/pages/Home/MessageList.tsx`
- Modify: `client/src/pages/Home/index.tsx`
- Test: `client/src/hooks/useAssistantChat.test.tsx`

- [ ] **Step 1: 类型**

`types/index.ts`：`AssistantProposeResult` 加一行（紧跟 `missing?` 之后）：
```ts
  /** 多轮续填 token（mode==='need_input' 时返回，前端下一轮带回） */
  pendingId?: string;
```
`AssistantMessage` 的 status union 成员改为（加两个可选字段）：
```ts
  | {
      id: string;
      role: 'assistant';
      kind: 'status';
      variant: 'ai_unavailable' | 'noop' | 'need_target' | 'error' | 'need_input';
      text: string;
      /** need_input 专用：缺失字段 + 续填 token */
      missing?: string[];
      pendingId?: string;
    };
```

- [ ] **Step 2: API**

`api/index.ts` 的 `assistantApi.propose` 改为带可选 `pendingId`：
```ts
  propose: (utterance: string, contextProjectId?: string | null, pendingId?: string | null) =>
    request.post<AssistantProposeResult>(
      '/assistant/propose',
      { utterance, contextProjectId, pendingId },
      { _silent: true } as never
    ),
```

- [ ] **Step 3: store 加 pendingId**

`store/assistantChatStore.ts`：在接口加 `pendingId: string | null; setPending; clearPending`，实现里初始 `pendingId: null`，`reset` 同时清 pendingId；persist 的 `partialize` 不变（仍只持久化 messages，pendingId 为瞬态）：
```ts
interface AssistantChatState {
  messages: AssistantMessage[];
  pendingId: string | null;
  pushUser: (text: string) => string;
  pushAssistant: (draft: AssistantDraft) => string;
  updateMessage: (id: string, patch: Partial<Extract<AssistantMessage, { kind: 'proposal' }>>) => void;
  setPending: (id: string | null) => void;
  clearPending: () => void;
  reset: () => void;
}
```
实现里：
```ts
      pendingId: null,
      setPending: (id) => set({ pendingId: id }),
      clearPending: () => set({ pendingId: null }),
      reset: () => set({ messages: [], pendingId: null }),
```

- [ ] **Step 4: hook 续填 + 取消**

`hooks/useAssistantChat.ts`：
(a) `toAssistantDraft` 的 need_input 分支携带 missing+pendingId：
```ts
  if (r.mode === 'need_input') {
    return { role: 'assistant', kind: 'status', variant: 'need_input', text: r.narrative || `还需要补充：${(r.missing ?? []).join('、')}`, missing: r.missing, pendingId: r.pendingId };
  }
```
(b) 取 store 的 pending actions：
```ts
  const setPending = useAssistantChatStore((s) => s.setPending);
  const clearPending = useAssistantChatStore((s) => s.clearPending);
```
(c) `send` 带上当前 pendingId（用 getState 避免闭包过期），并按结局设/清 pending：
```ts
  const send = useCallback(
    async (text: string, contextProjectId: string | null) => {
      const t = text.trim();
      if (!t || sending) return;
      pushUser(t);
      setSending(true);
      const { pendingId } = useAssistantChatStore.getState();
      try {
        const res = await assistantApi.propose(t, contextProjectId, pendingId);
        pushAssistant(toAssistantDraft(res.data));
        if (res.data.mode === 'need_input') setPending(res.data.pendingId ?? null);
        else clearPending();
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 503) {
          pushAssistant({ role: 'assistant', kind: 'status', variant: 'ai_unavailable', text: 'AI 暂不可用，请稍后再试或手动操作。' });
        } else {
          const msg = getApiErrorMessage(error, '解析失败，请稍后重试') || '解析失败，请稍后重试';
          pushAssistant({ role: 'assistant', kind: 'status', variant: 'error', text: msg });
        }
      } finally {
        setSending(false);
      }
    },
    [sending, pushUser, pushAssistant, setPending, clearPending]
  );
```
(d) 新增 `cancelPending` 并 return：
```ts
  const cancelPending = useCallback(() => {
    clearPending();
    pushAssistant({ role: 'assistant', kind: 'status', variant: 'noop', text: '已取消补充，可重新发起。' });
  }, [clearPending, pushAssistant]);

  return { messages, sending, send, applyProposal, reset, cancelPending };
```

- [ ] **Step 5: MessageList 琥珀气泡**

`pages/Home/MessageList.tsx`：`Props` 加 `onCancelPending?: () => void`；在 `// status` 注释处、通用 status 渲染**之前**插入 need_input 分支：
```ts
      if (m.kind === 'status' && m.variant === 'need_input') {
        return (
          <div
            key={m.id}
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <div className="font-medium">还需要补充信息</div>
            <div className="mt-1">{m.missing?.length ? `缺少：${m.missing.join('、')}` : m.text}</div>
            <div className="mt-1.5 text-xs opacity-80">直接在下方输入框补充即可，我接着办。</div>
            {onCancelPending && (
              <button type="button" onClick={onCancelPending} className="mt-2 text-xs underline opacity-80 hover:opacity-100">
                取消补充
              </button>
            )}
          </div>
        );
      }
```
并把组件签名改为 `({ messages, onApply, onCancelPending })` 且 `interface Props` 增加该可选项。

- [ ] **Step 6: Home 接线**

`pages/Home/index.tsx`：从 hook 取 `cancelPending` 并传给 MessageList：
```ts
  const { messages, sending, send, applyProposal, reset, cancelPending } = useAssistantChat();
```
```tsx
              <MessageList messages={messages} onApply={applyProposal} onCancelPending={cancelPending} />
```

- [ ] **Step 7: 更新/新增 hook 测试**

`hooks/useAssistantChat.test.tsx`：
(a) 把首个用例对 propose 的断言改为带第三参：
```ts
    expect(mockPropose).toHaveBeenCalledWith('把硬件打样推迟两周', 'p1', null);
```
(b) 追加多轮续填用例：
```ts
  it('need_input 设置 pendingId；下一轮 send 带上它', async () => {
    mockPropose.mockResolvedValueOnce({ data: { proposalId: null, noOp: true, mode: 'need_input', missing: ['活动名称'], pendingId: 'pend-1', preview: { rows: [], risks: [] }, narrative: '还需要补充：活动名称' } });
    const { result } = renderHook(() => useAssistantChat());
    await act(async () => { await result.current.send('建个活动', null); });
    expect(useAssistantChatStore.getState().pendingId).toBe('pend-1');

    mockPropose.mockResolvedValueOnce({ data: baseProposal() });
    await act(async () => { await result.current.send('叫结构打样', null); });
    expect(mockPropose).toHaveBeenLastCalledWith('叫结构打样', null, 'pend-1');
    expect(useAssistantChatStore.getState().pendingId).toBeNull(); // 出预览后清空
  });

  it('cancelPending 清 pendingId 并推一条状态', async () => {
    useAssistantChatStore.setState({ pendingId: 'pend-1' });
    const { result } = renderHook(() => useAssistantChat());
    act(() => { result.current.cancelPending(); });
    expect(useAssistantChatStore.getState().pendingId).toBeNull();
    expect(useAssistantChatStore.getState().messages.at(-1)).toMatchObject({ kind: 'status', variant: 'noop' });
  });
```
（如 `baseProposal` 未含 `mode`，其默认非 need_input，故第二轮 send 会 clearPending —— 符合断言。`beforeEach` 已 `useAssistantChatStore.setState({ messages: [] })`，补充为 `{ messages: [], pendingId: null }` 以隔离。）

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/client && npx vitest run src/hooks/useAssistantChat.test.tsx`
Expected: PASS。

- [ ] **Step 8: Commit**

```bash
cd /Users/xbot03/PlayCode/Atlas-cap
git add client/src/types/index.ts client/src/api/index.ts client/src/store/assistantChatStore.ts client/src/hooks/useAssistantChat.ts client/src/hooks/useAssistantChat.test.tsx client/src/pages/Home/MessageList.tsx client/src/pages/Home/index.tsx
git commit -m "feat(assistant-ui): multi-turn pendingId continuation + amber need_input bubble + cancel

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: PR3 收尾验证

- [ ] **Step 1: 后端自有文件 typecheck**

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx tsc --noEmit 2>&1 | grep -E 'capability/(pendingSlotStore|orchestrator|registry)|routes/assistant\.ts|schemas/assistant'`
Expected: 无输出。

- [ ] **Step 2: 后端测试**

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/server && npx vitest run src/services/assistant/ src/routes/assistant.test.ts`
Expected: PASS。

- [ ] **Step 3: 前端 typecheck + 测试**

Run: `cd /Users/xbot03/PlayCode/Atlas-cap/client && npx tsc --noEmit 2>&1 | grep -E 'assistantChatStore|useAssistantChat|MessageList|pages/Home/index|types/index' || echo clean`
Run: `cd /Users/xbot03/PlayCode/Atlas-cap/client && npx vitest run src/hooks/useAssistantChat.test.tsx`
Expected: typecheck 本批文件无报错；测试 PASS。

- [ ] **Step 4: lint**

Run: `cd /Users/xbot03/PlayCode/Atlas-cap && npx eslint server/src/services/assistant/capability/pendingSlotStore.ts server/src/services/assistant/capability/orchestrator.ts server/src/routes/assistant.ts client/src/hooks/useAssistantChat.ts client/src/store/assistantChatStore.ts client/src/pages/Home/MessageList.tsx`
Expected: 无输出。

- [ ] **Step 5（可选浏览器冒烟）：** 首页输入「帮我建个活动」→ 琥珀气泡列「项目、活动名称」→ 再输入「在 GW-X500，叫结构打样」→ 直接出新建活动预览（跨轮记忆生效）→「取消补充」可清空。

---

## Self-Review（计划 vs 规格 §5）

- **服务端 pendingSlotStore（TTL+归属）** → Task 1。
- **capabilityPropose priorArgs 合并 + 合并后 validateRefs + 续填 prompt** → Task 2 Step 3。
- **路由 pendingId 跳过分类、生命周期管理、回 pendingId** → Task 3 Step 2。
- **apply 归属（userId）+ 权限校验**（PR1/PR2 deferred + task_0afc42f8 + 评审 framework note）→ Task 2 Step 4 + Task 3 Step 3。
- **前端：propose 三参、store pendingId、hook 续填/取消、琥珀气泡** → Task 4。
- **半成品意图只在服务端**：前端只拿 `pendingId`（不透明），`partialArgs` 不回流 → Task 3（need_input 仅回 missing+pendingId）。
- **类型一致**：`capabilityPropose(name, utterance, ctx, priorArgs?)`、`pendingSlotStore.get(id, userId)`、`AssistantProposeResult.pendingId`、`assistantApi.propose(.,.,pendingId)` 全链一致。

## 风险与备注

- **MessageList 并发改**：only-add need_input 分支 + Props 可选项，最小增量，降低与 codex 并发改的合并冲突。
- **不重分类**：续填轮信任 pendingId（省一次 classify LLM）；「改主意」由琥珀气泡的「取消补充」覆盖。
- **parseArgs 续填**：parseArgs 类能力（schedule）无 missingRequired、不产生 need_input，故续填只作用于默认管线能力（activity.create/project.create）。
