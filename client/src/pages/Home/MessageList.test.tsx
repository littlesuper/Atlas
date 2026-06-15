import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MessageList from './MessageList';

const renderList = (sending: boolean) =>
  render(
    <MemoryRouter>
      <MessageList messages={[]} onApply={() => {}} sending={sending} />
    </MemoryRouter>
  );

describe('MessageList 思考中指示器', () => {
  it('sending 为 true 时显示「思考中…」', () => {
    renderList(true);
    expect(screen.getByText('思考中…')).toBeInTheDocument();
  });

  it('sending 为 false 时不显示', () => {
    renderList(false);
    expect(screen.queryByText('思考中…')).not.toBeInTheDocument();
  });
});
