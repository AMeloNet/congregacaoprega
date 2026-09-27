import { resolve } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';

type WebRequest = {
  method: string;
  path: string;
};

type WebResponse = {
  sendFile(path: string): void;
};

type Next = () => void;

const invitationPath = /^\/convites\/[^/]+$/;

export function configureWebAssets(
  app: NestExpressApplication,
  publicDirectory: string,
): void {
  app.useStaticAssets(publicDirectory);
  app.use((request: WebRequest, response: WebResponse, next: Next) => {
    if (request.method !== 'GET' || !invitationPath.test(request.path)) {
      next();
      return;
    }

    response.sendFile(resolve(publicDirectory, 'index.html'));
  });
}
