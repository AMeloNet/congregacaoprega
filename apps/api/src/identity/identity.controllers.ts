import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  GoneException,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { SessionIdentity } from '../auth/session.store.js';
import type { AuthenticatedIdentity } from './identity.service.js';
import type { LocalRole } from './identity.repository.js';
import { IdentityRuntime } from './identity.runtime.js';

const sessionCookie = 'cp_session';
const flowCookie = 'cp_login';

type HttpRequest = {
  headers: { cookie?: string };
  query: Record<string, unknown>;
};
type HttpResponse = {
  cookie(name: string, value: string, options: Record<string, unknown>): void;
  clearCookie(name: string, options: Record<string, unknown>): void;
  redirect(url: string): void;
  status(code: number): HttpResponse;
  send(body?: unknown): void;
};

function readCookie(request: HttpRequest, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator > 0 && pair.slice(0, separator).trim() === name) {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    }
  }
  return undefined;
}

function fail(error: unknown): never {
  const message =
    error instanceof Error
      ? error.message
      : 'Não foi possível concluir a operação.';
  if (
    message === 'Acesso negado.' ||
    message.startsWith('Confirme seu e-mail')
  ) {
    throw new ForbiddenException({ code: 'ACCESS_DENIED', message });
  }
  if (message === 'Recurso não encontrado.') {
    throw new NotFoundException({ code: 'NOT_FOUND', message });
  }
  if (message === 'Convite expirado.') {
    throw new GoneException({ code: 'INVITATION_EXPIRED', message });
  }
  if (
    message === 'Convite indisponível.' ||
    message.includes('já foi inicializada') ||
    message.startsWith('Defina outro administrador')
  ) {
    throw new ConflictException({ code: 'STATE_CONFLICT', message });
  }
  if (message.startsWith('Este convite pertence')) {
    throw new ForbiddenException({ code: 'WRONG_RECIPIENT', message });
  }
  throw new BadRequestException({
    code: 'INVALID_REQUEST',
    message: 'Não foi possível concluir a operação.',
  });
}

@Controller('auth')
export class AuthController {
  constructor(private readonly runtime: IdentityRuntime) {}

  @Get('login')
  async login(@Res() response: HttpResponse): Promise<void> {
    const login = await this.runtime.auth.beginLogin();
    response.cookie(flowCookie, login.flowCookie, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.runtime.config.secureCookies,
      maxAge: 10 * 60 * 1000,
      path: '/api/auth/callback',
    });
    response.redirect(login.redirectUrl);
  }

  @Get('callback')
  async callback(
    @Req() request: HttpRequest,
    @Res() response: HttpResponse,
  ): Promise<void> {
    const code =
      typeof request.query.code === 'string' ? request.query.code : '';
    const state =
      typeof request.query.state === 'string' ? request.query.state : '';
    try {
      const result = await this.runtime.auth.completeLogin({
        code,
        state,
        flowCookie: readCookie(request, flowCookie) ?? '',
      });
      await this.runtime.repository.syncExternalAccount(result.identity);
      response.clearCookie(flowCookie, { path: '/api/auth/callback' });
      response.cookie(sessionCookie, result.sessionCookie, {
        httpOnly: true,
        sameSite: 'lax',
        secure: this.runtime.config.secureCookies,
        maxAge: 12 * 60 * 60 * 1000,
        path: '/',
      });
      response.redirect(this.runtime.config.logoutUrl);
    } catch {
      response.clearCookie(flowCookie, { path: '/api/auth/callback' });
      throw new UnauthorizedException({
        code: 'INVALID_IDENTITY_RESPONSE',
        message: 'Não foi possível concluir a entrada. Tente novamente.',
      });
    }
  }

  @Get('logout')
  async logout(
    @Req() request: HttpRequest,
    @Res() response: HttpResponse,
  ): Promise<void> {
    const redirect = await this.runtime.auth.logout(
      readCookie(request, sessionCookie),
    );
    response.clearCookie(sessionCookie, { path: '/' });
    response.redirect(redirect);
  }

  @Get('recover')
  recover(@Res() response: HttpResponse): void {
    response.redirect('/api/auth/login');
  }
}

@Controller()
export class IdentityController {
  constructor(private readonly runtime: IdentityRuntime) {}

  @Get('session')
  async session(@Req() request: HttpRequest) {
    const session = await this.runtime.auth.currentSession(
      readCookie(request, sessionCookie),
    );
    if (!session) return { authenticated: false };
    const account = await this.runtime.repository.syncExternalAccount(session);
    const view = await this.runtime.identity.sessionFor(account);
    return {
      ...view,
      csrfToken: session.csrfToken,
      activeCongregationId: session.activeCongregationId,
    };
  }

