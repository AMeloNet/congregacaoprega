import { randomBytes } from 'node:crypto';

export type CapturedEmail = {
  to: string;
  template:
    | 'master-bootstrap'
    | 'membership-invitation'
    | 'membership-revoked'
    | 'membership-reactivated';
  parameters: Record<string, string>;
};

export interface EmailService {
  assertAllowedRecipient(to: string): void;
  send(message: CapturedEmail): Promise<void>;
}

type CaptureOptions = {
  id?: () => string;
  now?: () => Date;
  ttlMs?: number;
};

type CapturedEnvelope = {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  message: CapturedEmail;
};

const reservedDomains = new Set([
  'example.test',
  'example.invalid',
  'example.com',
  'example.org',
]);

export class CaptureEmailService implements EmailService {
  private readonly envelopes: CapturedEnvelope[] = [];
  private readonly id: () => string;
  private readonly now: () => Date;
  private readonly ttlMs: number;

  constructor(options: CaptureOptions = {}) {
    this.id = options.id ?? (() => randomBytes(18).toString('base64url'));
    this.now = options.now ?? (() => new Date());
    this.ttlMs = options.ttlMs ?? 15 * 60 * 1000;
  }

  get messages(): CapturedEmail[] {
    this.prune();
    return this.envelopes.map(({ message }) => structuredClone(message));
  }

  assertAllowedRecipient(to: string): void {
    const separator = to.lastIndexOf('@');
    const domain = to.slice(separator + 1).toLocaleLowerCase('en-US');
    if (separator < 1 || !reservedDomains.has(domain)) {
      throw new Error('A captura aceita somente endereços fictícios.');
    }
  }

  async send(message: CapturedEmail): Promise<void> {
    this.assertAllowedRecipient(message.to);
    this.prune();
    const createdAt = this.now();
    this.envelopes.push({
      id: this.id(),
      createdAt,
      expiresAt: new Date(createdAt.getTime() + this.ttlMs),
      message: structuredClone(message),
    });
  }

  list() {
    this.prune();
    return this.envelopes.map(({ id, createdAt, expiresAt, message }) => ({
      id,
      to: `***@${message.to.slice(message.to.lastIndexOf('@') + 1)}`,
      template: message.template,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    }));
  }

  consume(id: string): CapturedEmail | undefined {
    this.prune();
    const index = this.envelopes.findIndex((entry) => entry.id === id);
    if (index < 0) return undefined;
    const [entry] = this.envelopes.splice(index, 1);
    return entry ? structuredClone(entry.message) : undefined;
  }

  private prune(): void {
    const current = this.now().getTime();
    for (let index = this.envelopes.length - 1; index >= 0; index -= 1) {
      if (this.envelopes[index]!.expiresAt.getTime() <= current) {
        this.envelopes.splice(index, 1);
      }
    }
  }
}
