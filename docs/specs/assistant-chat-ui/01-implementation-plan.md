# AI 助手聊天式交互改造 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把全系统 AI 助手从「单次问答 + 步骤时间线 + 右下角浮层」改造成 claude.ai 式全屏聊天页 `/assistant`，并把首页收敛为「默认只显示输入框、有风险点才显示风险区」。

**Architecture:** 纯前端改造。新增 Zustand store 存对话消息（持久化到 localStorage），新增 `useAssistantChat` hook 复用现有 `assistantApi.propose/apply` 编排（每轮独立、不发历史），全屏页 `/assistant` 渲染气泡对话流，propose/apply 预览卡片作为一种 assistant 消息内嵌。后端与「不可妥协的安全模型」零改动。

**Tech Stack:** React 19 + TypeScript + Vite + Zustand 5（含 `persist` 中间件）+ React Router 7 + shadcn/ui + Tailwind v4 + `react-markdown`/`remark-gfm`（新增）+ Vitest + Testing Library。

设计依据：见同目录 [`00-design.md`](./00-design.md)。

---

## 文件结构

**新增**
- `client/src/store/assistantChatStore.ts`（+ `.test.ts`）— 对话消息状态 + 持久化
- `client/src/hooks/useAssistantChat.ts`（+ `.test.tsx`）— propose/apply 编排
- `client/src/components/AssistantHeroInput.tsx`（+ `.test.tsx`）— 首页胶囊输入（提交→跳转）
- `client/src/pages/Assistant/index.tsx` — 全屏聊天页（壳 + 自动发送首条）
- `client/src/pages/Assistant/MessageList.tsx` — 消息列表渲染分发
- `client/src/pages/Assistant/ProposalCard.tsx`（+ `.test.tsx`）— 改动预览卡片 + 确认应用
- `client/src/pages/Assistant/AnswerBubble.tsx`（+ `.test.tsx`）— Markdown 回答 + 来源徽标
- `client/src/pages/Assistant/ChatInput.tsx` — 底部自增长输入
- `client/src/pages/Assistant/EmptyState.tsx` — 空态问候 + 示例 chip

**修改**
- `client/src/types/index.ts` — 追加 `AssistantMessage` / `AssistantDraft` 类型
- `client/src/App.tsx` — 加 `/assistant` 路由
- `client/src/layouts/MainLayout.tsx` — 加「AI 助手」导航项；浮层改为也在 `/assistant` 隐藏
- `client/src/components/AssistantLauncher.tsx`（+ `.test.tsx`）— 浮层 → 跳转 FAB
- `client/src/pages/Home/index.tsx`（+ `.test.tsx`）— 换 hero 输入 + 风险区按需显示

**删除**
- `client/src/components/AssistantConversation.tsx`（+ `.test.tsx`）— 逻辑迁移到 hook/组件

---

## Task 1: 安装依赖 + 共享类型

**Files:**
- Modify: `client/package.json`（经 npm install）
- Modify: `client/src/types/index.ts`（在 `AssistantApplyResult` 之后追加）

- [ ] **Step 1: 安装 markdown 依赖**

Run:
```bash
cd client && npm install react-markdown@^9 remark-gfm@^4
```
Expected: `package.json` 的 `dependencies` 新增 `react-markdown` 与 `remark-gfm`，无报错。

- [ ] **Step 2: 追加对话消息类型**

在 `client/src/types/index.ts` 中，紧接 `AssistantApplyResult` 接口之后追加：

```ts
// ============ 助手聊天消息（前端对话流） ============
export type AssistantMessage =
  | { id: string; role: 'user'; text: string }
  | {
      id: string;
      role: 'assistant';
      kind: 'answer';
      answer: string;
      basis?: 'deterministic' | 'grounded';
      elapsedMs?: number;
    }
  | {
      id: string;
      role: 'assistant';
      kind: 'proposal';
      proposalId: string | null;
      preview: AssistantPreview;
      narrative: string;
      confidence?: 'high' | 'low';
      elapsedMs?: number;
      applied: boolean;
      stale?: boolean;
    }
  | {
      id: string;
      role: 'assistant';
      kind: 'status';
      variant: 'ai_unavailable' | 'noop' | 'need_target' | 'error';
      text: string;
    };

// 未带 id 的草稿（store 负责生成 id）
export type AssistantDraft =
  | Omit<Extract<AssistantMessage, { kind: 'answer' }>, 'id'>
  | Omit<Extract<AssistantMessage, { kind: 'proposal' }>, 'id'>
  | Omit<Extract<AssistantMessage, { kind: 'status' }>, 'id'>;
```

- [ ] **Step 3: typecheck 通过**

Run: `cd client && npx tsc --noEmit`
Expected: 无类型错误（新类型仅声明，未被引用）。

- [ ] **Step 4: Commit**

```bash
git add client/package.json client/package-lock.json client/src/types/index.ts
git commit -m "feat(assistant): add chat message types + markdown deps"
```

---

## Task 2: 对话消息 store（TDD）

**Files:**
- Create: `client/src/store/assistantChatStore.ts`
- Test: `client/src/store/assistantChatStore.test.ts`

- [ ] **Step 1: 写失败测试**

Create `client/src/store/assistantChatStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAssistantChatStore } from './assistantChatStore';

const reset = () => useAssistantChatStore.setState({ messages: [], pendingUtterance: null });

describe('assistantChatStore', () => {
  beforeEach(() => {
    localStorage.clear();
    reset();
  });

  it('starts empty', () => {
    expect(useAssistantChatStore.getState().messages).toEqual([]);
    expect(useAssistantChatStore.getState().pendingUtterance).toBeNull();
  });

  it('pushUser appends a user message and returns its id', () => {
    const id = useAssistantChatStore.getState().pushUser('把硬件打样推迟两周');
    const msgs = useAssistantChatStore.getState().messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ id, role: 'user', text: '把硬件打样推迟两周' });
  });

  it('pushAssistant assigns an id and appends', () => {
    const id = useAssistantChatStore
      .getState()
      .pushAssistant({ role: 'assistant', kind: 'status', variant: 'noop', text: '没听懂这句话' });
    const last = useAssistantChatStore.getState().messages.at(-1)!;
    expect(last.id).toBe(id);
    expect(last).toMatchObject({ role: 'assistant', kind: 'status', text: '没听懂这句话' });
  });

  it('assigns unique ids across messages', () => {
    const a = useAssistantChatStore.getState().pushUser('a');
    const b = useAssistantChatStore.getState().pushUser('b');
    expect(a).not.toBe(b);
  });

  it('updateMessage patches a message by id', () => {
    const id = useAssistantChatStore.getState().pushAssistant({
      role: 'assistant',
      kind: 'proposal',
      proposalId: 'p1',
      preview: { rows: [], risks: [] },
      narrative: '',
      applied: false,
    });
    useAssistantChatStore.getState().updateMessage(id, { applied: true });
    const m = useAssistantChatStore.getState().messages.find((x) => x.id === id)!;
    expect(m).toMatchObject({ applied: true });
  });

  it('reset clears messages', () => {
    useAssistantChatStore.getState().pushUser('x');
    useAssistantChatStore.getState().reset();
    expect(useAssistantChatStore.getState().messages).toEqual([]);
  });

  it('setPendingUtterance stores and clears the handoff', () => {
    useAssistantChatStore.getState().setPendingUtterance('把项目甲优先级改成高');
    expect(useAssistantChatStore.getState().pendingUtterance).toBe('把项目甲优先级改成高');
    useAssistantChatStore.getState().setPendingUtterance(null);
    expect(useAssistantChatStore.getState().pendingUtterance).toBeNull();
  });

  it('persists messages to localStorage', () => {
    useAssistantChatStore.getState().pushUser('记住我');
    expect(localStorage.getItem('atlas-assistant-chat')).toContain('记住我');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd client && npx vitest run src/store/assistantChatStore.test.ts`