  @Put('session/congregation')
  async selectCongregation(
    @Req() request: HttpRequest,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Body() body: { congregationId?: string },
    @Res() response: HttpResponse,
  ): Promise<void> {
    const { session, account, cookie } = await this.requireIdentity(
      request,
      csrf,
    );
    const congregationId = body.congregationId ?? '';
    const membership = await this.runtime.repository.membership(
      account.accountId,
      congregationId,
    );
    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'Acesso negado.',
      });
    }
    if (
      !(await this.runtime.auth.setActiveCongregation(cookie, congregationId))
    ) {
      throw new UnauthorizedException();
    }
    session.activeCongregationId = congregationId;
    response.status(204).send();
  }

  @Post('bootstrap/master')
  async bootstrap(
    @Headers('x-bootstrap-secret') secret: string | undefined,
    @Body() body: { email?: string },
  ) {
    if (!body.email) throw new BadRequestException();
    try {
      const issued = await this.runtime.identity.issueMasterBootstrap(
        secret ?? '',
        body.email,
      );
      return { invitationId: issued.invitationId, expiresAt: issued.expiresAt };
    } catch (error) {
      fail(error);
    }
  }

  @Post('invitations/:token/accept')
  async accept(
    @Req() request: HttpRequest,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Param('token') token: string,
    @Res() response: HttpResponse,
  ): Promise<void> {
    const { account } = await this.requireIdentity(request, csrf);
    try {
      await this.runtime.identity.acceptInvitation(account, token);
      response.status(204).send();
    } catch (error) {
      fail(error);
    }
  }

  @Post('invitations/:token/decline')
  async decline(
    @Req() request: HttpRequest,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Param('token') token: string,
    @Res() response: HttpResponse,
  ): Promise<void> {
    const { account } = await this.requireIdentity(request, csrf);
    try {
      await this.runtime.identity.declineInvitation(account, token);
      response.status(204).send();
    } catch (error) {
      fail(error);
    }
  }

  @Post('invitations/:id/revoke')
  async revokeInvitation(
    @Req() request: HttpRequest,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Param('id') id: string,
    @Res() response: HttpResponse,
  ): Promise<void> {
    const { account } = await this.requireIdentity(request, csrf);
    try {
      await this.runtime.identity.revokeInvitation(account, id);
      response.status(204).send();
    } catch (error) {
      fail(error);
    }
  }

  @Get('congregations/:id/memberships')
  async memberships(
    @Req() request: HttpRequest,
    @Param('id') congregationId: string,
  ) {
    const { account } = await this.requireIdentity(request, undefined, false);
    try {
      return await this.runtime.identity.listMemberships(
        account,
        congregationId,
      );
    } catch (error) {
      fail(error);
    }
  }

  @Post('congregations/:id/invitations/:role')
  async invite(
    @Req() request: HttpRequest,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Param('id') congregationId: string,
    @Param('role') roleSegment: string,
    @Body() body: { email?: string },
  ) {
    const { account } = await this.requireIdentity(request, csrf);
    if (!body.email || !['admin', 'publisher'].includes(roleSegment)) {
      throw new BadRequestException();
    }
    const role: LocalRole =
      roleSegment === 'admin' ? 'LOCAL_ADMIN' : 'PUBLISHER';
    try {
      const issued = await this.runtime.identity.inviteMember(account, {
        congregationId,
        email: body.email,
        role,
      });
      return { invitationId: issued.invitationId, expiresAt: issued.expiresAt };
    } catch (error) {
      fail(error);
    }
  }

  @Post('memberships/:id/:action')
  async membershipStatus(
    @Req() request: HttpRequest,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Param('id') id: string,
    @Param('action') action: string,
    @Res() response: HttpResponse,
  ): Promise<void> {
    if (!['revoke', 'reactivate'].includes(action))
      throw new NotFoundException();
    const { account } = await this.requireIdentity(request, csrf);
    try {
      await this.runtime.identity.changeMembershipStatus(
        account,
        id,
        action === 'revoke' ? 'REVOKED' : 'ACTIVE',
      );
      response.status(204).send();
    } catch (error) {
      fail(error);
    }
  }

  @Patch('memberships/:id/role')
  async membershipRole(
    @Req() request: HttpRequest,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Param('id') id: string,
    @Body() body: { role?: LocalRole },
    @Res() response: HttpResponse,
  ): Promise<void> {
    if (!body.role || !['PUBLISHER', 'LOCAL_ADMIN'].includes(body.role)) {
      throw new BadRequestException();
    }
    const { account } = await this.requireIdentity(request, csrf);
    try {
      await this.runtime.identity.changeMembershipRole(account, id, body.role);
      response.status(204).send();
    } catch (error) {
      fail(error);
    }
  }

  private async requireIdentity(
    request: HttpRequest,
    csrf?: string,
    requireCsrf = true,
  ): Promise<{
    session: SessionIdentity;
    account: AuthenticatedIdentity;
    cookie: string;
  }> {
    const cookie = readCookie(request, sessionCookie) ?? '';
    const session = await this.runtime.auth.currentSession(cookie);
    if (!session) throw new UnauthorizedException();
    if (requireCsrf && (!csrf || csrf !== session.csrfToken)) {
      throw new ForbiddenException({
        code: 'INVALID_CSRF',
        message: 'Requisição inválida.',
      });
    }
    const account = await this.runtime.repository.syncExternalAccount(session);
    return { session, account, cookie };
  }
}
