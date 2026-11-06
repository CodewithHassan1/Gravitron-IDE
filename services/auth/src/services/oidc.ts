export interface OIDCProfile {
  sub: string;
  email: string;
  email_verified: boolean;
}

/**
 * Generic OIDC Client mapped against configuration
 * Mocks behavior locally if external credentials are not supplied
 */
export class OIDCClient {
  private useMock: boolean;

  constructor() {
    this.useMock = !process.env.OIDC_ISSUER;
  }

  async exchangeCode(code: string): Promise<OIDCProfile> {
    if (this.useMock) {
      // Mock deterministic response for local dev
      if (code === 'invalid-code') throw new Error('Invalid OAuth Code');

      return {
        sub: 'user-1234-abcd',
        email: 'admin@ag-ide.local',
        email_verified: true,
      };
    }

    // Real implementation would hit process.env.OIDC_ISSUER + '/oauth/token'
    throw new Error('Real OIDC exchange not yet implemented');
  }
}
