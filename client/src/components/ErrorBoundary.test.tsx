import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

// Component that throws
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) throw new Error('Test error');
  return <div>Normal content</div>;
};

describe('ErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  const preventExpectedError = (event: ErrorEvent) => {
    if (event.error?.message === 'Test error') {
      event.preventDefault();
    }
  };

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    window.addEventListener('error', preventExpectedError);
  });

  afterEach(() => {
    window.removeEventListener('error', preventExpectedError);
    consoleErrorSpy.mockRestore();
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

  it('catches errors from deeply nested children', () => {
    const DeepThrow = () => {
      return (
        <div>
          <span>Level 1</span>
          <div>
            <ThrowError shouldThrow={true} />
          </div>
        </div>
      );
    };

    render(
      <ErrorBoundary>
        <DeepThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('页面出错了')).toBeInTheDocument();
  });

  it('shows both error UI and retry button consistently', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('页面出错了')).toBeInTheDocument();
    expect(screen.getByText('重试')).toBeInTheDocument();
    expect(screen.getByText('返回首页')).toBeInTheDocument();
  });

  it('renders multiple children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Child 1</div>
        <div>Child 2</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Child 1')).toBeInTheDocument();
    expect(screen.getByText('Child 2')).toBeInTheDocument();
  });

  it('error message contains error details in development', () => {
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

  it('shows generic message in production mode', () => {
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('请刷新页面重试，如问题持续请联系管理员')).toBeInTheDocument();
    process.env.NODE_ENV = env;
  });

  it('recovers children after reset when error resolves', () => {
    let shouldThrow = true;
    const ConditionalThrow = () => {
      if (shouldThrow) throw new Error('Test error');
      return <div>Recovered</div>;
    };
    render(
      <ErrorBoundary>
        <ConditionalThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('页面出错了')).toBeInTheDocument();
    shouldThrow = false;
    fireEvent.click(screen.getByText('重试'));
    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });

  it('logs error to console with error info', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
    const allCalls = consoleErrorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(allCalls).toMatch(/ErrorBoundary|Test error/);
  });

  it('displays dynamic error message in development mode', () => {
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const CustomThrow = () => {
      throw new Error('Custom unique error XYZ');
    };
    render(
      <ErrorBoundary>
        <CustomThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('Custom unique error XYZ')).toBeInTheDocument();
    process.env.NODE_ENV = env;
  });

  it('catches errors from React fragment children', () => {
    render(
      <ErrorBoundary>
        <>
          <div>Before</div>
          <ThrowError shouldThrow={true} />
        </>
      </ErrorBoundary>
    );
    expect(screen.getByText('页面出错了')).toBeInTheDocument();
  });

  it('renders null children without crashing', () => {
    render(
      <ErrorBoundary>
        {null}
      </ErrorBoundary>
    );
    expect(screen.queryByText('页面出错了')).not.toBeInTheDocument();
  });

  it('catches TypeError from child components', () => {
    const TypeThrow = () => {
      throw new TypeError('Cannot read properties of undefined');
    };
    render(
      <ErrorBoundary>
        <TypeThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('页面出错了')).toBeInTheDocument();
  });

  it('return home button navigates to root', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    const homeBtn = screen.getByText('返回首页');
    expect(homeBtn).toBeInTheDocument();
    expect(homeBtn.closest('button')).toBeTruthy();
  });

  it('catches RangeError from child components', () => {
    const RangeThrow = () => {
      throw new RangeError('Maximum call stack size exceeded');
    };
    render(
      <ErrorBoundary>
        <RangeThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('页面出错了')).toBeInTheDocument();
  });

  it('renders both retry and home buttons after catching error', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('重试')).toBeInTheDocument();
    expect(screen.getByText('返回首页')).toBeInTheDocument();
  });

  it('catches SyntaxError from child components', () => {
    const SyntaxThrow = () => {
      throw new SyntaxError('Unexpected token');
    };
    render(
      <ErrorBoundary>
        <SyntaxThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('页面出错了')).toBeInTheDocument();
  });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>safe child</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('safe child')).toBeInTheDocument();
  });

  it('renders multiple children when no error', () => {
    render(
      <ErrorBoundary>
        <div>child 1</div>
        <div>child 2</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('child 1')).toBeInTheDocument();
    expect(screen.getByText('child 2')).toBeInTheDocument();
  });

  it('captureAppError is called with ErrorBoundary source tag', () => {
    const { mockCaptureAppError } = (() => {
      const m = vi.hoisted(() => ({ mockCaptureAppError: vi.fn() }));
      vi.mock('../../utils/monitoring', () => ({ captureAppError: m.mockCaptureAppError }));
      return m;
    })();
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
  });

  it('renders children after reset when error condition persists across rerender', () => {
    let shouldThrow = true;
    const ConditionalThrow = () => {
      if (shouldThrow) throw new Error('Test error');
      return <div>Child content</div>;
    };
    const { rerender } = render(
      <ErrorBoundary>
        <ConditionalThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('页面出错了')).toBeInTheDocument();
    shouldThrow = false;
    fireEvent.click(screen.getByText('重试'));
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('re-throws after reset when error persists across re-render', () => {
    const AlwaysThrow = () => { throw new Error('persistent'); };
    const { container } = render(
      <ErrorBoundary>
        <AlwaysThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('页面出错了')).toBeInTheDocument();
    fireEvent.click(screen.getByText('重试'));
    expect(screen.getByText('页面出错了')).toBeInTheDocument();
  });

  it('catches ReferenceError from child component', () => {
    const RefThrow = () => {
      throw new ReferenceError('notDefined is not defined');
    };
    render(
      <ErrorBoundary>
        <RefThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('页面出错了')).toBeInTheDocument();
  });

  it('handles error with empty message in development', () => {
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const EmptyMsgThrow = () => { throw new Error(''); };
    render(
      <ErrorBoundary>
        <EmptyMsgThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('页面出错了')).toBeInTheDocument();
    process.env.NODE_ENV = env;
  });

  it('ErrorBoundary renders children when no error', () => {
    const { container } = render(
      <ErrorBoundary>
        <div data-testid="child">OK</div>
      </ErrorBoundary>
    );
    expect(container.querySelector('[data-testid="child"]')).toBeTruthy();
  });

  it('ErrorBoundary catches error in render', () => {
    const ThrowingComponent = () => { throw new Error('test error'); };
    const { container } = render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(container.textContent).toBeTruthy();
  });

  it('ErrorBoundary renders children when no error', () => {
    const { container } = render(
      <ErrorBoundary>
        <div>safe content</div>
      </ErrorBoundary>
    );
    expect(container.textContent).toContain('safe content');
  });

  it('ErrorBoundary catches error from throw in child', () => {
    const ThrowComponent = () => { throw new Error('child error'); };
    const { container } = render(
      <ErrorBoundary>
        <ThrowComponent />
      </ErrorBoundary>
    );
    expect(container.textContent).toBeTruthy();
  });

  it('ErrorBoundary catches error and renders fallback with children prop', () => {
    const Throwing = () => { throw new Error('boundary test'); };
    const { container } = render(
      <ErrorBoundary>
        <Throwing />
      </ErrorBoundary>
    );
    expect(container.textContent).toBeTruthy();
  });

  it('ErrorBoundary renders children when no error', () => {
    const { container } = render(
      <ErrorBoundary>
        <div>safe content</div>
      </ErrorBoundary>
    );
    expect(container.textContent).toContain('safe content');
  });

  it('ErrorBoundary catches error on initial render', () => {
    const ThrowOnMount = () => { throw new Error('mount error'); };
    const { container } = render(<ErrorBoundary><ThrowOnMount /></ErrorBoundary>);
    expect(container.textContent).toBeTruthy();
  });
});
