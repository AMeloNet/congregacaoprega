import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/session', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        email: 'publisher@example.test',
        emailVerified: true,
        csrfToken: 'controlled-csrf',
        activeCongregationId: 'congregation-example',
        memberships: [
          {
            congregationId: 'congregation-example',
            congregationName: 'Congregação Exemplo',
            role: 'PUBLISHER',
          },
        ],
      }),
    });
  });
});

test('applies and persists a personal appearance', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Aparência' }).click();
  await page.getByRole('button', { name: 'Tema escuro' }).click();
  await page.getByRole('button', { name: 'Roxo' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'purple');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'purple');
});

test('follows an operating system appearance change when selected', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Aparência' }).click();
  await page.getByRole('button', { name: 'Usar aparência do sistema' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('navigates the monthly schedule with a stable route and no horizontal overflow', async ({
  page,
}) => {
  await page.route(
    '**/api/congregations/congregation-example/reservation-inbox',
    async (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ invitations: [] }),
      }),
  );
  await page.route(
    '**/api/congregations/congregation-example/schedule',
    async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          timezone: 'America/Sao_Paulo',
          serverNow: '2026-10-16T12:00:00Z',
          months: [
            { month: '2026-10', state: 'open', canBook: true },
            { month: '2026-11', state: 'finalized', canBook: false },
          ],
          equipment: [{ type: 'CART', units: 1 }],
          points: [
            {
              id: 'example-point',
              name: 'Ponto do teste',
              capacity: 1,
              allowedTypes: ['CART'],
              days: Array.from({ length: 7 }, (_, day) => ({
                day,
                mode: 'unrestricted',
                intervals: [],
              })),
            },
          ],
        }),
      });
    },
  );
  const businessRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) businessRequests.push(request.url());
  });
  await page.goto('/');
  await expect(
    page.getByText(
      /Programação, Convites e avisos e Recursos usam dados reais/i,
    ),
  ).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('combobox', { name: 'Congregação ativa' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Sair' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Pular para o conteúdo' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Menu', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Fechar menu' })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Programação' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Programação' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Ponto do teste' }),
  ).toBeVisible();
  await page.locator('summary').filter({ hasText: 'Nova reserva' }).click();
  await expect(
    page.getByRole('combobox', { name: 'Dia da semana' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page
    .getByRole('combobox', { name: 'Mês da programação' })
    .selectOption('2026-11');
  await expect(page.getByRole('status')).toContainText('Mês finalizado');
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Programação' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('link', { name: 'Início', exact: true }).click();
  await page.goBack();
  await expect(
    page.getByRole('heading', { name: 'Programação' }),
  ).toBeVisible();
  await page.goto('/#relatorio');
  await expect(page.getByRole('alert')).toContainText(
    'não está disponível para seu perfil',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  expect(
    businessRequests.filter(
      (url) =>
        !url.endsWith('/api/session') &&
        !url.endsWith('/api/congregations/congregation-example/schedule') &&
        !url.endsWith(
          '/api/congregations/congregation-example/reservation-inbox',
        ),
    ),
  ).toEqual([]);
  expect(businessRequests.some((url) => url.endsWith('/schedule'))).toBe(true);
});

test('joins an open position and shows participation and the confirmed minimum', async ({
  page,
}) => {
  let joined = false;
  await page.route(
    '**/api/congregations/congregation-example/schedule',
    async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          timezone: 'America/Sao_Paulo',
          serverNow: '2026-10-16T12:00:00Z',
          months: [{ month: '2026-10', state: 'open', canBook: true }],
          equipment: [],
          points: [],
          recurrences: [],
          reservations: [
            {
              id: 'open-reservation',
              pointName: 'Ponto com vaga',
              date: '2026-10-20',
              startHour: 8,
              duration: 2,
              equipmentType: 'CART',
              thirdPositionOpen: false,
              isResponsible: false,
              isParticipant: joined,
              confirmedCount: joined ? 2 : 1,
              openPositions: joined ? 0 : 1,
              canJoin: !joined,
            },
          ],
        }),
      });
    },
  );
  await page.route(
    '**/api/congregations/congregation-example/reservations/open-reservation/join',
    async (route) => {
      expect(route.request().headers()['x-csrf-token']).toBe('controlled-csrf');
      expect(route.request().method()).toBe('POST');
      expect(route.request().postData()).toBeNull();
      joined = true;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ position: 2, confirmedCount: 2 }),
      });
    },
  );
  await page.goto('/#programacao');
  await expect(page.getByText(/1 confirmado.*Grupo em formação/)).toBeVisible();
  await page.getByRole('button', { name: 'Participar', exact: true }).click();
  await expect(
    page.getByText('Sua participação foi confirmada nesta designação.'),
  ).toBeVisible();
  await expect(
    page.getByText(/Você participa.*2 confirmado.*Mínimo atendido.*0 vaga/),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Participar', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Repetir toda semana' }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test('accepts a real invitation flow and consults the confirmed roster without horizontal overflow', async ({
  page,
}) => {
  let accepted = false;
  await page.route(
    '**/api/congregations/congregation-example/publisher-profile',
    async (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ displayName: 'Publicador Teste' }),
      }),
  );
  await page.route(
    '**/api/congregations/congregation-example/reservation-inbox',
    async (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          invitations: [
            {
              id: 'targeted-invitation',
              pointName: 'Ponto real de teste',
              date: '2026-10-20',
              startHour: 8,
              duration: 2,
              state: accepted ? 'accepted' : 'pending',
            },
          ],
          notices: [],
        }),
      }),
  );
  await page.route(
    '**/api/congregations/congregation-example/reservation-invitations/targeted-invitation/accept',
    async (route) => {
      expect(route.request().headers()['x-csrf-token']).toBe('controlled-csrf');
      accepted = true;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ state: 'accepted' }),
      });
    },
  );
  await page.route(
    '**/api/congregations/congregation-example/schedule',
    async (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          reservations: [
            {
              id: 'real-booking',
              pointName: 'Ponto real de teste',
              date: '2026-10-20',
            },
          ],
        }),
      }),
  );
  await page.route(
    '**/api/congregations/congregation-example/reservations/real-booking',
    async (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'real-booking',
          pointName: 'Ponto real de teste',
          date: '2026-10-20',
          participants: [
            { accountId: 'owner', position: 1, name: 'Responsável Teste' },
            { accountId: 'guest', position: 2, name: 'Publicador Teste' },
          ],
          history: [],
        }),
      }),
  );
  await page.goto('/#convites');
  await page
    .getByRole('button', { name: 'Aceitar convite', exact: true })
    .click();
  await expect(
    page.getByText(
      'Convite aceito. Convites conflitantes foram recusados automaticamente.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('link', { name: 'Detalhe da reserva' }).click();
  await page
    .getByLabel('Designação', { exact: true })
    .selectOption('real-booking');
  await expect(
    page.getByText('Responsável: Responsável Teste', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Participante: Publicador Teste', { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test('activates weekly recurrence, shows unavailable dates and stops without removing bookings', async ({
  page,
}) => {
  let active = false;
  let stopped = false;
  let retried = false;
  const source = {
    id: 'source-booking',
    pointName: 'Ponto recorrente',
    date: '2026-10-20',
    startHour: 8,
    duration: 2,
    equipmentType: 'CART',
    thirdPositionOpen: true,
    isResponsible: true,
  };
  await page.route(
    '**/api/congregations/congregation-example/schedule',
    async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          timezone: 'America/Sao_Paulo',
          serverNow: '2026-10-16T12:00:00Z',
          months: [
            { month: '2026-10', state: 'open', canBook: true },
            { month: '2026-11', state: 'open', canBook: true },
          ],
          equipment: [],
          points: [],
          reservations: [
            {
              ...source,
              seriesId: active ? 'weekly-series' : null,
              seriesStoppedAt: stopped ? '2026-10-16T15:00:00Z' : null,
            },
          ],
          recurrences: active
            ? [
                {
                  id: 'weekly-series',
                  sourceReservationId: source.id,
                  pointId: 'point',
                  weekday: 2,
                  startHour: 8,
                  equipmentType: 'CART',
                  isResponsible: true,
                  stoppedAt: stopped ? '2026-10-16T15:00:00Z' : null,
                  conflicts: retried
                    ? []
                    : [
                        {
                          date: '2026-10-27',
                          message:
                            'Reserva indisponível: ponto ou equipamento ocupado.',
                        },
                      ],
                },
              ]
            : [],
        }),
      });
    },
  );
  await page.route(
    '**/api/congregations/congregation-example/reservations/source-booking/recurrence',
    async (route) => {
      expect(route.request().headers()['x-csrf-token']).toBe('controlled-csrf');
      active = true;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'weekly-series',
          generated: 3,
          conflicts: [{ date: '2026-10-27', message: 'Reserva indisponível' }],
        }),
      });
    },
  );
  await page.route(
    '**/api/congregations/congregation-example/recurrences/weekly-series/retry/2026-10-27',
    async (route) => {
      retried = true;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ generated: 1, conflicts: [] }),
      });
    },
  );
  await page.route(
    '**/api/congregations/congregation-example/recurrences/weekly-series/stop',
    async (route) => {
      stopped = true;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ stopped: true }),
      });
    },
  );
  await page.goto('/#programacao');
  await page.getByRole('button', { name: 'Repetir toda semana' }).click();
  await expect(page.getByRole('alert')).toContainText(
    '27/10/2026: Reserva indisponível',
  );
  await page
    .getByRole('button', { name: 'Tentar novamente em 27/10/2026' })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Encerrar recorrência' }).click();
  await expect(
    page.getByText('Recorrência encerrada; esta reserva foi preservada.'),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '20/10/2026 · Ponto recorrente' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Encerrar recorrência' }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test('keeps publishers blocked after an authenticated administrative reopening', async ({
  page,
}) => {
  let role = 'PUBLISHER',
    state = 'finalized',
    reopenings = 0;
  await page.route('**/api/session', async (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        email: 'member@example.test',
        emailVerified: true,
        csrfToken: 'controlled-csrf',
        activeCongregationId: 'congregation-example',
        memberships: [
          {
            congregationId: 'congregation-example',
            congregationName: 'Congregação Exemplo',
            role,
          },
        ],
      }),
    }),
  );
  const schedule = () => ({
    timezone: 'America/Sao_Paulo',
    serverNow: '2026-10-16T12:00:00Z',
    months: [{ month: '2026-10', state, canBook: false }],
    equipment: [{ type: 'CART', units: 1 }],
    reservations: [],
    recurrences: [],
    points: [
      {
        id: 'example-point',
        name: 'Ponto do teste',
        capacity: 1,
        allowedTypes: ['CART'],
        days: Array.from({ length: 7 }, (_, day) => ({
          day,
          mode: 'unrestricted',
          intervals: [],
        })),
      },
    ],
  });
  await page.route(
    '**/api/congregations/congregation-example/schedule',
    async (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(schedule()),
      }),
  );
  await page.route(
    '**/api/congregations/congregation-example/schedule/2026-10/reopen',
    async (route) => {
      expect(route.request().method()).toBe('POST');
      expect(route.request().headers()['x-csrf-token']).toBe('controlled-csrf');
      expect(role).toBe('LOCAL_ADMIN');
      reopenings++;
      state = 'reopened';
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(schedule()),
      });
    },
  );
  await page.goto('/#programacao');
  await expect(page.getByRole('status')).toContainText('Mês finalizado');
  await expect(
    page.getByRole('button', { name: 'Confirmar reserva' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Reabrir para ajustes administrativos' }),
  ).toHaveCount(0);
  role = 'LOCAL_ADMIN';
  await page.reload();
  await page
    .getByRole('button', { name: 'Reabrir para ajustes administrativos' })
    .click();
  await page.locator('summary').filter({ hasText: 'Nova reserva' }).click();
  await expect(
    page.getByRole('button', { name: 'Confirmar reserva' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Finalizar e imprimir' }),
  ).toBeVisible();
  role = 'PUBLISHER';
  await page.reload();
  await expect(page.getByRole('status')).toContainText(
    'Publicadores continuam bloqueados',
  );
  await expect(
    page.getByRole('button', { name: 'Confirmar reserva' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Finalizar e imprimir' }),
  ).toHaveCount(0);
  expect(reopenings).toBe(1);
});
