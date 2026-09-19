import { Module } from '@nestjs/common';
import { DatabaseHealth, HealthController } from './health.js';

@Module({ controllers: [HealthController], providers: [DatabaseHealth] })
export class AppModule {}
