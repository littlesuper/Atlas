import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AnswerBubble from './AnswerBubble';

describe('AnswerBubble', () => {
  it('renders markdown answer text', () => {
    const { container } = render(<AnswerBubble answer={'项目甲当前有 **3** 个高风险项。'} basis="deterministic" />);
    expect(container.textContent).toMatch(/3 个高风险项/);
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
