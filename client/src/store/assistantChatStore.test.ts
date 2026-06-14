import { describe, it, expect, beforeEach } from 'vitest';
import { useAssistantChatStore } from './assistantChatStore';

const reset = () => useAssistantChatStore.setState({ messages: [] });

describe('assistantChatStore', () => {
  beforeEach(() => {
    localStorage.clear();
    reset();
  });

  it('starts empty', () => {
    expect(useAssistantChatStore.getState().messages).toEqual([]);
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

  it('persists messages to localStorage', () => {
    useAssistantChatStore.getState().pushUser('记住我');
    expect(localStorage.getItem('atlas-assistant-chat')).toContain('记住我');
  });
});
