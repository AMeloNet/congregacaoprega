import { CaptureEmailService } from './email.service.js';

const message = {
  to: 'operator@example.test',
  template: 'master-bootstrap' as const,
  parameters: { link: 'https://app.example.test/convites/sensitive-token' },
};

describe('PBL-002A in-memory email capture', () => {
  it('accepts only reserved fictional domains without using a network transport', async () => {
    const capture = new CaptureEmailService();

    await capture.send(message);
    await expect(
      capture.send({ ...message, to: 'person@real-domain.test.br' }),
    ).rejects.toThrow('A captura aceita somente endereços fictícios.');
    expect(capture.messages).toHaveLength(1);
  });

  it('lists redacted metadata and consumes sensitive content only once', async () => {
    const capture = new CaptureEmailService({
      id: () => 'capture-id',
      now: () => new Date('2026-09-23T12:00:00Z'),
    });
    await capture.send(message);

    expect(capture.list()).toEqual([
      {
        id: 'capture-id',
        to: '***@example.test',
        template: 'master-bootstrap',
        createdAt: '2026-09-23T12:00:00.000Z',
        expiresAt: '2026-09-23T12:15:00.000Z',
      },
    ]);
    expect(JSON.stringify(capture.list())).not.toContain('sensitive-token');
    expect(capture.consume('capture-id')).toEqual(message);
    expect(capture.consume('capture-id')).toBeUndefined();
  });

  it('removes expired messages and starts empty after a process restart', async () => {
    let now = new Date('2026-09-23T12:00:00Z');
    const firstProcess = new CaptureEmailService({ now: () => now });
    await firstProcess.send(message);
    now = new Date('2026-09-23T12:15:00Z');

    expect(firstProcess.list()).toEqual([]);
    expect(new CaptureEmailService().list()).toEqual([]);
  });
});
