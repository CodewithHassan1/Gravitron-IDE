export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

export class ToolNotFound extends ToolError {
  constructor(public readonly toolName: string) {
    super(`Tool not found: ${toolName}`);
    this.name = 'ToolNotFound';
  }
}

export class ToolInputValidationFailed extends ToolError {
  constructor(
    public readonly toolName: string,
    public readonly errors: string[]
  ) {
    super(`Input validation failed for tool ${toolName}: ${errors.join(', ')}`);
    this.name = 'ToolInputValidationFailed';
  }
}

export class ToolApprovalDenied extends ToolError {
  constructor(public readonly toolName: string) {
    super(`User denied approval for tool ${toolName}`);
    this.name = 'ToolApprovalDenied';
  }
}

export class ToolExecutionFailed extends ToolError {
  constructor(
    public readonly toolName: string,
    public readonly originalError: Error
  ) {
    super(`Execution failed for tool ${toolName}: ${originalError.message}`);
    this.name = 'ToolExecutionFailed';
  }
}

export class ToolExecutionTimeout extends ToolError {
  constructor(public readonly toolName: string) {
    super(`Execution timed out for tool ${toolName}`);
    this.name = 'ToolExecutionTimeout';
  }
}

export class ToolExecutionCancelled extends ToolError {
  constructor(public readonly toolName: string) {
    super(`Execution cancelled for tool ${toolName}`);
    this.name = 'ToolExecutionCancelled';
  }
}

export class ToolOutputTruncated extends ToolError {
  constructor(public readonly toolName: string) {
    super(`Output truncated for tool ${toolName}`);
    this.name = 'ToolOutputTruncated';
  }
}
