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
  if (r.mode === 'need_input') {
    return { role: 'assistant', kind: 'status', variant: 'need_input', text: r.narrative || `还需要补充：${(r.missing ?? []).join('、')}`, missing: r.missing, pendingId: r.pendingId };
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
  const setPending = useAssistantChatStore((s) => s.setPending);
  const clearPending = useAssistantChatStore((s) => s.clearPending);
  const [sending, setSending] = useState(false);

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

  const cancelPending = useCallback(() => {
    clearPending();
    pushAssistant({ role: 'assistant', kind: 'status', variant: 'noop', text: '已取消补充，可重新发起。' });
  }, [clearPending, pushAssistant]);

  return { messages, sending, send, applyProposal, reset, cancelPending };
}
