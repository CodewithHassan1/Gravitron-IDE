export enum LogLevel {
  Trace,
  Debug,
  Info,
  Warn,
  Error,
}

export interface ILogger {
  trace(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string | Error, ...args: any[]): void;
}