Expected: FAIL —「Cannot find module './assistantChatStore'」。

- [ ] **Step 3: 实现 store**

Create `client/src/store/assistantChatStore.ts`:

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AssistantMessage, AssistantDraft } from '../types';

interface AssistantChatState {
  messages: AssistantMessage[];
  /** 首页 hero → 全屏页 的首条消息交接（不持久化） */
  pendingUtterance: string | null;
  pushUser: (text: string) => string;
  pushAssistant: (draft: AssistantDraft) => string;
  // updateMessage 只用于就地改 proposal 卡片状态（applied/stale），故按 proposal 收窄
  // （Partial<union> 只暴露公共键 id/role，无法接受 { applied } —— 必须 Extract）
  updateMessage: (id: string, patch: Partial<Extract<AssistantMessage, { kind: 'proposal' }>>) => void;
  reset: () => void;
  setPendingUtterance: (text: string | null) => void;
}

let seq = 0;
const newId = () => `m${seq++}-${Math.floor(performance.now())}`;

export const useAssistantChatStore = create<AssistantChatState>()(
  persist(
    (set) => ({
      messages: [],
      pendingUtterance: null,

      pushUser: (text) => {
        const id = newId();
        set((s) => ({ messages: [...s.messages, { id, role: 'user', text }] }));
        return id;
      },

      pushAssistant: (draft) => {
        const id = newId();
        set((s) => ({ messages: [...s.messages, { ...draft, id } as AssistantMessage] }));
        return id;
      },

      updateMessage: (id, patch) =>
        set((s) => ({
          messages: s.messages.map((m) => (m.id === id ? ({ ...m, ...patch } as AssistantMessage) : m)),
        })),

      reset: () => set({ messages: [] }),

      setPendingUtterance: (text) => set({ pendingUtterance: text }),
    }),
    {
      name: 'atlas-assistant-chat',
      // 只持久化对话，不持久化临时交接
      partialize: (s) => ({ messages: s.messages }),
    }
  )
);
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd client && npx vitest run src/store/assistantChatStore.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: Commit**

```bash
git add client/src/store/assistantChatStore.ts client/src/store/assistantChatStore.test.ts
git commit -m "feat(assistant): add assistantChatStore with localStorage persistence"
```

---

## Task 3: useAssistantChat 编排 hook（TDD）

**Files:**
- Create: `client/src/hooks/useAssistantChat.ts`
- Test: `client/src/hooks/useAssistantChat.test.tsx`

迁移自原 `AssistantConversation.tsx` 的 propose/apply/answer/降级逻辑。

- [ ] **Step 1: 写失败测试**

Create `client/src/hooks/useAssistantChat.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { AssistantProposeResult } from '../types';

const { mockPropose, mockApply, mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockPropose: vi.fn(),
  mockApply: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock('../api', () => ({ assistantApi: { propose: mockPropose, apply: mockApply } }));
vi.mock('sonner', () => ({ toast: { error: mockToastError, success: mockToastSuccess } }));

import { useAssistantChat } from './useAssistantChat';
import { useAssistantChatStore } from '../store/assistantChatStore';

const baseProposal = (over: Partial<AssistantProposeResult> = {}): AssistantProposeResult => ({
  proposalId: 'prop-1',
  noOp: false,
  preview: { rows: [{ key: 'A1', label: '硬件打样', before: 'a', after: 'b' }], risks: [], confidence: 'high' },
  narrative: '硬件打样推迟两周。',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useAssistantChatStore.setState({ messages: [], pendingUtterance: null });
});

describe('useAssistantChat', () => {
  it('send pushes a user message then a proposal; calls propose(utterance, projectId)', async () => {
    mockPropose.mockResolvedValue({ data: baseProposal() });
    const { result } = renderHook(() => useAssistantChat());
    await act(async () => {
      await result.current.send('把硬件打样推迟两周', 'p1');
    });
    expect(mockPropose).toHaveBeenCalledWith('把硬件打样推迟两周', 'p1');
    const msgs = useAssistantChatStore.getState().messages;
    expect(msgs[0]).toMatchObject({ role: 'user', text: '把硬件打样推迟两周' });
    expect(msgs[1]).toMatchObject({ role: 'assistant', kind: 'proposal', proposalId: 'prop-1', applied: false });
  });

  it('send maps an answer result to an answer message', async () => {
    mockPropose.mockResolvedValue({
      data: { proposalId: null, noOp: true, mode: 'answer', basis: 'deterministic', answer: '共 53 个工作日。', preview: { rows: [], risks: [] }, narrative: '' },
    });
    const { result } = renderHook(() => useAssistantChat());
    await act(async () => {
      await result.current.send('GW-X500 的 EVT 阶段花了多少工作日', null);
    });
    expect(useAssistantChatStore.getState().messages.at(-1)).toMatchObject({
      kind: 'answer', answer: '共 53 个工作日。', basis: 'deterministic',
    });
  });

  it('send maps noOp to a status message', async () => {
    mockPropose.mockResolvedValue({ data: baseProposal({ proposalId: null, noOp: true, narrative: '没听懂这句话', preview: { rows: [], risks: [] } }) });
    const { result } = renderHook(() => useAssistantChat());
    await act(async () => {
      await result.current.send('优化一下', null);
    });
    expect(useAssistantChatStore.getState().messages.at(-1)).toMatchObject({ kind: 'status', variant: 'noop', text: '没听懂这句话' });
  });

  it('send maps a 503 to an ai_unavailable status', async () => {
    mockPropose.mockRejectedValue({ response: { status: 503 } });
    const { result } = renderHook(() => useAssistantChat());
    await act(async () => {
      await result.current.send('把硬件打样推迟两周', 'p1');
    });
    expect(useAssistantChatStore.getState().messages.at(-1)).toMatchObject({ kind: 'status', variant: 'ai_unavailable' });
  });

  it('applyProposal applies, marks applied, dispatches assistant:applied', async () => {
    mockPropose.mockResolvedValue({ data: baseProposal() });
    mockApply.mockResolvedValue({ data: { ok: true, appliedDiff: { rows: [] }, risks: [] } });
    const evt = vi.fn();
    window.addEventListener('assistant:applied', evt);
    const { result } = renderHook(() => useAssistantChat());
    await act(async () => {
      await result.current.send('把硬件打样推迟两周', 'p1');
    });
    const proposalMsg = useAssistantChatStore.getState().messages.at(-1)!;
    await act(async () => {
      await result.current.applyProposal(proposalMsg.id);
    });
    expect(mockApply).toHaveBeenCalledWith('prop-1');
    expect(mockToastSuccess).toHaveBeenCalled();
    await waitFor(() =>
      expect(useAssistantChatStore.getState().messages.find((m) => m.id === proposalMsg.id)).toMatchObject({ applied: true })
    );
    expect(evt).toHaveBeenCalled();
    window.removeEventListener('assistant:applied', evt);
  });

  it('applyProposal on 409 marks the proposal stale + toasts', async () => {
    mockPropose.mockResolvedValue({ data: baseProposal() });
    mockApply.mockRejectedValue({ response: { status: 409 } });
    const { result } = renderHook(() => useAssistantChat());
    await act(async () => {
      await result.current.send('x', 'p1');
    });
    const id = useAssistantChatStore.getState().messages.at(-1)!.id;
    await act(async () => {
      await result.current.applyProposal(id);
    });
    expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('已被改动'));
    expect(useAssistantChatStore.getState().messages.find((m) => m.id === id)).toMatchObject({ stale: true });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd client && npx vitest run src/hooks/useAssistantChat.test.tsx`
