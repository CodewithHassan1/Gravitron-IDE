// src/services/terminal/types/events.ts

import { TerminalMetadata } from './index';

export enum TerminalEventType {
  TerminalCreated = 'TerminalCreated',
  TerminalClosed = 'TerminalClosed',
  TerminalFocused = 'TerminalFocused',
  TerminalResized = 'TerminalResized',
  TerminalInput = 'TerminalInput',
  TerminalOutput = 'TerminalOutput',
  TerminalExit = 'TerminalExit',
  TerminalError = 'TerminalError',
  ProcessStarted = 'ProcessStarted',
  ProcessExited = 'ProcessExited',
  RuntimeConnected = 'RuntimeConnected',
  RuntimeDisconnected = 'RuntimeDisconnected',
  ResourceLimitExceeded = 'ResourceLimitExceeded',
}

export interface TerminalCreated {
  readonly terminalId: string;
  readonly timestamp: number;
  readonly metadata: Readonly<TerminalMetadata>;
}

export interface TerminalClosed {
  readonly terminalId: string;
  readonly timestamp: number;
}

export interface TerminalFocused {
  readonly terminalId: string;
  readonly timestamp: number;
}

export interface TerminalResized {
  readonly terminalId: string;
  readonly timestamp: number;
  readonly cols: number;
  readonly rows: number;
}

export interface TerminalInput {
  readonly terminalId: string;
  readonly timestamp: number;
  readonly payloadLength: number; 
}

export interface TerminalOutput {
  readonly terminalId: string;
  readonly timestamp: number;
  readonly payloadLength: number; 
}

export interface TerminalExit {
  readonly terminalId: string;
  readonly timestamp: number;
  readonly exitCode: number;
  readonly signal?: string;
}

export interface TerminalError {
  readonly terminalId: string;
  readonly timestamp: number;
  readonly errorType: string;
  readonly message: string;
}

export interface ProcessStarted {
  readonly terminalId: string;
  readonly timestamp: number;
  readonly pid: number;
}

export interface ProcessExited {
  readonly terminalId: string;
  readonly timestamp: number;
  readonly pid: number;
  readonly exitCode: number;
}

export interface RuntimeConnected {
  readonly runtimeType: string;
  readonly timestamp: number;
}

export interface RuntimeDisconnected {
  readonly runtimeType: string;
  readonly timestamp: number;
  readonly reason: string;
}

export interface ResourceLimitExceeded {
  readonly terminalId: string;
  readonly timestamp: number;
  readonly resource: 'CPU' | 'Memory' | 'Disk';
  readonly currentUsage: number;
  readonly maxLimit: number;
}

export interface TerminalEventPayloads {
  [TerminalEventType.TerminalCreated]: TerminalCreated;
  [TerminalEventType.TerminalClosed]: TerminalClosed;
  [TerminalEventType.TerminalFocused]: TerminalFocused;
  [TerminalEventType.TerminalResized]: TerminalResized;
  [TerminalEventType.TerminalInput]: TerminalInput;
  [TerminalEventType.TerminalOutput]: TerminalOutput;
  [TerminalEventType.TerminalExit]: TerminalExit;
  [TerminalEventType.TerminalError]: TerminalError;
  [TerminalEventType.ProcessStarted]: ProcessStarted;
  [TerminalEventType.ProcessExited]: ProcessExited;
  [TerminalEventType.RuntimeConnected]: RuntimeConnected;
  [TerminalEventType.RuntimeDisconnected]: RuntimeDisconnected;
  [TerminalEventType.ResourceLimitExceeded]: ResourceLimitExceeded;
}
