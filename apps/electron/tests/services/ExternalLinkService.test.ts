import { describe, it, expect, vi } from 'vitest';
import { ExternalLinkService } from '../../src/services/ExternalLinkService';
import { IExternalLauncher } from '../../src/services/IExternalLinkService';

class MockLauncher implements IExternalLauncher {
  public openedUrl: string | null = null;
  async openExternal(url: string) {
    this.openedUrl = url;
  }
}

describe('ExternalLinkService', () => {
  it('allows http, https, and mailto protocols', async () => {
    const launcher = new MockLauncher();
    const service = new ExternalLinkService(launcher);

    await service.openUrl('https://example.com');
    expect(launcher.openedUrl).toBe('https://example.com/');

    await service.openUrl('http://localhost:8080');
    expect(launcher.openedUrl).toBe('http://localhost:8080/');

    await service.openUrl('mailto:test@example.com');
    expect(launcher.openedUrl).toBe('mailto:test@example.com');
  });

  it('rejects unsafe protocols', async () => {
    const launcher = new MockLauncher();
    const service = new ExternalLinkService(launcher);

    await expect(service.openUrl('file:///etc/passwd')).rejects.toThrow(
      'Protocol not allowed: file:'
    );
    await expect(service.openUrl('javascript:alert(1)')).rejects.toThrow(
      'Protocol not allowed: javascript:'
    );
    await expect(service.openUrl('data:text/html,<h1>Hello</h1>')).rejects.toThrow(
      'Protocol not allowed: data:'
    );

    expect(launcher.openedUrl).toBeNull();
  });

  it('rejects malformed URLs', async () => {
    const launcher = new MockLauncher();
    const service = new ExternalLinkService(launcher);

    await expect(service.openUrl('not_a_url')).rejects.toThrow('Invalid URL');
    expect(launcher.openedUrl).toBeNull();
  });
});
