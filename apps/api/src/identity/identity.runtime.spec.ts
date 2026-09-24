import { validateIdentityEnvironment } from './identity.runtime.js';

const valid = {
  DATABASE_URL: 'postgresql://app:placeholder@127.0.0.1:5432/example',
  AUTH0_ISSUER: 'https://identity.example.test/',
  AUTH0_CLIENT_ID: 'client',
  AUTH0_CLIENT_SECRET: 'auth0-secret-placeholder',
  AUTH0_AUDIENCE: 'https://api.example.test',
  AUTH0_CALLBACK_URL: 'https://app.example.test/api/auth/callback',
  AUTH0_LOGOUT_URL: 'https://app.example.test/',
  SESSION_SECRET: 'session-secret-at-least-32-characters',
  BOOTSTRAP_SECRET: 'bootstrap-secret-at-least-32-characters',
  CAPTURE_OPERATOR_SECRET: 'capture-secret-at-least-32-characters',
  APP_BASE_URL: 'https://app.example.test',
  EMAIL_TRANSPORT: 'capture',
};

describe('PBL-002A identity environment validation', () => {
  const previous = { ...process.env };

  beforeEach(() => {
    process.env = { ...previous, ...valid };
  });

  afterAll(() => {
    process.env = previous;
  });

  it('reports only the name of an absent required variable', () => {
    delete process.env.CAPTURE_OPERATOR_SECRET;

    expect(validateIdentityEnvironment).toThrow(
      'Required identity configuration is missing: CAPTURE_OPERATOR_SECRET',
    );
    try {
      validateIdentityEnvironment();
    } catch (error) {
      expect(String(error)).not.toContain(valid.SESSION_SECRET);
    }
  });

  it('refuses any transport other than capture', () => {
    process.env.EMAIL_TRANSPORT = 'smtp';
    expect(validateIdentityEnvironment).toThrow(
      'EMAIL_TRANSPORT must be capture',
    );
  });

  it('requires independent secrets with at least 32 characters', () => {
    process.env.CAPTURE_OPERATOR_SECRET = 'short';
    expect(validateIdentityEnvironment).toThrow(
      'CAPTURE_OPERATOR_SECRET must contain at least 32 characters.',
    );

    process.env.CAPTURE_OPERATOR_SECRET = valid.BOOTSTRAP_SECRET;
    expect(validateIdentityEnvironment).toThrow(
      'Operational secrets must be distinct.',
    );
  });

  it('requires exact same-origin Auth0 URLs in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH0_CALLBACK_URL =
      'https://external.example.test/api/auth/callback';
    expect(validateIdentityEnvironment).toThrow(
      'AUTH0_CALLBACK_URL must use APP_BASE_URL origin.',
    );

    process.env.AUTH0_CALLBACK_URL = valid.AUTH0_CALLBACK_URL;
    process.env.AUTH0_LOGOUT_URL = 'https://external.example.test/';
    expect(validateIdentityEnvironment).toThrow(
      'AUTH0_LOGOUT_URL must use APP_BASE_URL origin.',
    );
  });
});
