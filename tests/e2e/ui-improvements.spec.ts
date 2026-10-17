import { test, expect } from '@playwright/test';

test('UI-004 uses category cards and focused registers while keeping congregation navigation visible when scrolling', async ({
  page,
}, testInfo) => {
  await page.route('**/api/session', (route) =>
    route.fulfill({
      json: {
        authenticated: true,
        email: 'admin@example.test',
        emailVerified: true,
        csrfToken: 'test-csrf',
        memberships: [
          {
            congregationId: 'test',
            congregationName: 'Congregação de Exemplo',
            role: 'LOCAL_ADMIN',
          },
        ],
      },
    }),
  );
  const items = Array.from({ length: 18 }, (_, i) => ({
    id: `point-${i}`,
    name: `Ponto de exemplo ${i + 1}`,
    address: 'Endereço de exemplo',
    description: 'Descrição do ponto',
    capacity: 1,
    allowedTypes: ['CART'],
    photo: '',
  }));
  await page.route('**/api/congregations/test/**', (route) =>
    route.fulfill({
      json: route.request().url().endsWith('/points')
        ? items
        : route.request().url().endsWith('/schedule')
          ? {
              timezone: 'America/Sao_Paulo',
              serverNow: '2026-10-17T12:00:00Z',
              months: [{ month: '2026-10', state: 'open', canBook: true }],
              equipment: [],
              reservations: [],
              points: items.map((item) => ({ ...item, days: [] })),
            }
          : route.request().url().endsWith('/reservation-publishers')
            ? [
                {
                  id: 'other',
                  displayName: 'Publicador de Exemplo',
                  status: 'ACTIVE',
                  verified: true,
                },
              ]
            : [],
    }),
  );
  await page.goto('/#inicio');
  const tiles = page.locator('.home-category');
  await expect(tiles).toHaveCount(6);
  await expect(
    page.getByRole('textbox', { name: 'E-mail do novo publicador' }),
  ).toHaveCount(0);
  await tiles.filter({ hasText: 'Equipamentos, pontos e horários' }).click();
  const hub = page.getByRole('region', { name: 'Cadastros para reservas' });
  await expect(hub.locator('details[open]')).toHaveCount(0);
  await hub.locator('summary').filter({ hasText: 'Pontos' }).click();
  await expect(
    hub.getByRole('heading', { name: 'Ponto de exemplo 1', exact: true }),
  ).toBeVisible();
  await hub.locator('summary').filter({ hasText: 'Equipamentos' }).click();
  await expect(hub.locator('details[open]')).toHaveCount(2);
  await hub.getByRole('button', { name: 'Ver pontos', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Pontos', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Nome do ponto')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Equipamentos', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', {
      name: 'Ver detalhes de Ponto de exemplo 18',
      exact: true,
    })
    .scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  const header = page.locator('header.topbar');
  const triggerBox = await header
    .getByRole('button', { name: 'Menu', exact: true })
    .boundingBox();
  const congregationBox = await header.locator('.breadcrumbs').boundingBox();
  expect(
    Math.abs(
      triggerBox!.y +
        triggerBox!.height / 2 -
        (congregationBox!.y + congregationBox!.height / 2),
    ),
  ).toBeLessThan(5);
  const box = await header.boundingBox();
  expect(box?.y).toBe(0);
  await expect(
    header
      .locator('.breadcrumbs')
      .filter({ hasText: 'Congregação de Exemplo' }),
  ).toBeVisible();
  await expect(
    header.getByRole('button', { name: 'Menu', exact: true }),
  ).toBeInViewport();
  await header.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Menu principal' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', {
      name: 'Ver detalhes de Ponto de exemplo 18',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('Descrição do ponto', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Editar Ponto de exemplo 18', exact: true })
    .click();
  await expect(page.getByLabel('Nome do ponto')).toHaveValue(
    'Ponto de exemplo 18',
  );
  await expect(
    page.getByRole('button', { name: 'Novo ponto', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Voltar à lista de pontos' }).click();
  await page.getByRole('button', { name: 'Novo ponto', exact: true }).click();
  await expect(page.getByLabel('Nome do ponto')).toBeEmpty();
  await page.screenshot({
    path: testInfo.outputPath('cadastro.png'),
    fullPage: true,
  });
  await header.getByRole('button', { name: 'Menu', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Menu principal' });
  const programming = drawer.locator('details').filter({
    has: page.locator('summary').filter({ hasText: 'Programação' }),
  });
  if ((await programming.getAttribute('open')) === null)
    await programming.locator('summary').click();
  await drawer.getByRole('link', { name: 'Início', exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath('inicio.png'),
    fullPage: true,
  });
  await page
    .locator('.home-category')
    .filter({ hasText: 'Reservar ponto e equipamento' })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Cadastros para reservas' })
      .locator('details[open]'),
  ).toHaveCount(0);
  await expect(page.getByLabel('Responsável pela reserva')).toBeHidden();
  await page.locator('summary').filter({ hasText: 'Nova reserva' }).click();
  await expect(page.getByLabel('Responsável pela reserva')).toBeVisible();
  await expect(
    page
      .getByLabel('Responsável pela reserva')
      .getByRole('option', { name: 'Publicador de Exemplo' }),
  ).toHaveCount(1);
});
