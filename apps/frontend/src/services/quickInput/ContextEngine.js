'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ContextEngine = exports.ContextEngineImpl = void 0;
// src/services/quickInput/ContextEngine.ts
const SystemEvents_1 = require('../../lib/events/SystemEvents');
const core_1 = require('@ag/core');
class ContextEngineImpl {
  context = new Map();
  parsedExpressions = new Map();
  constructor() {
    // Default context values
    this.context.set('isMac', navigator.userAgent.includes('Mac'));
    this.context.set('isWindows', navigator.userAgent.includes('Win'));
    this.context.set('isLinux', navigator.userAgent.includes('Linux'));
  }
  setContext(key, value) {
    if (this.context.get(key) !== value) {
      this.context.set(key, value);
      SystemEvents_1.systemEventBus.emit(SystemEvents_1.SystemEvents.ContextChanged, {
        key,
        value,
      });
    }
  }
  getContext(key) {
    return this.context.get(key);
  }
  evaluate(expression) {
    if (!expression) return true; // Empty expression means always true
    let ast = this.parsedExpressions.get(expression);
    if (!ast) {
      ast = core_1.ContextExpression.parse(expression);
      this.parsedExpressions.set(expression, ast);
    }
    return ast.evaluate(this.context);
  }
}
exports.ContextEngineImpl = ContextEngineImpl;
exports.ContextEngine = new ContextEngineImpl();
