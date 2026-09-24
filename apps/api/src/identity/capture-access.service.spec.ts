import { createHmac } from 'node:crypto';
import { CaptureAccessService } from './capture-access.service.js';

const secret = 'capture-operator-secret-32-characters';
const now = new Date('2026-09-23T12:00:00Z');
const path = '/api/operations/email-capture';

function signed(
  overrides: Partial<{
    method: string;
    path: string;
    timestamp: string;
    requestId: string;
  }> = {},
) {
  const input = {
    method: 'GET',
    path,
    timestamp: now.getTime().toString(),
    requestId: 'request-id-1234567890123456',
    ...overrides,
  };
  return {
    ...input,
    signature: createHmac('sha256', secret)
      .update(
        `${input.method}\n${input.path}\n${input.timestamp}\n${input.requestId}`,
      )
      .digest('hex'),
  };
}

describe('PBL-002A operational capture authorization', () => {
  it('accepts a current authentic request exactly once', () => {
    const access = new CaptureAccessService(secret, () => now);
    const request = signed();

    expect(access.authorize(request)).toBe(true);
    expect(access.authorize(request)).toBe(false);
  });

  it('rejects missing, altered and expired credentials without throwing details', () => {
    const access = new CaptureAccessService(secret, () => now);

    expect(access.authorize({ ...signed(), signature: '' })).toBe(false);
    expect(access.authorize({ ...signed(), path: `${path}/altered` })).toBe(
      false,
    );
    expect(
      access.authorize(
        signed({
          requestId: 'expired-request-123456789012',
          timestamp: (now.getTime() - 2 * 60 * 1000 - 1).toString(),
        }),
      ),
    ).toBe(false);
  });
});
