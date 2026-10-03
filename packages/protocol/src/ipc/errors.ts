export class PlatformError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends PlatformError {
  constructor(message: string, details?: any) {
    super('VALIDATION_ERROR', message, details);
  }
}

export class PermissionDeniedError extends PlatformError {
  constructor(message: string = 'Permission Denied', details?: any) {
    super('PERMISSION_DENIED', message, details);
  }
}

export class ServiceUnavailableError extends PlatformError {
  constructor(message: string = 'Service Unavailable', details?: any) {
    super('SERVICE_UNAVAILABLE', message, details);
  }
}

export class TimeoutError extends PlatformError {
  constructor(message: string = 'Operation Timed Out', details?: any) {
    super('TIMEOUT_ERROR', message, details);
  }
}

export class NotFoundError extends PlatformError {
  constructor(message: string = 'Resource Not Found', details?: any) {
    super('NOT_FOUND', message, details);
  }
}

export class InternalError extends PlatformError {
  constructor(message: string = 'Internal Error', details?: any) {
    super('INTERNAL_ERROR', message, details);
  }
}
