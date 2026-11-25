const SECRET_PATTERNS: ReadonlyArray<{ regex: RegExp; replacement: string }> = [
  { regex: /sk-ant-[a-zA-Z0-9_-]{12,}/g, replacement: '[REDACTED_ANTHROPIC_KEY]' },
  { regex: /sk-or-v1-[a-zA-Z0-9_-]{12,}/g, replacement: '[REDACTED_OPENROUTER_KEY]' },
  { regex: /sk-[a-zA-Z0-9_-]{16,}/g, replacement: '[REDACTED_API_KEY]' },
  { regex: /AIza[0-9A-Za-z_-]{20,}/g, replacement: '[REDACTED_GOOGLE_KEY]' },
  { regex: /Bearer\s+[a-zA-Z0-9_.-]{12,}/gi, replacement: 'Bearer [REDACTED_TOKEN]' },
  {
    regex: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
    replacement: '[REDACTED_JWT]',
  },
  { regex: /(gh[pousr]_[0-9a-zA-Z]{20,})/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  {
    regex:
      /(["']?(?:api[_-]?key|secret|token|password|auth)["']?\s*[:=]\s*["'])([^"'\s]{8,})(["'])/gi,
    replacement: '$1[REDACTED]$3',
  },
];

export class SecretRedactor {
  private readonly registeredSecrets = new Set<string>();

  public registerSecret(secret: string): void {
    const trimmed = secret.trim();
    if (trimmed.length >= 8) {
      this.registeredSecrets.add(trimmed);
    }
  }

  public redactText(input: string): string {
    let out = input;
    for (const secret of this.registeredSecrets) {
      if (out.includes(secret)) {
        out = out.split(secret).join('[REDACTED_SECRET]');
      }
    }
    for (const pattern of SECRET_PATTERNS) {
      out = out.replace(pattern.regex, pattern.replacement);
    }
    return out;
  }

  public redactValue<T>(value: T): T {
    if (typeof value === 'string') {
      return this.redactText(value) as T;
    }
    if (Array.isArray(value)) {
      return value.map((item: unknown) => this.redactValue(item)) as T;
    }
    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        if (typeof v === 'string' && /api[_-]?key|secret|token|password/i.test(k)) {
          out[k] = '[REDACTED]';
        } else {
          out[k] = this.redactValue(v);
        }
      }
      return out as T;
    }
    return value;
  }
}
