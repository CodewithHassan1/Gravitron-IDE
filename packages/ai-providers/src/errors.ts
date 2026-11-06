export enum ProviderErrorType {
  RateLimit = 'RateLimit',
  Authentication = 'Authentication',
  Timeout = 'Timeout',
  ContextExhausted = 'ContextExhausted',
  InvalidRequest = 'InvalidRequest',
  Cancelled = 'Cancelled',
  Unknown = 'Unknown',
}

export class ProviderError extends Error {
  public errorType: ProviderErrorType;
  public provider: string;
  public statusCode?: number;
  public isTransient: boolean;

  constructor(
    message: string,
    errorType: ProviderErrorType,
    provider: string,
    isTransient: boolean = false,
    statusCode?: number
  ) {
    super(message);
    this.name = 'ProviderError';
    this.errorType = errorType;
    this.provider = provider;
    this.isTransient = isTransient;
    this.statusCode = statusCode;
  }
}
