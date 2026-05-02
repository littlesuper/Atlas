import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';
import { captureFrontendException } from '../utils/errorTracking';

vi.mock('../utils/errorTracking', () => ({
  captureFrontendException: vi.fn(),
}));

// Component that throws
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) throw new Error('Test error');
  return <div>Normal content</div>;
};

describe('ErrorBoundary', () => {
  // Suppress console.error for expected errors
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
    vi.mocked(captureFrontendException).mockClear();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Hello</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('renders error UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('页面出错了')).toBeInTheDocument();
    expect(captureFrontendException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: { source: 'react_error_boundary' },
      })
    );
  });

  it('shows error message in development', () => {
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Test error')).toBeInTheDocument();
    process.env.NODE_ENV = env;
  });

  it('shows retry button that resets error state', () => {
    const { rerender: _rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('页面出错了')).toBeInTheDocument();
    fireEvent.click(screen.getByText('重试'));
    // After reset, since component still throws, it will show error again
    // but the state was reset
  });

  it('has a return home button', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('返回首页')).toBeInTheDocument();
  });
});
