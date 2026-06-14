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
  useAssistantChatStore.setState({ messages: [] });
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
