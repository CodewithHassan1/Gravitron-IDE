export const ERROR_CODES = {
  ERR_AUTH_INVALID_TOKEN: { code: 'UNAUTHENTICATED', status: 401 },
  ERR_FORBID_POLICY: { code: 'PERMISSION_DENIED', status: 403 },
  ERR_WS_NOT_FOUND: { code: 'NOT_FOUND', status: 404 },
  ERR_EXEC_TIMEOUT: { code: 'DEADLINE_EXCEEDED', status: 504 },
  ERR_QUOTA_EXCEEDED: { code: 'RESOURCE_EXHAUSTED', status: 429 },
  ERR_INTERNAL_SERVER: { code: 'INTERNAL', status: 500 },
  ERR_VALIDATION_FAILED: { code: 'INVALID_ARGUMENT', status: 400 },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export class AGError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AGError';
  }

  get grpcCode() {
    return ERROR_CODES[this.code].code;
  }

  get httpStatus() {
    return ERROR_CODES[this.code].status;
  }

  toRFC7807(instancePath?: string) {
    return {
      type: `https://ag-ide.local/errors/${this.code}`,
      title: this.code,
      status: this.httpStatus,
      detail: this.message,
      instance: instancePath,
      extensions: this.details,
    };
  }
}
