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
  send(message: CapturedEmail): Promise<void>;
}

export class CaptureEmailService implements EmailService {
  readonly messages: CapturedEmail[] = [];

  async send(message: CapturedEmail): Promise<void> {
    this.messages.push(structuredClone(message));
  }
}
