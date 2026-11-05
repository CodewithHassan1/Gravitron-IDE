import { CommandMetadata } from '@ag/protocol';
import { Disposable } from '@ag/core';
export interface Command extends CommandMetadata {
  description?: string;
  aliases?: string[];
  handler: (...args: any[]) => Promise<void> | void;
}
declare class CommandRegistryImpl {
  private commands;
  has(id: string): boolean;
  registerCommand(command: Command, shortcutStr?: string): Disposable;
  unregisterCommand(id: string): boolean;
  getCommand(id: string): Command | undefined;
  getCommands(): Command[];
  isVisible(c: Command): boolean;
  isEnabled(c: Command): boolean;
  isToggled(c: Command): boolean;
  executeCommand(id: string, ...args: any[]): Promise<void>;
}
export declare const CommandRegistry: CommandRegistryImpl;
export {};
