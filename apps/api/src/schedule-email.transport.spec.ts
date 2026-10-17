import { randomBytes } from 'node:crypto';
import { scheduleEmailConfiguration } from './schedule-email.transport.js';

describe('schedule mail configuration', () => {
  it('defaults to capture independently from identity and refuses incomplete external delivery configuration', () => {
    expect(scheduleEmailConfiguration({})).toEqual({ transport: 'capture' });
    expect(
      scheduleEmailConfiguration({ RESEND_API_KEY: 'fake-unused' }),
    ).toEqual({ transport: 'capture' });
    expect(() =>
      scheduleEmailConfiguration({ SCHEDULE_EMAIL_TRANSPORT: 'smtp' }),
    ).toThrow('SCHEDULE_EMAIL_TRANSPORT');
    const config = {
      SCHEDULE_EMAIL_TRANSPORT: 'resend',
      RESEND_API_KEY: 'fake-key',
      SCHEDULE_EMAIL_FROM: 'schedule@example.test',
      RESEND_WEBHOOK_SECRET: `whsec_${randomBytes(32).toString('base64')}`,
    };
    expect(() =>
      scheduleEmailConfiguration({ ...config, RESEND_WEBHOOK_SECRET: '' }),
    ).toThrow('Resend requires');
    expect(() =>
      scheduleEmailConfiguration({
        ...config,
        SCHEDULE_EMAIL_FROM: 'bad\r\nheader',
      }),
    ).toThrow('Invalid Resend');
    expect(scheduleEmailConfiguration(config)).toMatchObject({
      transport: 'resend',
    });
  });
});
