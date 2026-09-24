import { createHmac, randomBytes } from 'node:crypto';

const [command, messageId] = process.argv.slice(2);
if (!['list', 'consume'].includes(command ?? '')) {
  throw new Error('Use: pnpm capture list | pnpm capture consume <message-id>');
}
if (command === 'consume' && !/^[A-Za-z0-9_-]{16,128}$/.test(messageId ?? '')) {
  throw new Error('A valid opaque message identifier is required.');
}

const baseUrl = process.env.APP_BASE_URL;
const secret = process.env.CAPTURE_OPERATOR_SECRET;
if (!baseUrl || !secret) {
  throw new Error(
    'APP_BASE_URL and CAPTURE_OPERATOR_SECRET are required in the local environment.',
  );
}
if (secret.length < 32) {
  throw new Error(
    'CAPTURE_OPERATOR_SECRET must contain at least 32 characters.',
  );
}
const base = new URL(baseUrl);
const local = ['127.0.0.1', 'localhost'].includes(base.hostname);
if (base.protocol !== 'https:' && !local) {
  throw new Error('APP_BASE_URL must use HTTPS outside local development.');
}

const path =
  command === 'list'
    ? '/api/operations/email-capture'
    : `/api/operations/email-capture/${messageId}`;
const method = command === 'list' ? 'GET' : 'DELETE';
const timestamp = Date.now().toString();
const requestId = randomBytes(18).toString('base64url');
const signature = createHmac('sha256', secret)
  .update(`${method}\n${path}\n${timestamp}\n${requestId}`)
  .digest('hex');
const response = await fetch(new URL(path, base), {
  method,
  headers: {
    'x-capture-timestamp': timestamp,
    'x-capture-request-id': requestId,
    'x-capture-signature': signature,
  },
});
if (!response.ok) {
  throw new Error(`Capture request failed with HTTP ${response.status}.`);
}
process.stdout.write(`${JSON.stringify(await response.json(), null, 2)}\n`);
