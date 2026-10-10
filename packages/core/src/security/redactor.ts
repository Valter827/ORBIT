/**
 * Last line of defence before a context snapshot is serialised into a prompt.
 * Every string that leaves the machine passes through `redact`.
 */

export interface Redaction {
  kind: string;
  count: number;
}

export interface RedactionResult {
  text: string;
  redactions: Redaction[];
}

interface SecretPattern {
  kind: string;
  pattern: RegExp;
}

const PATTERNS: SecretPattern[] = [
  { kind: "openai_key", pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { kind: "anthropic_key", pattern: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g },
  { kind: "github_token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { kind: "aws_access_key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "google_key", pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { kind: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { kind: "private_key_block", pattern: /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g },
  {
    kind: "connection_string",
    pattern: /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@/]+:[^\s@]+@\S+/gi,
  },
  {
    kind: "env_assignment",
    pattern:
      /\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_KEY|CREDENTIAL)[A-Z0-9_]*)\s*=\s*['"]?([^\s'"]{6,})/g,
  },
  { kind: "bearer_header", pattern: /\bBearer\s+[A-Za-z0-9._-]{16,}/g },
];

export function redact(input: string): RedactionResult {
  let text = input;
  const redactions: Redaction[] = [];

  for (const { kind, pattern } of PATTERNS) {
    let count = 0;
    text = text.replace(pattern, (_match: string, ...groups: unknown[]) => {
      count += 1;
      if (kind === "env_assignment") {
        const name = groups[0];
        return `${String(name)}=«redacted»`;
      }
      return `«redacted:${kind}»`;
    });
    if (count > 0) redactions.push({ kind, count });
  }

  return { text, redactions };
}

/** Deep-redacts a JSON-serialisable value. */
export function redactDeep<T>(value: T): { value: T; redactions: Redaction[] } {
  const totals = new Map<string, number>();

  const walk = (node: unknown): unknown => {
    if (typeof node === "string") {
      const result = redact(node);
      for (const r of result.redactions) {
        totals.set(r.kind, (totals.get(r.kind) ?? 0) + r.count);
      }
      return result.text;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node !== null && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) out[k] = walk(v);
      return out;
    }
    return node;
  };

  const redactedValue = walk(value) as T;
  return {
    value: redactedValue,
    redactions: [...totals].map(([kind, count]) => ({ kind, count })),
  };
}
