import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { IdentityRuntime } from './identity.runtime.js';

type CaptureHttpRequest = {
  method: string;
  originalUrl: string;
  headers: Record<string, string | string[] | undefined>;
};

type CaptureHttpResponse = {
  setHeader(name: string, value: string): void;
};

function header(request: CaptureHttpRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function unavailable(): NotFoundException {
  return new NotFoundException({
    code: 'NOT_FOUND',
    message: 'Recurso não encontrado.',
  });
}

@Controller('operations/email-capture')
export class CaptureController {
  constructor(private readonly runtime: IdentityRuntime) {}

  @Get()
  list(
    @Req() request: CaptureHttpRequest,
    @Res({ passthrough: true }) response: CaptureHttpResponse,
  ) {
    this.requireOperator(request, response);
    return this.runtime.email.list();
  }

  @Delete(':id')
  consume(
    @Req() request: CaptureHttpRequest,
    @Res({ passthrough: true }) response: CaptureHttpResponse,
    @Param('id') id: string,
  ) {
    this.requireOperator(request, response);
    const message = this.runtime.email.consume(id);
    if (!message) throw unavailable();
    return message;
  }

  private requireOperator(
    request: CaptureHttpRequest,
    response: CaptureHttpResponse,
  ): void {
    response.setHeader('Cache-Control', 'no-store');
    const path = request.originalUrl.split('?', 1)[0] ?? '';
    const authorized = this.runtime.captureAccess.authorize({
      method: request.method,
      path,
      timestamp: header(request, 'x-capture-timestamp'),
      requestId: header(request, 'x-capture-request-id'),
      signature: header(request, 'x-capture-signature'),
    });
    if (!authorized) throw unavailable();
  }
}
