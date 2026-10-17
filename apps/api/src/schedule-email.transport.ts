import type { CapturedEmail, EmailService } from './identity/email.service.js';
import { uuidPattern } from './reservations.service.js';

export type ScheduleMailPayload = Record<string, unknown>;
export interface ScheduleMailTransport {
  readonly name: 'capture' | 'resend';
  prepare(message: CapturedEmail): ScheduleMailPayload;
  sendPrepared(
    payload: ScheduleMailPayload,
    noticeId: string,
  ): Promise<string | null>;
}

export class CaptureScheduleTransport implements ScheduleMailTransport {
  readonly name = 'capture';
  constructor(private readonly email: EmailService) {}
  prepare(message: CapturedEmail): ScheduleMailPayload {
    return { ...message };
  }
  async sendPrepared(payload: ScheduleMailPayload): Promise<null> {
    await this.email.send(payload as CapturedEmail);
    return null;
  }
}

const address = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;
export class ResendScheduleTransport implements ScheduleMailTransport {
  readonly name = 'resend';
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly request: typeof fetch = fetch,
  ) {}
  prepare(message: CapturedEmail): ScheduleMailPayload {
    if (message.template !== 'schedule-notice' || !address.test(message.to))
      throw new Error('Aviso ou destinatário inválido.');
    return {
      from: this.from,
      to: [message.to],
      subject: 'Aviso da programação — Testemunho Público',
      text: message.parameters.message,
    };
  }
  async sendPrepared(payload: ScheduleMailPayload, noticeId: string) {
    if (!uuidPattern.test(noticeId)) throw new Error('Aviso inválido.');
    // The persisted payload and key are identical on every attempt, including
    // recovery after provider acceptance followed by a lost response or process.
    const response = await this.request('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
        'user-agent': 'congregacaoprega-schedule',
        'idempotency-key': `schedule-notice/${noticeId}`,
      },
      body: JSON.stringify({
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Falha no transporte de e-mail.');
    const result = (await response.json()) as { id?: unknown };
    if (typeof result.id !== 'string' || !uuidPattern.test(result.id))
      throw new Error('Resposta de e-mail inválida.');
    return result.id;
  }
}

export function scheduleEmailConfiguration(env = process.env) {
  const transport = env.SCHEDULE_EMAIL_TRANSPORT ?? 'capture';
  if (transport === 'capture') return { transport } as const;
  if (transport !== 'resend')
    throw new Error('SCHEDULE_EMAIL_TRANSPORT must be capture or resend.');
  const apiKey = env.RESEND_API_KEY;
  const from = env.SCHEDULE_EMAIL_FROM;
  const webhookSecret = env.RESEND_WEBHOOK_SECRET;
  if (!apiKey || !from || !webhookSecret)
    throw new Error(
      'Resend requires RESEND_API_KEY, SCHEDULE_EMAIL_FROM and RESEND_WEBHOOK_SECRET.',
    );
  if (
    !address.test(from) ||
    !/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(webhookSecret) ||
    Buffer.from(webhookSecret.slice(6), 'base64').length < 16
  )
    throw new Error('Invalid Resend sender or webhook configuration.');
  return { transport, apiKey, from, webhookSecret } as const;
}
