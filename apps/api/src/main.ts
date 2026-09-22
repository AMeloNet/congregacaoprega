import 'reflect-metadata';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { validateIdentityEnvironment } from './identity/identity.runtime.js';

async function bootstrap(): Promise<void> {
  validateIdentityEnvironment();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.useStaticAssets(resolve(import.meta.dirname, 'public'));
  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
