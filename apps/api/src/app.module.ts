import { Module } from '@nestjs/common';
import { DatabaseHealth, HealthController } from './health.js';
import { CaptureController } from './identity/capture.controller.js';
import {
  AuthController,
  IdentityController,
} from './identity/identity.controllers.js';
import { IdentityRuntime } from './identity/identity.runtime.js';
import { ScheduleEmailController } from './schedule-email.controller.js';

@Module({
  controllers: [
    HealthController,
    AuthController,
    IdentityController,
    CaptureController,
    ScheduleEmailController,
  ],
  providers: [DatabaseHealth, IdentityRuntime],
})
export class AppModule {}
