import {
  Controller,
  HttpCode,
  NotFoundException,
  Post,
  Req,
} from '@nestjs/common';
import { IdentityRuntime } from './identity/identity.runtime.js';
import { ScheduleEmailEventsService } from './schedule-email-events.service.js';

@Controller('schedule-email')
export class ScheduleEmailController {
  constructor(private readonly runtime: IdentityRuntime) {}
  @Post('webhook')
  @HttpCode(200)
  receive(
    @Req()
    request: {
      rawBody?: Buffer;
      headers: Record<string, string | string[] | undefined>;
    },
  ) {
    const config = this.runtime.scheduleEmailConfig;
    if (config.transport !== 'resend') throw new NotFoundException();
    return new ScheduleEmailEventsService(
      this.runtime.pool,
      config.webhookSecret,
    ).receive(request.rawBody, request.headers);
  }
}
