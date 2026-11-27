import { describe, it, expect } from 'vitest';
import { SpecialistSecurity } from '../../src/mcp/SpecialistSecurity';

describe('SpecialistSecurity — Sensitive Data Redaction & Context Bounding', () => {
  it('redacts sensitive API keys, GitHub tokens, and bearer credentials', () => {
    const rawText =
      'Please analyze this snippet with API key sk-proj-1234567890abcdef1234567890 and GitHub token ghp_123456789012345678901234567890123456 and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M';

    const { sanitized, redactions } = SpecialistSecurity.sanitizeString(rawText);

    expect(redactions).toBeGreaterThanOrEqual(3);
    expect(sanitized).not.toContain('sk-proj-');
    expect(sanitized).not.toContain('ghp_');
    expect(sanitized).not.toContain('eyJhbGci');
    expect(sanitized).toContain('[REDACTED_API_KEY]');
    expect(sanitized).toContain('[REDACTED_GITHUB_TOKEN]');
    expect(sanitized).toContain('[REDACTED_BEARER_TOKEN]');
  });

  it('bounds excessive context size to prevent oversized remote payloads', () => {
    const hugeText = 'A'.repeat(12000);
    const maxChars = 2000;

    const { sanitized } = SpecialistSecurity.sanitizeString(hugeText, maxChars);

    expect(sanitized.length).toBeLessThan(2500);
    expect(sanitized).toContain('[Content bounded: 10000 characters truncated for context protection]');
  });

  it('recursively sanitizes structured argument payloads and removes sensitive key values', () => {
    const payload = {
      task: 'Fix authentication service',
      config: {
        apiKey: 'secret_key_value_123456',
        password: 'mySuperSecretPassword!',
        endpoint: 'https://api.internal.org',
      },
      codeSnippet: 'const token = "sk-ant-12345678901234567890abcdef";',
    };

    const { sanitized, totalRedactions } = SpecialistSecurity.sanitizePayload(payload);

    expect(totalRedactions).toBeGreaterThanOrEqual(3);
    expect(sanitized.config.apiKey).toBe('[REDACTED_SECRET]');
    expect(sanitized.config.password).toBe('[REDACTED_SECRET]');
    expect(sanitized.config.endpoint).toBe('https://api.internal.org');
    expect(sanitized.codeSnippet).toContain('[REDACTED_API_KEY]');
  });

  it('creates non-sensitive audit metadata for specialist invocations', () => {
    const startTime = Date.now() - 350;
    const audit = SpecialistSecurity.createAuditMetadata(
      'softwareengineeringexpert',
      startTime,
      'success',
      2,
      1500
    );

    expect(audit.toolName).toBe('softwareengineeringexpert');
    expect(audit.status).toBe('success');
    expect(audit.durationMs).toBeGreaterThanOrEqual(300);
    expect(audit.redactedCount).toBe(2);
    expect(audit.responseLength).toBe(1500);
    expect((audit as any).payload).toBeUndefined(); // No sensitive payloads logged
  });
});