Expected: FAIL —「Cannot find module './useAssistantChat'」。

- [ ] **Step 3: 实现 hook**

Create `client/src/hooks/useAssistantChat.ts`:

```ts
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { assistantApi } from '../api';
import { useAssistantChatStore } from '../store/assistantChatStore';
import { getApiErrorMessage } from '../utils/apiError';
import type { AssistantDraft, AssistantProposeResult } from '../types';

/** 把后端 propose 结果映射成一条 assistant 草稿消息（不含 id）。 */
const toAssistantDraft = (r: AssistantProposeResult): AssistantDraft => {
  if (r.answer) {
    return { role: 'assistant', kind: 'answer', answer: r.answer, basis: r.basis, elapsedMs: r.elapsedMs };
  }
  const rows = r.preview?.rows ?? [];
  if (r.proposalId && rows.length > 0) {
    return {
      role: 'assistant',
      kind: 'proposal',
      proposalId: r.proposalId,
      preview: r.preview,
      narrative: r.narrative,
      confidence: r.preview.confidence,
      elapsedMs: r.elapsedMs,
      applied: false,
    };
  }
  return {
    role: 'assistant',
    kind: 'status',
    variant: r.needTarget ? 'need_target' : 'noop',
    text: r.narrative || '没听懂这句话',
  };
};

export function useAssistantChat() {
  const messages = useAssistantChatStore((s) => s.messages);
  const pushUser = useAssistantChatStore((s) => s.pushUser);
  const pushAssistant = useAssistantChatStore((s) => s.pushAssistant);
  const updateMessage = useAssistantChatStore((s) => s.updateMessage);
  const reset = useAssistantChatStore((s) => s.reset);
  const [sending, setSending] = useState(false);

  const send = useCallback(
    async (text: string, contextProjectId: string | null) => {
      const t = text.trim();
      if (!t || sending) return;
      pushUser(t);
      setSending(true);
      try {
        const res = await assistantApi.propose(t, contextProjectId);
        pushAssistant(toAssistantDraft(res.data));
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
    [sending, pushUser, pushAssistant]
  );

  const applyProposal = useCallback(
    async (id: string) => {
      const m = messages.find((x) => x.id === id);
      if (!m || m.role !== 'assistant' || m.kind !== 'proposal' || !m.proposalId) return;
      try {
        await assistantApi.apply(m.proposalId);
        updateMessage(id, { applied: true });
        toast.success('已应用，可在审计/撤回处回滚');
        window.dispatchEvent(new CustomEvent('assistant:applied'));
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 409) {
          toast.error('数据在此期间已被改动，请重新发起对话');
          updateMessage(id, { stale: true });
        } else if (status === 404) {
          toast.error('提议已过期，请重新发起对话');
          updateMessage(id, { stale: true });
        } else if (status === 400) {
          toast.error(getApiErrorMessage(error, '无法应用') || '无法应用');
        } else {
          toast.error(getApiErrorMessage(error, '应用失败，请稍后重试') || '应用失败，请稍后重试');
        }
      }
    },
    [messages, updateMessage]
  );

  return { messages, sending, send, applyProposal, reset };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd client && npx vitest run src/hooks/useAssistantChat.test.tsx`
Expected: PASS（全部用例）。

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useAssistantChat.ts client/src/hooks/useAssistantChat.test.tsx
git commit -m "feat(assistant): add useAssistantChat orchestration hook"
```

---

## Task 4: 首页胶囊输入 AssistantHeroInput（TDD）

**Files:**
- Create: `client/src/components/AssistantHeroInput.tsx`
- Test: `client/src/components/AssistantHeroInput.test.tsx`

- [ ] **Step 1: 写失败测试**

Create `client/src/components/AssistantHeroInput.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mockNavigate,
}));

import AssistantHeroInput from './AssistantHeroInput';
import { useAssistantChatStore } from '../store/assistantChatStore';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useAssistantChatStore.setState({ messages: [], pendingUtterance: null });
});

