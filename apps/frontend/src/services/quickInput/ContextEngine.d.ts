export declare class ContextEngineImpl {
  private context;
  private parsedExpressions;
  constructor();
  setContext(key: string, value: any): void;
  getContext(key: string): any;
  evaluate(expression: string | undefined): boolean;
}
export declare const ContextEngine: ContextEngineImpl;
