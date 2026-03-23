/**
 * 简易熔断器
 * 当外部服务（如 AI API）连续失败达到阈值时，自动熔断一段时间
 */

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
  /** 连续失败多少次后熔断 */
  failureThreshold: number;
  /** 熔断持续时间（毫秒） */
  resetTimeout: number;
  /** 半开状态允许的试探请求数 */
  halfOpenRequests: number;
}

const defaultOptions: CircuitBreakerOptions = {
  failureThreshold: 3,
  resetTimeout: 60_000, // 1 分钟
  halfOpenRequests: 1,
};

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;
  private options: CircuitBreakerOptions;
  public name: string;

  constructor(name: string, options?: Partial<CircuitBreakerOptions>) {
    this.name = name;
    this.options = { ...defaultOptions, ...options };
  }

  /**
   * 执行受熔断器保护的操作
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.options.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.halfOpenAttempts = 0;
      } else {
        throw new Error(`熔断器 [${this.name}] 已开启，服务暂时不可用`);
      }
    }

    if (this.state === 'HALF_OPEN' && this.halfOpenAttempts >= this.options.halfOpenRequests) {
      throw new Error(`熔断器 [${this.name}] 半开状态，等待试探请求完成`);
    }

    try {
      if (this.state === 'HALF_OPEN') {
        this.halfOpenAttempts++;
      }

      const result = await fn();

      // 成功：重置状态
      this.reset();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN' || this.failureCount >= this.options.failureThreshold) {
      this.state = 'OPEN';
      console.warn(
        `熔断器 [${this.name}] 开启: 连续失败 ${this.failureCount} 次, ` +
        `将在 ${this.options.resetTimeout / 1000}s 后尝试恢复`
      );
    }
  }

  private reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
  }

  getState(): { state: CircuitState; failureCount: number } {
    return { state: this.state, failureCount: this.failureCount };
  }
}

// 预配置的 AI 服务熔断器
export const aiCircuitBreaker = new CircuitBreaker('AI-API', {
  failureThreshold: 3,
  resetTimeout: 60_000,
  halfOpenRequests: 1,
});
