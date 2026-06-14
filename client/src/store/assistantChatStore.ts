import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AssistantMessage, AssistantDraft } from '../types';

interface AssistantChatState {
  messages: AssistantMessage[];
  pushUser: (text: string) => string;
  pushAssistant: (draft: AssistantDraft) => string;
  // updateMessage 只用于就地改 proposal 卡片状态（applied/stale），故按 proposal 收窄
  // （Partial<union> 只暴露公共键 id/role，无法接受 { applied } —— 必须 Extract）
  updateMessage: (id: string, patch: Partial<Extract<AssistantMessage, { kind: 'proposal' }>>) => void;
  reset: () => void;
}

let seq = 0;
const newId = () => `m${seq++}-${Math.floor(performance.now())}`;

export const useAssistantChatStore = create<AssistantChatState>()(
  persist(
    (set) => ({
      messages: [],

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
    }),
    {
      name: 'atlas-assistant-chat',
      // 只持久化对话，不持久化临时交接
      partialize: (s) => ({ messages: s.messages }),
    }
  )
);
