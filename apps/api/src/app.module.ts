import { Module } from '@nestjs/common';
import { DatabaseHealth, HealthController } from './health.js';
import {
  AuthController,
  IdentityController,
} from './identity/identity.controllers.js';
import { IdentityRuntime } from './identity/identity.runtime.js';

@Module({
  controllers: [HealthController, AuthController, IdentityController],
  providers: [DatabaseHealth, IdentityRuntime],
})
export class AppModule {}
