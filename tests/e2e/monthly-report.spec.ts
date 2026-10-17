import { expect, test } from '@playwright/test';
test('emits before printing and preserves the version when the print dialog is dismissed, with readable print layout', async ({
  page,
}, testInfo) => {
  let issued = false,
    emissions = 0;
  const snapshot = {
    schemaVersion: 1,
    title: 'Testemunho Público',
    congregationName: 'Congregação de Teste',
    timezone: 'America/Sao_Paulo',
    month: '2026-10',
    entries: Array.from({ length: 24 }, (_, i) => ({
      id: `reservation-${i}`,
      date: `2026-10-${String(17 + Math.floor(i / 2)).padStart(2, '0')}`,
      weekday: (6 + Math.floor(i / 2)) % 7,
      pointName: 'Ponto de pregação com nome extenso para leitura no quadro',
      startHour: i % 2 ? 23 : 8,
      duration: 2,
      equipmentType: 'CART',
      crossesMidnight: i % 2 === 1,
      participants: [
        {
          name: 'Responsável de Teste com Nome Composto',
          status: 'confirmed',
          responsible: true,
        },
        {
          name: 'Participante Confirmado de Teste',
          status: 'confirmed',
          responsible: false,
        },
        { name: 'Convidado de Teste', status: 'pending', responsible: false },
      ],
    })),
  };
  const report = {
    id: 'emitted-report',
    version: 1,
    createdAt: '2026-10-16T12:00:00Z',
    snapshot,
  };
  await page.addInitScript(() => {
    window.print = () => {
      document.body.setAttribute(
        'data-printed-version',
        document.querySelector('[aria-label="Versão emitida do relatório"]')
          ?.textContent ?? 'not-rendered',
      );
    };
  });
  await page.route('**/api/session', async (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        email: 'admin@example.test',
        emailVerified: true,
        csrfToken: 'report-csrf',
        activeCongregationId: 'report-congregation',
        memberships: [
          {
            congregationId: 'report-congregation',
            congregationName: 'Congregação de Teste',
            role: 'LOCAL_ADMIN',
          },
        ],
      }),
    }),
  );
  await page.route(
    '**/api/congregations/report-congregation/schedule',
    async (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ months: [{ month: '2026-10' }] }),
      }),
  );
  await page.route(
    '**/api/congregations/report-congregation/schedule/2026-10/report-preview',
    async (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          draft: true,
          state: issued ? 'finalized' : 'open',
          snapshot,
          missingNames: [],
          reports: issued
            ? [{ id: report.id, version: 1, createdAt: report.createdAt }]
            : [],
        }),
      }),
  );
  await page.route(
    '**/api/congregations/report-congregation/schedule-reports/emitted-report',
    async (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(report),
      }),
  );
  await page.route(
    '**/api/congregations/report-congregation/schedule/2026-10/finalize-print',
    async (route) => {
      expect(route.request().headers()['x-csrf-token']).toBe('report-csrf');
      emissions++;
      issued = true;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(report),
      });
    },
  );
  await page.goto('/#relatorio?month=2026-10');
  await page.getByRole('button', { name: 'Aparência' }).click();
  await page.getByRole('button', { name: 'Tema escuro' }).click();
  await expect(
    page.getByText('PRÉVIA — NÃO FINALIZADA', { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page
    .getByRole('button', { name: 'Finalizar e imprimir', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'mesmo se a impressão for cancelada',
  );
  await expect(page.locator('body')).toHaveAttribute(
    'data-printed-version',
    /Versão 1/,
  );
  await page.getByRole('button', { name: 'Reimprimir versão 1' }).click();
  expect(emissions).toBe(1);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Reimprimir versão 1' }),
  ).toBeVisible();
  expect(emissions).toBe(1);
  await page.emulateMedia({ media: 'print' });
  expect(
    await page
      .locator('html')
      .evaluate((element) => getComputedStyle(element).colorScheme),
  ).toBe('light');
  expect(
    await page
      .locator('html')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe('rgb(255, 255, 255)');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('.identity-bar')).toBeHidden();
  await expect(page.locator('.skip-link')).toBeHidden();
  await expect(page.locator('.identity-actions')).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Reimprimir versão 1' }),
  ).toBeHidden();
  expect(
    await page
      .locator('.schedule-report thead')
      .evaluate((element) => getComputedStyle(element).display),
  ).toBe('table-header-group');
  await expect(page.locator('.schedule-report')).toContainText(
    'Convidado de Teste — pendente',
  );
  await page.screenshot({
    path: testInfo.outputPath('report-print.png'),
    fullPage: false,
  });
  await page.pdf({
    path: testInfo.outputPath('report-print.pdf'),
    preferCSSPageSize: true,
    printBackground: true,
  });
});
