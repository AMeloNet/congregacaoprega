import { expect, test } from '@playwright/test';

test('groups authorized functions in a keyboard accessible drawer and resets them when the active congregation changes', async ({
  page,
}, testInfo) => {
  let active = 'admin-congregation';
  const requests: string[] = [];
  const memberships = [
    {
      congregationId: 'admin-congregation',
      congregationName: 'Congregação de Teste A',
      role: 'LOCAL_ADMIN',
    },
    {
      congregationId: 'publisher-congregation',
      congregationName: 'Congregação de Teste B',
      role: 'PUBLISHER',
    },
  ];
  await page.route('**/api/session', async (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        email: 'member@example.test',
        emailVerified: true,
        csrfToken: 'menu-csrf',
        activeCongregationId: active,
        memberships,
      }),
    }),
  );
  await page.route('**/api/session/congregation', async (route) => {
    expect(route.request().headers()['x-csrf-token']).toBe('menu-csrf');
    active = route.request().postDataJSON().congregationId;
    await route.fulfill({ status: 204 });
  });
  await page.route('**/api/congregations/**', async (route) => {
    requests.push(new URL(route.request().url()).pathname);
    await route.fulfill({
      contentType: 'application/json',
      body: route.request().url().endsWith('/publisher-profile')
        ? JSON.stringify({ displayName: 'Publicador de Teste' })
        : '[]',
    });
  });
  await page.goto('/#inicio');
  const trigger = page.getByRole('button', { name: 'Menu', exact: true });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: 'Menu principal' });
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByRole('button', { name: 'Fechar menu' }),
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(
    await page.evaluate(() => !!document.activeElement?.closest('dialog')),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await drawer.locator('summary').filter({ hasText: 'Cadastros' }).click();
  for (const name of ['Publicadores', 'Equipamentos', 'Pontos', 'Horários'])
    await expect(drawer.getByRole('link', { name, exact: true })).toBeVisible();
  await drawer.locator('summary').filter({ hasText: 'Cadastros' }).click();
  await expect(
    drawer.getByRole('link', { name: 'Equipamentos', exact: true }),
  ).toBeHidden();
  await drawer.locator('summary').filter({ hasText: 'Cadastros' }).click();
  await drawer.locator('summary').filter({ hasText: 'Administração' }).click();
  await drawer.locator('summary').filter({ hasText: 'Relatórios' }).click();
  await expect(
    drawer.getByRole('link', { name: 'Gestão mensal' }),
  ).toBeVisible();
  await expect(
    drawer.getByRole('link', { name: 'Alertas administrativos' }),
  ).toBeVisible();
  await expect(
    drawer.getByRole('link', { name: 'Relatório', exact: true }),
  ).toBeVisible();
  await expect(
    drawer.locator('summary').filter({ hasText: 'Sistema' }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('administrator-menu.png'),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.mouse.click(page.viewportSize()!.width - 5, 180);
  await expect(drawer).toBeHidden();
  await trigger.click();
  await drawer.getByRole('link', { name: 'Equipamentos', exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(
    page.getByRole('heading', { name: 'Equipamentos', exact: true }).first(),
  ).toBeVisible();
  expect(requests).toContain('/api/congregations/admin-congregation/equipment');
  await page
    .getByRole('combobox', { name: 'Congregação ativa' })
    .selectOption('publisher-congregation');
  await expect(page.getByRole('alert')).toContainText(
    'não está disponível para seu perfil',
  );
  await expect(
    page.getByRole('heading', { name: 'Início', exact: true }),
  ).toBeVisible();
  await trigger.click();
  for (const name of ['Cadastros', 'Administração', 'Relatórios', 'Sistema'])
    await expect(
      drawer.locator('summary').filter({ hasText: name }),
    ).toHaveCount(0);
  await drawer.locator('summary').filter({ hasText: 'Participação' }).click();
  await expect(
    drawer.getByRole('link', { name: 'Convites e avisos' }),
  ).toBeVisible();
  await expect(
    drawer.getByRole('link', { name: 'Nova reserva' }),
  ).toBeVisible();
  await drawer.locator('summary').filter({ hasText: 'Minha conta' }).click();
  await expect(
    drawer.getByRole('link', { name: 'Sair', exact: true }),
  ).toHaveAttribute('href', '/api/auth/logout');
  await page.screenshot({ path: testInfo.outputPath('publisher-menu.png') });
  await drawer.getByRole('button', { name: 'Aparência', exact: true }).click();
  await page.getByRole('button', { name: 'Tema escuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(
    page.getByRole('textbox', { name: 'Seu nome na programação' }),
  ).toHaveValue('Publicador de Teste');
  await page.goto('/#relatorio');
  await expect(page.getByRole('alert')).toContainText(
    'não está disponível para seu perfil',
  );
  expect(
    requests.filter(
      (path) =>
        path.startsWith('/api/congregations/publisher-congregation/') &&
        !path.endsWith('/publisher-profile'),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
