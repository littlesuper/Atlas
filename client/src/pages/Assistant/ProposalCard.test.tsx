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
