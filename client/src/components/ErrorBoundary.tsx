import React, { Component, ErrorInfo } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { captureAppError } from '../utils/monitoring';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    captureAppError(error, {
      tags: { source: 'ErrorBoundary' },
      extra: { componentStack: errorInfo.componentStack },
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
          <TriangleAlert className="text-destructive size-12" />
          <div>
            <h2 className="text-xl font-semibold">页面出错了</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {process.env.NODE_ENV === 'development'
                ? this.state.error?.message
                : '请刷新页面重试，如问题持续请联系管理员'}
            </p>
          </div>
          <div className="flex gap-3">
            <Button onClick={this.handleReset}>重试</Button>
            <Button variant="outline" onClick={() => (window.location.href = '/')}>
              返回首页
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
