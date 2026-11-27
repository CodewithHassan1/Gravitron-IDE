/**
 * Security and sanitization utilities for remote specialist agent consultations.
 * Ensures:
 * 1. Sensitive credentials (API keys, passwords, private keys, bearer tokens) are redacted.
 * 2. Input contexts sent to external agents remain strictly bounded in size.
 * 3. Remote responses are safely treated as untrusted text.
 * 4. Audit metadata is produced without logging sensitive payloads.
 */

export interface AuditMetadata {
  toolName: string;
  timestamp: number;
  durationMs: number;
  status: 'success' | 'error';
  redactedCount: number;
  responseLength: number;
  errorMessage?: string;
}

export class SpecialistSecurity {
  private static readonly DEFAULT_MAX_STRING_LENGTH = 8000;

  // Sensitive patterns to redact
  private static readonly REDACTION_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
    // Private keys
    {
      pattern: /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g,
      replacement: '[REDACTED_PRIVATE_KEY]',
    },
    // OpenAI / Anthropic / Common API Keys
    {
      pattern: /sk-(?:ant-)?[a-zA-Z0-9_-]{20,}/g,
      replacement: '[REDACTED_API_KEY]',
    },
    // GitHub Personal Access Tokens
    {
      pattern: /(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36}/g,
      replacement: '[REDACTED_GITHUB_TOKEN]',
    },
    {
      pattern: /github_pat_[a-zA-Z0-9_]{30,}/g,
      replacement: '[REDACTED_GITHUB_TOKEN]',
    },
    // AWS Access Key ID
    {
      pattern: /AKIA[0-9A-Z]{16}/g,
      replacement: '[REDACTED_AWS_KEY]',
    },
    // Bearer tokens
    {
      pattern: /Bearer\s+[a-zA-Z0-9\-._~+/]+=*/gi,
      replacement: 'Bearer [REDACTED_BEARER_TOKEN]',
    },
    // JWT tokens
    {
      pattern: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
      replacement: '[REDACTED_JWT_TOKEN]',
    },
    // Passwords, secrets, auth tokens in key-value format
    {
      pattern: /(["']?(?:password|passwd|secret|api_?key|auth_?token|client_?secret)["']?\s*[:=]\s*["'])([^"',\s\r\n]{4,})(["'])/gi,
      replacement: '$1[REDACTED_SECRET]$3',
    },
  ];

  /**
   * Redacts sensitive strings and enforces bounded length.
   */
  public static sanitizeString(input: string, maxChars = SpecialistSecurity.DEFAULT_MAX_STRING_LENGTH): {
    sanitized: string;
    redactions: number;
  } {
    if (!input || typeof input !== 'string') {
      return { sanitized: '', redactions: 0 };
    }

    let text = input;
    let redactions = 0;

    for (const { pattern, replacement } of SpecialistSecurity.REDACTION_PATTERNS) {
      const matches = text.match(pattern);
      if (matches) {
        redactions += matches.length;
        text = text.replace(pattern, replacement);
      }
    }

    if (text.length > maxChars) {
      const truncatedAmount = text.length - maxChars;
      text =
        text.slice(0, maxChars) +
        `\n... [Content bounded: ${truncatedAmount} characters truncated for context protection]`;
    }

    return { sanitized: text, redactions };
  }

  /**
   * Recursively sanitizes arguments payload before remote transmission.
   */
  public static sanitizePayload<T>(payload: T, maxChars = SpecialistSecurity.DEFAULT_MAX_STRING_LENGTH): {
    sanitized: T;
    totalRedactions: number;
  } {
    let totalRedactions = 0;

    function sanitizeVal(val: any): any {
      if (val === null || val === undefined) {
        return val;
      }
      if (typeof val === 'string') {
        const { sanitized, redactions } = SpecialistSecurity.sanitizeString(val, maxChars);
        totalRedactions += redactions;
        return sanitized;
      }
      if (Array.isArray(val)) {
        return val.map(sanitizeVal);
      }
      if (typeof val === 'object') {
        const result: Record<string, any> = {};
        for (const [k, v] of Object.entries(val)) {
          // If the key itself indicates a sensitive credential, redact value completely
          if (/password|secret|api_?key|private_?key|auth_?token/i.test(k)) {
            result[k] = '[REDACTED_SECRET]';
            totalRedactions++;
          } else {
            result[k] = sanitizeVal(v);
          }
        }
        return result;
      }
      return val;
    }

    const sanitized = sanitizeVal(payload);
    return { sanitized, totalRedactions };
  }

  /**
   * Produces an audit log entry for external specialist tool invocations.
   */
  public static createAuditMetadata(
    toolName: string,
    startTime: number,
    status: 'success' | 'error',
    redactions: number,
    responseLength: number,
    errorMessage?: string
  ): AuditMetadata {
    return {
      toolName,
      timestamp: startTime,
      durationMs: Date.now() - startTime,
      status,
      redactedCount: redactions,
      responseLength,
      errorMessage,
    };
  }
}
