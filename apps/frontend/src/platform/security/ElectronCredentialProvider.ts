import { ICredentialProvider, Credential } from './CredentialProvider';

export class ElectronCredentialProvider implements ICredentialProvider {
  async storeCredential(serviceId: string, token: string, metadata?: any): Promise<void> {
    // Stub: Will route via IPC to OS Keychain (e.g., keytar or electron-safe-storage)
    console.warn('ElectronCredentialProvider stub: storeCredential', serviceId);
  }

  async getCredential(serviceId: string): Promise<Credential | null> {
    // Stub
    console.warn('ElectronCredentialProvider stub: getCredential', serviceId);
    return null;
  }

  async deleteCredential(serviceId: string): Promise<void> {
    // Stub
    console.warn('ElectronCredentialProvider stub: deleteCredential', serviceId);
  }
}
