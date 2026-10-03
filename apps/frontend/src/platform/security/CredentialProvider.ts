export interface Credential {
  serviceId: string;
  token: string;
  metadata?: any;
}

export interface ICredentialProvider {
  /**
   * Securely store a credential.
   */
  storeCredential(serviceId: string, token: string, metadata?: any): Promise<void>;

  /**
   * Retrieve a stored credential.
   */
  getCredential(serviceId: string): Promise<Credential | null>;

  /**
   * Delete a stored credential.
   */
  deleteCredential(serviceId: string): Promise<void>;
}
