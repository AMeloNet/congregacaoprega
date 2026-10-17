import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { IdentityController } from '../../../../apps/api/src/identity/identity.controllers.js';
import { IdentityRuntime } from '../../../../apps/api/src/identity/identity.runtime.js';
import { PgIdentityRepository } from '../../../../apps/api/src/identity/pg-identity.repository.js';
import { MemorySessionStore } from '../../../../apps/api/src/auth/session.store.js';
import {
  followingMonth,
  localMonth,
} from '../../../../apps/api/src/monthly-schedule.service.js';
const { Test } = createRequire(
  new URL('../../../../apps/api/package.json', import.meta.url),
)('@nestjs/testing');

export async function reservationApp(pool: Pool) {
  const sessions = new MemorySessionStore(),
    repository = new PgIdentityRepository(pool);
  const congregation = randomUUID(),
    foreign = randomUUID(),
    point = randomUUID();
  await pool.query(
    "INSERT INTO congregation (id,name) VALUES ($1,'Management test'),($2,'Other management test')",
    [congregation, foreign],
  );
  const users: { accountId: string; headers: Record<string, string> }[] = [];
  for (let index = 0; index < 7; index++) {
    const session = sessions.create({
      issuer: 'https://example.test/',
      subject: `management-${index}`,
      email: `management-${index}@example.test`,
      emailVerified: index !== 6,
    });
    const account = await repository.syncExternalAccount(session.identity);
    await pool.query(
      'INSERT INTO membership (id,account_id,congregation_id,role) VALUES ($1,$2,$3,$4)',
      [
        randomUUID(),
        account.accountId,
        index === 5 ? foreign : congregation,
        index === 0 ? 'LOCAL_ADMIN' : 'PUBLISHER',
      ],
    );
    users.push({
      accountId: account.accountId,
      headers: {
        cookie: `cp_session=${session.token}`,
        'x-csrf-token': session.identity.csrfToken,
        'content-type': 'application/json',
      },
    });
  }
  await pool.query(
    "INSERT INTO preaching_point (id,congregation_id,name,allowed_types) VALUES ($1,$2,'Management point',ARRAY['CART']::equipment_type[])",
    [point, congregation],
  );
  await pool.query(
    "INSERT INTO equipment (id,congregation_id,name,type) VALUES ($1,$2,'Management cart','CART')",
    [randomUUID(), congregation],
  );
  const moduleRef = await Test.createTestingModule({
    controllers: [IdentityController],
    providers: [
      {
        provide: IdentityRuntime,
        useValue: {
          pool,
          repository,
          auth: {
            currentSession: async (token: string) => sessions.get(token),
          },
        },
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/api/congregations/${congregation}`;
  const request = (path: string, index = 0, body?: unknown, method = 'POST') =>
    fetch(`${base}/${path}`, {
      method,
      headers: users[index]!.headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  const month = followingMonth(localMonth(new Date(), 'America/Sao_Paulo'));
  const book = async (index = 1, extra: Record<string, unknown> = {}) => {
    const response = await request('reservations', index, {
      requestKey: randomUUID(),
      pointId: point,
      date: `${month}-10`,
      startHour: 8,
      duration: 2,
      equipmentType: 'CART',
      thirdPositionOpen: true,
      ...extra,
    });
    expect(response.status).toBe(201);
    return (await response.json()) as { id: string };
  };
  return {
    app,
    base,
    request,
    book,
    month,
    users,
    congregation,
    foreign,
    point,
  };
}
