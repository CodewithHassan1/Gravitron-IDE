// src/services/quickInput/ContextEngine.ts
import { systemEventBus, SystemEvents } from '../../lib/events/SystemEvents';
import { ContextExpression } from '@ag/core';

export class ContextEngineImpl {
  private context: Map<string, any> = new Map();
  private parsedExpressions: Map<string, ContextExpression> = new Map();

  constructor() {
    // Default context values
    this.context.set('isMac', navigator.userAgent.includes('Mac'));
    this.context.set('isWindows', navigator.userAgent.includes('Win'));
    this.context.set('isLinux', navigator.userAgent.includes('Linux'));
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
