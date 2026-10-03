export interface IPlatformCapabilities {
  supportsTerminal(): boolean;
  supportsFileSystem(): boolean;
  supportsGit(): boolean;
  supportsAI(): boolean;
  supportsExtensions(): boolean;
}
