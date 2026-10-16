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
    '**/api/congregations/congregation-example/schedule',
    async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          timezone: 'America/Sao_Paulo',
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
    page.getByText(/programação mensal e recursos usam dados reais/i),
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
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Programação' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Programação' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Ponto do teste' }),
  ).toBeVisible();
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
  await page.getByRole('link', { name: 'Recursos' }).click();
  await page.goBack();
  await expect(
    page.getByRole('heading', { name: 'Programação' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Relatório' }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  expect(
    businessRequests.filter(
      (url) =>
        !url.endsWith('/api/session') &&
        !url.endsWith('/api/congregations/congregation-example/schedule'),
    ),
  ).toEqual([]);
  expect(businessRequests.some((url) => url.endsWith('/schedule'))).toBe(true);
});

test('walks through reservation and invitation examples', async ({ page }) => {
  await page.goto('/#nova-reserva');
  await page
    .getByRole('combobox', { name: 'Horário' })
    .selectOption('08:00–10:00');
  await page.getByRole('button', { name: 'Revisar reserva' }).click();
  await expect(page.getByRole('alert')).toContainText('indisponível');
  await page
    .getByRole('combobox', { name: 'Horário' })
    .selectOption('10:00–12:00');
  await page.getByRole('button', { name: 'Revisar reserva' }).click();
  await page
    .getByRole('button', { name: 'Confirmar reserva simulada' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Detalhe da reserva' }),
  ).toBeVisible();
  await expect(page.getByTestId('positions').getByRole('listitem')).toHaveCount(
    3,
  );
  await page.getByRole('link', { name: 'Convites e avisos' }).click();
  await page.getByRole('button', { name: 'Aceitar convite' }).first().click();
  await expect(page.getByRole('status')).toContainText('Convite aceito');
});

test('finalizes before printing and blocks a publisher even after an administrative reopening', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.printed = 'true';
    };
  });
  await page.goto('/#administracao');
  await page.getByRole('button', { name: 'Ver como administrador' }).click();
  await page.getByRole('button', { name: 'Finalizar e imprimir' }).click();
  await expect(page.getByRole('heading', { name: 'Relatório' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-printed', 'true');
  await expect(page.getByText('Versão 1').first()).toBeVisible();
  await page.getByRole('link', { name: 'Administração' }).click();
  await page.getByRole('button', { name: 'Reabrir para ajustes' }).click();
  await page
    .getByRole('button', { name: 'Adicionar participante fictício' })
    .click();
  await page.getByRole('button', { name: 'Finalizar e imprimir' }).click();
  await expect(page.getByText('Versão 2').first()).toBeVisible();
  await expect(page.getByText('Teresa; Joaquim')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.print-sheet')).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Ver como publicador' }).click();
  await page.getByRole('link', { name: 'Nova reserva' }).click();
  await expect(
    page.getByRole('button', { name: 'Revisar reserva' }),
  ).toBeDisabled();
});
