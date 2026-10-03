import { IPlatformCapabilities } from './IPlatformCapabilities';

// We type this loosely as 'any' here, but it returns ITerminalTransport in apps/frontend
export interface IPlatform {
  capabilities: IPlatformCapabilities;
  createTerminalTransport(): any;
  // createWorkspaceProvider(): any;
}
