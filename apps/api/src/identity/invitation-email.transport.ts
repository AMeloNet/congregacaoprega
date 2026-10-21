import type { CapturedEmail, EmailService } from './email.service.js';
import { uuidPattern } from '../reservations.service.js';

export type InvitationMailPayload = Record<string, unknown>;
export interface InvitationMailTransport {
  readonly name: 'capture' | 'resend';
  prepare(message: CapturedEmail): InvitationMailPayload;
  sendPrepared(
    payload: InvitationMailPayload,
    invitationId: string,
  ): Promise<string | null>;
}

export class CaptureInvitationTransport implements InvitationMailTransport {
  readonly name = 'capture';
  constructor(private readonly email: EmailService) {}
  prepare(message: CapturedEmail): InvitationMailPayload {
    return structuredClone(message);
  }
  async sendPrepared(payload: InvitationMailPayload): Promise<null> {
    await this.email.send(payload as CapturedEmail);
    return null;
  }
}

const address = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;
export class ResendInvitationTransport implements InvitationMailTransport {
  readonly name = 'resend';
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly request: typeof fetch = fetch,
  ) {}
  prepare(message: CapturedEmail): InvitationMailPayload {
    if (
      !['master-bootstrap', 'membership-invitation'].includes(
        message.template,
      ) ||
      !address.test(message.to) ||
      typeof message.parameters.link !== 'string'
    ) {
      throw new Error('Convite ou destinatário inválido.');
    }
    const isBootstrap = message.template === 'master-bootstrap';
    return {
      from: this.from,
      to: [message.to],
      subject: isBootstrap
        ? 'Convite para administrar o Testemunho Público'
        : 'Convite de acesso ao Testemunho Público',
      text: `${isBootstrap ? 'Use este link para iniciar a administração' : 'Use este link para aceitar o convite'}: ${message.parameters.link}`,
    };
  }
  async sendPrepared(payload: InvitationMailPayload, invitationId: string) {
    if (!uuidPattern.test(invitationId)) throw new Error('Convite inválido.');
    const response = await this.request('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
        'user-agent': 'congregacaoprega-invitation',
        'idempotency-key': `access-invitation/${invitationId}`,
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

export function invitationEmailConfiguration(env = process.env) {
  const transport = env.INVITATION_EMAIL_TRANSPORT ?? 'capture';
  if (transport === 'capture') return { transport } as const;
  if (transport !== 'resend')
    throw new Error('INVITATION_EMAIL_TRANSPORT must be capture or resend.');
  const apiKey = env.RESEND_API_KEY;
  const from = env.INVITATION_EMAIL_FROM;
  if (!apiKey || !from)
    throw new Error(
      'Resend invitations require RESEND_API_KEY and INVITATION_EMAIL_FROM.',
    );
  if (!address.test(from))
    throw new Error('Invalid invitation sender configuration.');
  return { transport, apiKey, from } as const;
}
