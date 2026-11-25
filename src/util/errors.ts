export interface AppErrorOptions {
  remedy?: string | undefined;
  docs?: string | undefined;
  cause?: unknown;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly remedy?: string | undefined;
  public readonly docs?: string | undefined;

  constructor(code: string, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.remedy = options.remedy;
    this.docs = options.docs;
  }
}

export class ConfigError extends AppError {
  constructor(code: string, message: string, options: AppErrorOptions = {}) {
    super(code, message, options);
    this.name = 'ConfigError';
  }
}

export class McpError extends AppError {
  constructor(code: string, message: string, options: AppErrorOptions = {}) {
    super(code, message, options);
    this.name = 'McpError';
  }
}

export class EngineError extends AppError {
  constructor(code: string, message: string, options: AppErrorOptions = {}) {
    super(code, message, options);
    this.name = 'EngineError';
  }
}

export class PermissionError extends AppError {
  constructor(code: string, message: string, options: AppErrorOptions = {}) {
    super(code, message, options);
    this.name = 'PermissionError';
  }
}

export class ToolError extends AppError {
  constructor(code: string, message: string, options: AppErrorOptions = {}) {
    super(code, message, options);
    this.name = 'ToolError';
  }
}

export class SessionError extends AppError {
  constructor(code: string, message: string, options: AppErrorOptions = {}) {
    super(code, message, options);
    this.name = 'SessionError';
  }
}

export class InvariantError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super('INVARIANT_VIOLATION', message, options);
    this.name = 'InvariantError';
  }
}
