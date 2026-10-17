import { test, expect } from '@playwright/test';

test('shows the point photo on a publisher reservation card, while booking and in the reservation details', async ({
  page,
}, testInfo) => {
  const photo =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  const point = {
    id: 'pictured-point',
    name: 'Ponto com foto',
    capacity: 1,
    allowedTypes: ['CART'],
    days: [],
  };
  const reservation = {
    id: 'reservation',
    pointId: point.id,
    pointName: point.name,
    date: '2026-10-20',
    startHour: 8,
    duration: 1,
    equipmentType: 'CART',
    thirdPositionOpen: true,
    isResponsible: true,
    confirmedCount: 1,
  };
  await page.route('**/api/session', (route) =>
    route.fulfill({
      json: {
        authenticated: true,
        emailVerified: true,
        csrfToken: 'example-csrf',
        memberships: [
          {
            congregationId: 'example',
            congregationName: 'Congregação de Exemplo',
            role: 'PUBLISHER',
          },
        ],
      },
    }),
  );
  await page.route('**/api/congregations/example/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = path.endsWith('/schedule')
      ? {
          timezone: 'America/Sao_Paulo',
          serverNow: '2026-10-17T12:00:00Z',
          months: [{ month: '2026-10', state: 'open', canBook: true }],
          equipment: [],
          points: [point],
          reservations: [
            reservation,
            {
              ...reservation,
              id: 'unpictured',
              pointId: 'without-photo',
              pointName: 'Ponto sem foto',
            },
          ],
        }
      : path.endsWith('/pictured-point/photo')
        ? { photo }
        : path.endsWith('/photo')
          ? { photo: '' }
          : path.endsWith('/reservations/reservation')
            ? {
                ...reservation,
                revision: 'a'.repeat(64),
                cancelledAt: null,
                participants: [
                  {
                    accountId: 'publisher',
                    position: 1,
                    name: 'Publicador de Exemplo',
                  },
                ],
                history: [],
              }
            : [];
    return route.fulfill({ json });
  });
  await page.goto('/#programacao');
  const card = page
    .locator('article.schedule-card')
    .filter({
      has: page.getByRole('heading', {
        name: '20/10/2026 · Ponto com foto',
        exact: true,
      }),
    });
  const image = card.getByRole('img', { name: 'Foto do ponto de pregação' });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', photo);
  await expect
    .poll(() => image.evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBe(1);
  const empty = page
    .locator('article.schedule-card')
    .filter({
      has: page.getByRole('heading', {
        name: '20/10/2026 · Ponto sem foto',
        exact: true,
      }),
    });
  await expect(empty.getByRole('img')).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('reservation-photo.png'),
    fullPage: true,
  });
  await page.locator('summary').filter({ hasText: 'Nova reserva' }).click();
  await page.getByLabel('Ponto', { exact: true }).selectOption(point.id);
  await expect(
    page
      .locator('form.reservation-form')
      .getByRole('img', { name: 'Foto do ponto de pregação' }),
  ).toBeVisible();
  await card
    .locator('summary')
    .filter({ hasText: 'Participantes e detalhes' })
    .click();
  await expect(
    card
      .getByRole('region', { name: 'Detalhes da designação' })
      .getByRole('img', { name: 'Foto do ponto de pregação' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
