import { expect, test } from '@playwright/test';

test('shows its status and explains failed connectivity with keyboard access', async ({
  page,
}) => {
  await page.route('**/api/health/ready', async (route) => {
    await route.fulfill({
      status: 503,
      body: JSON.stringify({ status: 'unavailable' }),
    });
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'congregacaoprega' }),
  ).toBeVisible();
  await expect(page.getByText('Base técnica em preparação')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Verificar conexão' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByText('Sem conexão com o servidor. Tente novamente.'),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
