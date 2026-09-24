import { createHmac, timingSafeEqual } from 'node:crypto';

export type CaptureAuthorization = {
  method: string;
  path: string;
  timestamp?: string;
  requestId?: string;
  signature?: string;
};

const authorizationWindowMs = 2 * 60 * 1000;
const requestIdPattern = /^[A-Za-z0-9_-]{24,128}$/;
const signaturePattern = /^[a-f0-9]{64}$/;

export class CaptureAccessService {
  private readonly usedRequestIds = new Map<string, number>();

  constructor(
    private readonly secret: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  authorize(input: CaptureAuthorization): boolean {
    const current = this.now().getTime();
    this.prune(current);
    const timestamp = Number(input.timestamp);
    const requestId = input.requestId ?? '';
    const signature = input.signature ?? '';
    const validShape =
      Number.isSafeInteger(timestamp) &&
      Math.abs(current - timestamp) <= authorizationWindowMs &&
      requestIdPattern.test(requestId) &&
      signaturePattern.test(signature) &&
      !this.usedRequestIds.has(requestId);
    const canonical = `${input.method.toUpperCase()}\n${input.path}\n${input.timestamp ?? ''}\n${requestId}`;
    const expected = createHmac('sha256', this.secret)
      .update(canonical)
      .digest();
    const provided = signaturePattern.test(signature)
      ? Buffer.from(signature, 'hex')
      : Buffer.alloc(expected.length);
    const authentic = timingSafeEqual(expected, provided);
    if (!validShape || !authentic) return false;
    this.usedRequestIds.set(requestId, timestamp + authorizationWindowMs);
    return true;
  }

  private prune(current: number): void {
    for (const [requestId, expiresAt] of this.usedRequestIds) {
      if (expiresAt < current) this.usedRequestIds.delete(requestId);
    }
  }
}
