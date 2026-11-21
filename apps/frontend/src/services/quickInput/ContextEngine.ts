// src/services/quickInput/ContextEngine.ts
import { systemEventBus, SystemEvents } from '../../lib/events/SystemEvents';
import { ContextExpression } from '@ag/core';

export class ContextEngineImpl {
  private context: Map<string, any> = new Map();
  private parsedExpressions: Map<string, ContextExpression> = new Map();

  constructor() {
    // Default context values with safe environment detection
    const userAgent = typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : '';
    const platform = typeof process !== 'undefined' && process.platform ? process.platform : '';

    this.context.set('isMac', userAgent ? userAgent.includes('Mac') : platform === 'darwin');
    this.context.set('isWindows', userAgent ? userAgent.includes('Win') : platform === 'win32');
    this.context.set('isLinux', userAgent ? userAgent.includes('Linux') : platform === 'linux');
  }

  setContext(key: string, value: any) {
    if (this.context.get(key) !== value) {
      this.context.set(key, value);
      systemEventBus.emit(SystemEvents.ContextChanged as any, { key, value });
    }
  }

  getContext(key: string): any {
    return this.context.get(key);
  }

  evaluate(expression: string | undefined): boolean {
    if (!expression) return true; // Empty expression means always true

    let ast = this.parsedExpressions.get(expression);
    if (!ast) {
      ast = ContextExpression.parse(expression);
      this.parsedExpressions.set(expression, ast);
    }

    return ast.evaluate(this.context);
  }
}

export const ContextEngine = new ContextEngineImpl();