describe('AssistantHeroInput', () => {
  it('renders the pill placeholder and send button', () => {
    render(<AssistantHeroInput />);
    expect(screen.getByPlaceholderText('有问题，尽管问')).toBeInTheDocument();
    expect(screen.getByLabelText('发送')).toBeInTheDocument();
  });

  it('submit stores pending utterance and navigates to /assistant', () => {
    render(<AssistantHeroInput />);
    fireEvent.change(screen.getByPlaceholderText('有问题，尽管问'), { target: { value: '把项目甲优先级改成高' } });
    fireEvent.click(screen.getByLabelText('发送'));
    expect(useAssistantChatStore.getState().pendingUtterance).toBe('把项目甲优先级改成高');
    expect(mockNavigate).toHaveBeenCalledWith('/assistant');
  });

  it('submits on Enter', () => {
    render(<AssistantHeroInput />);
    const input = screen.getByPlaceholderText('有问题，尽管问');
    fireEvent.change(input, { target: { value: '把硬件打样推迟两周' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith('/assistant');
  });

  it('does nothing on empty submit', () => {
    render(<AssistantHeroInput />);
    fireEvent.click(screen.getByLabelText('发送'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd client && npx vitest run src/components/AssistantHeroInput.test.tsx`
Expected: FAIL —「Cannot find module './AssistantHeroInput'」。

- [ ] **Step 3: 实现组件**

Create `client/src/components/AssistantHeroInput.tsx`:

```tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAssistantChatStore } from '../store/assistantChatStore';

/** 首页 hero 胶囊输入：提交时把首条消息交接给全屏页并跳转。 */
const AssistantHeroInput: React.FC = () => {
  const navigate = useNavigate();
  const setPending = useAssistantChatStore((s) => s.setPendingUtterance);
  const [utterance, setUtterance] = useState('');

  const submit = () => {
    const t = utterance.trim();
    if (!t) return;
    setPending(t);
    navigate('/assistant');
  };

  return (
    <div className="bg-background flex items-center gap-1 rounded-full border px-2 py-1.5 pl-3 shadow-sm">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="清空"
        onClick={() => setUtterance('')}
        className="text-muted-foreground size-8 shrink-0 rounded-full"
      >
        <Plus className="size-4" />
      </Button>
      <input
        value={utterance}
        onChange={(e) => setUtterance(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="有问题，尽管问"
        aria-label="AI 输入"
        className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 border-none bg-transparent px-1.5 py-1.5 text-[15px] outline-none"
      />
      <Button type="button" size="icon" aria-label="发送" onClick={submit} className="size-9 shrink-0 rounded-full">
        <ArrowUp className="size-4" />
      </Button>
    </div>
  );
};

export default AssistantHeroInput;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd client && npx vitest run src/components/AssistantHeroInput.test.tsx`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add client/src/components/AssistantHeroInput.tsx client/src/components/AssistantHeroInput.test.tsx
git commit -m "feat(assistant): add AssistantHeroInput (submit hands off to /assistant)"
```

---

## Task 5: 展示组件（ProposalCard / AnswerBubble TDD + 其余）

**Files:**
- Create: `client/src/pages/Assistant/ProposalCard.tsx`（+ `.test.tsx`）
- Create: `client/src/pages/Assistant/AnswerBubble.tsx`（+ `.test.tsx`）
- Create: `client/src/pages/Assistant/ChatInput.tsx`
- Create: `client/src/pages/Assistant/EmptyState.tsx`
- Create: `client/src/pages/Assistant/MessageList.tsx`

### 5a. ProposalCard

- [ ] **Step 1: 写失败测试**

Create `client/src/pages/Assistant/ProposalCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProposalCard from './ProposalCard';
import type { AssistantMessage } from '../../types';

const proposal = (over: Partial<Extract<AssistantMessage, { kind: 'proposal' }>> = {}) =>
  ({
    id: 'm1',
    role: 'assistant',
    kind: 'proposal',
    proposalId: 'prop-1',
    preview: {
      rows: [{ key: 'A1', label: '硬件打样 · 计划完成', before: '06-20', after: '07-04' }],
      risks: [{ kind: 'milestone_slip', severity: 'warning', text: '撞里程碑：样机评审' }],
      confidence: 'high',
    },
    narrative: '硬件打样推迟两周。',
    applied: false,
    ...over,
  }) as Extract<AssistantMessage, { kind: 'proposal' }>;

beforeEach(() => vi.clearAllMocks());

describe('ProposalCard', () => {
  it('renders narrative, diff rows and risks', () => {
    render(<ProposalCard message={proposal()} onApply={vi.fn()} />);
    expect(screen.getByText('硬件打样推迟两周。')).toBeInTheDocument();
    expect(screen.getByText('硬件打样 · 计划完成')).toBeInTheDocument();
    expect(screen.getByText('07-04')).toBeInTheDocument();
    expect(screen.getByText('撞里程碑：样机评审')).toBeInTheDocument();
  });

  it('应用全部 → confirm dialog → onApply', async () => {
    const onApply = vi.fn();
    render(<ProposalCard message={proposal()} onApply={onApply} />);
    fireEvent.click(screen.getByText('应用全部'));
    fireEvent.click(await screen.findByText('确认应用'));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('low confidence shows a warning', () => {
    render(<ProposalCard message={proposal({ confidence: 'low' })} onApply={vi.fn()} />);
    expect(screen.getByText(/AI 对你的意图不太确定/)).toBeInTheDocument();
  });

  it('applied state hides the apply button and shows 已应用', () => {
    render(<ProposalCard message={proposal({ applied: true })} onApply={vi.fn()} />);
    expect(screen.getByText(/已应用/)).toBeInTheDocument();
    expect(screen.queryByText('应用全部')).not.toBeInTheDocument();
  });

  it('stale state shows expired note, no apply button', () => {
    render(<ProposalCard message={proposal({ stale: true })} onApply={vi.fn()} />);
    expect(screen.getByText(/已过期/)).toBeInTheDocument();
    expect(screen.queryByText('应用全部')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd client && npx vitest run src/pages/Assistant/ProposalCard.test.tsx`
Expected: FAIL —「Cannot find module './ProposalCard'」。

- [ ] **Step 3: 实现 ProposalCard**

Create `client/src/pages/Assistant/ProposalCard.tsx`:

```tsx
import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { AssistantMessage, AssistantDiffRow, AssistantRiskRow } from '../../types';

const riskBadgeClass = (s: AssistantRiskRow['severity']) =>
  s === 'danger'
    ? 'border-transparent bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
    : s === 'warning'
      ? 'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
      : 'border-transparent bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400';

interface Props {
  message: Extract<AssistantMessage, { kind: 'proposal' }>;
  onApply: () => void;
}

const ProposalCard: React.FC<Props> = ({ message, onApply }) => {
  const { preview, narrative, confidence, applied, stale } = message;
  const rows = preview.rows ?? [];
  const risks = preview.risks ?? [];
  const elapsedText = message.elapsedMs != null ? `耗时 ${(message.elapsedMs / 1000).toFixed(1)} 秒` : null;

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">改动预览 · 确认后才写入</div>

      {confidence === 'low' && (
        <div className="mb-2.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          AI 对你的意图不太确定，请仔细核对下面每一条改动后再应用。
        </div>
      )}

      {narrative ? (
        <p className="text-foreground mb-2.5 text-sm">{narrative}</p>
      ) : (
        <p className="text-muted-foreground mb-2.5 text-sm">（AI 文字复述暂不可用，以下为系统计算的结构化改动，仍可确认应用）</p>
      )}

      {risks.length > 0 && (
        <div className="mb-2.5 space-y-1.5">
          {risks.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-[13px]">
              <Badge variant="outline" className={riskBadgeClass(r.severity)}>
                {r.kind}
              </Badge>
              <span>{r.text}</span>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">对象</TableHead>
                <TableHead>原</TableHead>
                <TableHead>新</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: AssistantDiffRow) => (
                <TableRow key={r.key}>
                  <TableCell className="font-medium">{r.label}</TableCell>
                  <TableCell className="text-muted-foreground">{r.before}</TableCell>
                  <TableCell className="font-medium text-amber-600 dark:text-amber-400">{r.after}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="mt-3.5 flex items-center gap-3">
        {applied ? (
          <span className="text-sm text-green-700 dark:text-green-400">已应用，可在审计/撤回处回滚</span>
        ) : stale ? (
          <span className="text-muted-foreground text-sm">提议已过期，请重新发起对话</span>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={!message.proposalId || rows.length === 0}>
                应用全部
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认应用改动</AlertDialogTitle>
                <AlertDialogDescription>
                  将按预览结果经现有校验路径写入数据库并记入审计，可在审计/撤回处回滚。是否继续？
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>返回</AlertDialogCancel>
                <AlertDialogAction onClick={onApply}>确认应用</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {elapsedText && <span className={cn('text-muted-foreground text-xs', applied || stale ? '' : 'ml-auto')}>{elapsedText}</span>}
      </div>
    </div>
  );
};

export default ProposalCard;
```

- [ ] **Step 4: 运行确认通过**

Run: `cd client && npx vitest run src/pages/Assistant/ProposalCard.test.tsx`
Expected: PASS。

### 5b. AnswerBubble

- [ ] **Step 5: 写失败测试**

Create `client/src/pages/Assistant/AnswerBubble.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AnswerBubble from './AnswerBubble';

describe('AnswerBubble', () => {
  it('renders markdown answer text', () => {
    render(<AnswerBubble answer={'项目甲当前有 **3** 个高风险项。'} basis="deterministic" />);
    expect(screen.getByText(/3 个高风险项/)).toBeInTheDocument();
  });

  it('deterministic basis shows 系统精确计算 badge', () => {
    render(<AnswerBubble answer="x" basis="deterministic" />);
    expect(screen.getByText('系统精确计算')).toBeInTheDocument();
  });

  it('grounded basis shows the caveat badge', () => {
    render(<AnswerBubble answer="x" basis="grounded" />);
    expect(screen.getByText(/AI 整理，可能不完整/)).toBeInTheDocument();
  });

  it('shows elapsed time when provided', () => {
    render(<AnswerBubble answer="x" basis="deterministic" elapsedMs={5720} />);
    expect(screen.getByText('耗时 5.7 秒')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: 运行确认失败**

Run: `cd client && npx vitest run src/pages/Assistant/AnswerBubble.test.tsx`
Expected: FAIL —「Cannot find module './AnswerBubble'」。

- [ ] **Step 7: 实现 AnswerBubble**

Create `client/src/pages/Assistant/AnswerBubble.tsx`:

```tsx
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Badge } from '@/components/ui/badge';

const SYS_BADGE = 'border-transparent bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400';
const GROUNDED_BADGE = 'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400';

interface Props {
  answer: string;
  basis?: 'deterministic' | 'grounded';
  elapsedMs?: number;
}

const AnswerBubble: React.FC<Props> = ({ answer, basis, elapsedMs }) => {
  const elapsedText = elapsedMs != null ? `耗时 ${(elapsedMs / 1000).toFixed(1)} 秒` : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[15px] leading-7 [&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
      </div>
      <div className="flex items-center gap-2">
        {basis === 'grounded' ? (
          <Badge variant="outline" className={GROUNDED_BADGE}>
            据系统数据（AI 整理，可能不完整，请核对）
          </Badge>
        ) : (
          <Badge variant="outline" className={SYS_BADGE}>
            系统精确计算
          </Badge>
        )}
        {elapsedText && <span className="text-muted-foreground text-xs">{elapsedText}</span>}
      </div>
    </div>
  );
};

export default AnswerBubble;
```

- [ ] **Step 8: 运行确认通过**

Run: `cd client && npx vitest run src/pages/Assistant/AnswerBubble.test.tsx`
Expected: PASS。

### 5c. ChatInput / EmptyState / MessageList（展示，无独立测试，靠页面 + 类型 + lint 兜底）

- [ ] **Step 9: 实现 ChatInput**

Create `client/src/pages/Assistant/ChatInput.tsx`:

```tsx
import React, { useRef } from 'react';
import { Plus, ArrowUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onNewChat: () => void;
  sending: boolean;
}

const ChatInput: React.FC<Props> = ({ value, onChange, onSend, onNewChat, sending }) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  };

  return (
    <div className="bg-background mx-auto flex w-full max-w-[760px] items-end gap-1 rounded-3xl border px-2 py-1.5 pl-3 shadow-sm">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="新对话"
        onClick={onNewChat}
        className="text-muted-foreground size-8 shrink-0 rounded-full"
      >
        <Plus className="size-4" />
      </Button>
      <textarea
        ref={ref}
        value={value}
        rows={1}
        onChange={(e) => {
          onChange(e.target.value);
          resize();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder="有问题，尽管问"
        aria-label="AI 输入"
        className="text-foreground placeholder:text-muted-foreground max-h-[200px] min-w-0 flex-1 resize-none border-none bg-transparent px-1.5 py-2 text-[15px] outline-none"
      />
      <Button
        type="button"
        size="icon"
        aria-label="发送"
        onClick={onSend}
        disabled={sending || !value.trim()}
        className="size-9 shrink-0 rounded-full"
      >
        {sending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
      </Button>
    </div>
  );
};

export default ChatInput;
```

- [ ] **Step 10: 实现 EmptyState**

Create `client/src/pages/Assistant/EmptyState.tsx`:

```tsx
import React from 'react';
import { Bot } from 'lucide-react';

const EXAMPLES = [
  '把项目甲的硬件打样推迟两周',
  '把项目甲优先级改成高',
  '给项目甲加一条高风险：电源散热',
  '项目甲现在有几个高风险？',
];

interface Props {
  onPick: (text: string) => void;
}

const EmptyState: React.FC<Props> = ({ onPick }) => (
  <div className="mx-auto flex max-w-[640px] flex-col items-center px-4 py-16 text-center">
    <div className="bg-primary text-primary-foreground flex size-12 items-center justify-center rounded-xl">
      <Bot className="size-6" />
    </div>
    <h2 className="mt-4 text-xl font-semibold">用一句话使用系统</h2>
    <p className="text-muted-foreground mt-1 text-sm">排期、项目字段、风险项——直接说，AI 帮你理解并预览，确认后才写入</p>
    <div className="mt-6 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
      {EXAMPLES.map((ex) => (
        <button
          key={ex}
          type="button"
          onClick={() => onPick(ex)}
          className="hover:border-primary/40 hover:bg-muted/50 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors"
        >
          {ex}
        </button>
      ))}
    </div>
  </div>
);

export default EmptyState;
```

- [ ] **Step 11: 实现 MessageList**

Create `client/src/pages/Assistant/MessageList.tsx`:

```tsx
import React from 'react';
import { Check } from 'lucide-react';
import type { AssistantMessage } from '../../types';
import ProposalCard from './ProposalCard';
import AnswerBubble from './AnswerBubble';

const StepsLine: React.FC<{ steps: string[] }> = ({ steps }) => (
  <div className="text-muted-foreground mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
    {steps.map((s) => (
      <span key={s} className="inline-flex items-center gap-1">
        <Check className="size-3" />
        {s}
      </span>
    ))}
  </div>
);

const PROPOSAL_STEPS = ['意图解析〔AI〕', '生成预览〔系统〕', '风险判定〔系统〕'];
const ANSWER_STEPS = ['问题解析〔AI〕', '查询计算〔系统〕'];

interface Props {
  messages: AssistantMessage[];
  onApply: (id: string) => void;
}

const MessageList: React.FC<Props> = ({ messages, onApply }) => (
  <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 py-6">
    {messages.map((m) => {
      if (m.role === 'user') {
        return (
          <div key={m.id} className="flex justify-end">
            <div className="bg-muted max-w-[80%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed">{m.text}</div>
          </div>
        );
      }
      if (m.kind === 'answer') {
        return (
          <div key={m.id}>
            <StepsLine steps={ANSWER_STEPS} />
            <AnswerBubble answer={m.answer} basis={m.basis} elapsedMs={m.elapsedMs} />
          </div>
        );
      }
      if (m.kind === 'proposal') {
        return (
          <div key={m.id}>
            <StepsLine steps={PROPOSAL_STEPS} />
            <ProposalCard message={m} onApply={() => onApply(m.id)} />
          </div>
        );
      }
      // status
      return (
        <div
          key={m.id}
          className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm"
        >
          {m.text}
        </div>
      );
    })}
  </div>
);

export default MessageList;
```

- [ ] **Step 12: typecheck + lint 通过**

Run: `cd client && npx tsc --noEmit && cd .. && npm run lint`
Expected: 0 error，0 warning。

- [ ] **Step 13: Commit**

```bash
git add client/src/pages/Assistant
git commit -m "feat(assistant): add chat presentational components (proposal/answer/input/empty/list)"
```

---

## Task 6: 全屏聊天页 + 路由

**Files:**
- Create: `client/src/pages/Assistant/index.tsx`
- Modify: `client/src/App.tsx`（lazy import + `/assistant` 路由）

- [ ] **Step 1: 实现页面**

Create `client/src/pages/Assistant/index.tsx`:

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import MainLayout from '../../layouts/MainLayout';
import { useAssistantChat } from '../../hooks/useAssistantChat';
import { useAssistantChatStore } from '../../store/assistantChatStore';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import EmptyState from './EmptyState';

const Assistant: React.FC = () => {
  const [params] = useSearchParams();
  const contextProjectId = params.get('project');
  const { messages, sending, send, applyProposal, reset } = useAssistantChat();
  const [input, setInput] = useState('');
  const ranRef = useRef(false);

  // 首页 hero 交接的首条消息：挂载时自动发送一次
  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    const pending = useAssistantChatStore.getState().pendingUtterance;
    if (pending) {
      useAssistantChatStore.getState().setPendingUtterance(null);
      void send(pending, contextProjectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doSend = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setInput('');
    void send(t, contextProjectId);
  };

  return (
    <MainLayout>
      <div className="flex h-[calc(100vh-3.5rem)] flex-col">
        <div className="flex-1 overflow-auto">
          {messages.length === 0 ? (
            <EmptyState onPick={(t) => doSend(t)} />
          ) : (
            <MessageList messages={messages} onApply={applyProposal} />
          )}
        </div>
        <div className="shrink-0 px-4 pb-4 pt-2">
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={() => doSend(input)}
            onNewChat={() => {
              reset();
              setInput('');
            }}
            sending={sending}
          />
        </div>
      </div>
    </MainLayout>
  );
};

export default Assistant;
```

> 注：`MainLayout` 内部已是 `<div className="page-content">{children}</div>`；本页用 `h-[calc(100vh-3.5rem)]`（顶栏 `h-14` = 3.5rem）撑满视口、底部输入固定、消息区滚动。

- [ ] **Step 2: 注册路由**

In `client/src/App.tsx`:

加 lazy import（紧跟 `const Home = ...` 之后）：
```tsx
const Assistant = React.lazy(() => import('./pages/Assistant'));
```

在 `<Route path="/" .../>` 之后插入：
```tsx
{/* AI 助手全屏聊天页 */}
<Route
  path="/assistant"
  element={
    <ProtectedRoute requirePermission={{ resource: 'activity', action: 'update' }}>
      <Assistant />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 3: typecheck 通过**

Run: `cd client && npx tsc --noEmit`
Expected: 0 error。

- [ ] **Step 4: 手动冒烟**

Run: `npm run dev`（根目录），浏览器登录后访问 `/assistant`。
Expected: 空态出现问候 + 4 个示例 chip；点 chip 或输入发送后出现用户气泡 + 助手回应；底部输入框可多行自增长；「新对话」清空。

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Assistant/index.tsx client/src/App.tsx
git commit -m "feat(assistant): add /assistant full-screen chat page + route"
```

---

## Task 7: 导航项 + 浮层改为跳转

**Files:**
- Modify: `client/src/layouts/MainLayout.tsx`
- Modify: `client/src/components/AssistantLauncher.tsx`
- Modify: `client/src/components/AssistantLauncher.test.tsx`

- [ ] **Step 1: 重写 launcher 测试（先改测试，TDD）**

Replace the entire contents of `client/src/components/AssistantLauncher.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mockNavigate,
}));

import AssistantLauncher from './AssistantLauncher';

beforeEach(() => vi.clearAllMocks());

describe('AssistantLauncher (navigate FAB)', () => {
  it('renders the FAB', () => {
    render(<AssistantLauncher projectId="p1" />);
    expect(screen.getByLabelText('打开 AI 助手')).toBeInTheDocument();
  });

  it('navigates to /assistant with project context', () => {
    render(<AssistantLauncher projectId="p1" />);
    fireEvent.click(screen.getByLabelText('打开 AI 助手'));
    expect(mockNavigate).toHaveBeenCalledWith('/assistant?project=p1');
  });

  it('navigates without project param when projectId is null', () => {
    render(<AssistantLauncher projectId={null} />);
    fireEvent.click(screen.getByLabelText('打开 AI 助手'));
    expect(mockNavigate).toHaveBeenCalledWith('/assistant');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd client && npx vitest run src/components/AssistantLauncher.test.tsx`
Expected: FAIL（旧实现仍是开合面板，无 navigate）。

- [ ] **Step 3: 重写 AssistantLauncher**

Replace the entire contents of `client/src/components/AssistantLauncher.tsx`:

```tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AssistantLauncherProps {
  /** 当前路由的项目上下文；非项目页为 null */
  projectId: string | null;
}

/**
 * 右下角常驻 AI 助手按钮：点击跳转到全屏聊天页 /assistant，带当前项目上下文。
 */
const AssistantLauncher: React.FC<AssistantLauncherProps> = ({ projectId }) => {
  const navigate = useNavigate();
  const go = () => navigate(projectId ? `/assistant?project=${projectId}` : '/assistant');

  return (
    <Button
      size="icon"
      aria-label="打开 AI 助手"
      onClick={go}
      className="fixed right-6 bottom-6 z-[1000] size-12 rounded-full shadow-lg"
    >
      <Bot className="size-5" />
    </Button>
  );
};

export default AssistantLauncher;
```

- [ ] **Step 4: 运行确认通过**

Run: `cd client && npx vitest run src/components/AssistantLauncher.test.tsx`
Expected: PASS。

- [ ] **Step 5: 加导航项 + 浮层在 /assistant 隐藏**

In `client/src/layouts/MainLayout.tsx`:

(a) 给 lucide 导入加上 `Bot`（在现有 import 块内，例如 `ScrollText,` 之后）：
```tsx
  ScrollText,
  Bot,
```

(b) 在 `navGroups` 的「概览」组追加助手项：
```tsx
    {
      label: '概览',
      items: [
        { key: '/', label: '首页', path: '/', icon: Home },
        { key: '/assistant', label: 'AI 助手', path: '/assistant', icon: Bot, permission: { resource: 'activity', action: 'update' } },
      ],
    },
```

(c) 浮层挂载条件加上排除 `/assistant`：
```tsx
      {canUseAssistant && location.pathname !== '/' && location.pathname !== '/assistant' && (
        <AssistantLauncher projectId={routeProjectId} />
      )}
```

- [ ] **Step 6: typecheck + lint 通过**

Run: `cd client && npx tsc --noEmit && cd .. && npm run lint`
Expected: 0 error，0 warning。

- [ ] **Step 7: Commit**

```bash
git add client/src/layouts/MainLayout.tsx client/src/components/AssistantLauncher.tsx client/src/components/AssistantLauncher.test.tsx
git commit -m "feat(assistant): nav entry + launcher navigates to /assistant"
```

---

## Task 8: 首页 — 换 hero 输入 + 风险区按需显示

**Files:**
- Modify: `client/src/pages/Home/index.tsx`
- Modify: `client/src/pages/Home/index.test.tsx`

- [ ] **Step 1: 改首页实现**

In `client/src/pages/Home/index.tsx`:

(a) 把 import 行
```tsx
import AssistantConversation from '../../components/AssistantConversation';
```
改成
```tsx
import AssistantHeroInput from '../../components/AssistantHeroInput';
```

(b) hero 卡片里把
```tsx
            <AssistantConversation projectId={null} variant="hero" />
```
改成
```tsx
            <AssistantHeroInput />
```

(c) 在 `topActionItems` 定义之后加一个「有无风险点」派生值：
```tsx
  // 只看真实风险；topConcerns 可能是善意提示（「风险可控」），不计入门槛
  const hasRiskPoints = highRiskProjects.length > 0 || topActionItems.length > 0;
```

(d) 把整张「项目风险点（AI 分析）」`<Card>`（从 `{/* AI 分析出的项目风险点 */}` 注释到该 `</Card>`）整体包裹成按需渲染——仅在加载完成且有风险点时显示，去掉加载骨架与空态分支：

将原本以 `<Card className="mb-8 p-6">` 开头、内部含 `loading ? ... : !dashboard ? ... : (...)` 的整块，替换为：
```tsx
        {/* AI 分析出的项目风险点：默认不显示，仅当有风险点时才出现 */}
        {!loading && dashboard && hasRiskPoints && (
          <Card className="mb-8 p-6">
            <div className="mb-4 flex items-center gap-2">
              <TriangleAlert className="size-[18px] text-amber-500" />
              <h3 className="text-base font-semibold">项目风险点（AI 分析）</h3>
            </div>

            {/* 风险等级分布 */}
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {DISTRIBUTION.map((d) => (
                <Card key={d.key} className="p-3 text-center shadow-none">
                  <div className={cn('text-2xl font-bold', d.num)}>{dashboard.riskDistribution[d.key] ?? 0}</div>
                  <div className="text-muted-foreground mt-0.5 text-xs">{d.label}</div>
                </Card>
              ))}
            </div>

            {/* AI 关注点 */}
            {topConcerns.length > 0 && (
              <div className="mb-5">
                <div className="text-sm font-semibold">AI 重点关注</div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {topConcerns.map((c, i) => (
                    <li key={i} className="text-muted-foreground text-sm">{c}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 高风险项目 */}
            {highRiskProjects.length > 0 && (
              <>
                <div className="text-sm font-semibold">高风险项目</div>
                <div className="mt-2 mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {highRiskProjects.slice(0, 6).map((p) => {
                    const meta = RISK_LEVEL_MAP[p.riskLevel as keyof typeof RISK_LEVEL_MAP];
                    return (
                      <Card
                        key={p.projectId}
                        className="hover:border-primary/40 cursor-pointer p-3 transition-colors hover:shadow-sm"
                        onClick={() => navigate(`/projects/${p.projectId}`)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold">{p.projectName}</span>
                          <Badge variant="outline" className={cn('shrink-0', riskBadgeClass[p.riskLevel])}>
                            {meta?.label || p.riskLevel}
                          </Badge>
                        </div>
                        {p.aiInsights && <p className="text-muted-foreground mt-2 line-clamp-2 text-xs">{p.aiInsights}</p>}
                      </Card>
                    );
                  })}
                </div>
              </>
            )}

            {/* 重点行动项 */}
            {topActionItems.length > 0 && (
              <div>
                <div className="text-sm font-semibold">重点行动项</div>
                <div className="mt-2">
                  {topActionItems.slice(0, 8).map((item, i) => (
                    <div
                      key={i}
                      className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 border-b py-1.5 last:border-b-0"
                      onClick={() => navigate(`/projects/${item.projectId}`)}
                    >
                      <Badge variant="outline" className={cn('shrink-0', PRIORITY_BADGE[item.priority] || '')}>
                        {item.priority}
                      </Badge>
                      <span className="text-[13px]">{item.action}</span>
                      <span className="text-muted-foreground ml-auto text-xs">{item.projectName}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}
```

> 这样：加载中不渲染任何风险区（无骨架闪烁）；无风险点时首页只剩 hero 输入框；`Skeleton` 若变为未使用，删除其 import 以免 lint 报未用。

(e) 若 `Skeleton` 不再被引用，删除其 import 行 `import { Skeleton } from '@/components/ui/skeleton';`。

- [ ] **Step 2: 改首页测试**

Replace the entire contents of `client/src/pages/Home/index.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from './index';
import type { RiskDashboardData, RiskDashboardInsights } from '../../types';

const { mockGetDashboard, mockGetInsights } = vi.hoisted(() => ({
  mockGetDashboard: vi.fn(),
  mockGetInsights: vi.fn(),
}));

vi.mock('../../api', () => ({
  riskApi: { getDashboard: mockGetDashboard, getInsights: mockGetInsights },
}));

// 隔离 hero 输入（其自身测试已覆盖）：只验证首页装配
vi.mock('../../components/AssistantHeroInput', () => ({
  default: () => <div data-testid="hero-input" />,
}));

// MainLayout 依赖 store/路由，简化为透传
vi.mock('../../layouts/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const dashboard: RiskDashboardData = {
  projects: [
    { projectId: 'p1', projectName: '项目甲', productLine: null, riskLevel: 'CRITICAL', assessedAt: '2026-06-01', source: 'ai', aiInsights: '关键路径有阻塞风险', trendDirection: 'WORSENING' },
    { projectId: 'p2', projectName: '项目乙', productLine: null, riskLevel: 'LOW', assessedAt: '2026-06-01', source: 'rule_engine', aiInsights: null, trendDirection: 'STABLE' },
  ],
  riskDistribution: { LOW: 3, MEDIUM: 2, HIGH: 1, CRITICAL: 1 },
  topActionItems: [{ projectId: 'p1', projectName: '项目甲', action: '尽快补齐固件联调资源', priority: 'HIGH' }],
};
const insights: RiskDashboardInsights = {
  topConcerns: ['项目甲关键路径阻塞', '整体进度偏慢'],
  improvements: [],
  deteriorations: [],
  generatedAt: '2026-06-01',
};

const renderHome = () => render(<MemoryRouter><Home /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDashboard.mockResolvedValue({ data: dashboard });
  mockGetInsights.mockResolvedValue({ data: insights });
});

describe('Home (AI 首页)', () => {
  it('always renders the hero input', () => {
    renderHome();
    expect(screen.getByTestId('hero-input')).toBeInTheDocument();
  });

  it('shows the risk section when there are risk points', async () => {
    renderHome();
    await waitFor(() => expect(screen.getByText('项目风险点（AI 分析）')).toBeInTheDocument());
    expect(screen.getByText('关键路径有阻塞风险')).toBeInTheDocument();
    expect(screen.getByText('项目甲关键路径阻塞')).toBeInTheDocument();
    expect(screen.getByText('尽快补齐固件联调资源')).toBeInTheDocument();
  });

  it('hides the risk section entirely when there are no risk points', async () => {
    mockGetDashboard.mockResolvedValueOnce({
      data: { ...dashboard, projects: [dashboard.projects[1]], topActionItems: [] }, // 仅 LOW，无行动项
    });
    mockGetInsights.mockResolvedValueOnce({ data: { ...insights, topConcerns: [] } });
    renderHome();
    // hero 始终在；等渲染稳定后断言风险区缺席
    expect(screen.getByTestId('hero-input')).toBeInTheDocument();
    await waitFor(() => expect(mockGetDashboard).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('项目风险点（AI 分析）')).not.toBeInTheDocument());
  });

  it('shows only the hero when risk data fails to load', async () => {
    mockGetDashboard.mockRejectedValueOnce(new Error('network'));
    renderHome();
    await waitFor(() => expect(mockGetDashboard).toHaveBeenCalled());
    expect(screen.getByTestId('hero-input')).toBeInTheDocument();
    expect(screen.queryByText('项目风险点（AI 分析）')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: 运行首页测试确认通过**

Run: `cd client && npx vitest run src/pages/Home/index.test.tsx`
Expected: PASS（4 用例）。

- [ ] **Step 4: typecheck + lint 通过**

Run: `cd client && npx tsc --noEmit && cd .. && npm run lint`
Expected: 0 error，0 warning（确认无未用 import）。

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Home/index.tsx client/src/pages/Home/index.test.tsx
git commit -m "feat(assistant): homepage shows only the input by default; risk section on-demand"
```

---

## Task 9: 退役 AssistantConversation

**Files:**
- Delete: `client/src/components/AssistantConversation.tsx`
- Delete: `client/src/components/AssistantConversation.test.tsx`

- [ ] **Step 1: 确认无残留引用**

Run: `grep -rn "AssistantConversation" client/src`
Expected: 无输出（Home 与 Launcher 已改；其逻辑已迁移到 hook/组件）。

- [ ] **Step 2: 删除文件**

Run:
```bash
git rm client/src/components/AssistantConversation.tsx client/src/components/AssistantConversation.test.tsx
```

- [ ] **Step 3: typecheck + 全量单测 + lint**

Run: `cd client && npx tsc --noEmit && npx vitest run && cd .. && npm run lint`
Expected: typecheck 0 error；vitest 全绿；lint 0 warning。

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(assistant): retire AssistantConversation (logic moved to hook/components)"
```

---

## Task 10: 收尾验证

- [ ] **Step 1: 前端全量单测**

Run: `cd client && npx vitest run`
Expected: 全部通过，包含新增的 store / hook / hero / proposal / answer / home / launcher 测试。

- [ ] **Step 2: typecheck + lint（根）**

Run: `cd client && npx tsc --noEmit && cd .. && npm run lint`
Expected: 0 error，0 warning。

- [ ] **Step 3: 端到端手动走查**

Run: `npm run dev`，登录后依次验证（对照 `00-design.md` §6 验收标准）：
1. 左侧「AI 助手」导航、某项目页右下角按钮、首页 hero 提交 → 都进入 `/assistant`，项目页进入时带 `?project=`。
2. 连续多条输入 → 气泡对话流堆叠，不互相重置。
3. 指令类（如「把整机测试的工期改成 5 天」）→ 内嵌「改动预览」卡片 → 应用全部 → 确认弹窗 → 卡片就地变「已应用」。
4. 提问类（如「项目甲现在有几个高风险？」）→ Markdown 回答 + 来源徽标 + 耗时。
5. 整页刷新 → 对话仍在；「新对话」清空。
6. 首页：有风险点时显示风险区；构造无风险点场景时首页只剩输入框。

- [ ] **Step 4: 最终提交（如手动走查发现样式微调）**

```bash
git add -A
git commit -m "polish(assistant): final chat UI tweaks after manual walkthrough"
```

---

## 自检：spec 覆盖对照

| `00-design.md` 要求 | 对应任务 |
|---|---|
| 全屏页 `/assistant` + 路由 | Task 6 |
| 导航项「AI 助手」（`activity:update` 门控） | Task 7 |
| 浮层 → 跳转、带 `?project=`、`/assistant` 隐藏 | Task 7 |
| 首页 hero 交接 + 自动发送 | Task 4 + Task 6 |
| 首页默认只显示输入框、风险区按需 | Task 8 |
| `assistantChatStore` + localStorage 持久化 | Task 2 |
| 消息 union（user/answer/proposal/status） | Task 1 + Task 2 |
| propose/apply 编排、每轮独立、降级 | Task 3 |
| 步骤行 + 内嵌预览卡片 + 就地「已应用」 | Task 5（ProposalCard/MessageList） |
| Markdown 回答 + 来源徽标 + 耗时 | Task 5（AnswerBubble） |
| 保留确认弹窗（安全模型） | Task 5（ProposalCard AlertDialog） |
| `assistant:applied` 事件 | Task 3 |
| 新单测 + 迁移旧测 | Task 2/3/4/5/7/8 |
| 后端零改动 | 全程不触 server/ |
| lint 0 warning | Task 5/7/8/9/10 |
