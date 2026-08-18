import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Site } from '../sites/schema.js';
import { expectNoPhpErrors } from './php.js';
import { contentStable } from './../lib/page.js';

/**
 * El login de WordPress arranca sin reventar.
 *
 * Un core o un plugin roto tumba el admin antes que el front: la tienda vende,
 * pero nadie puede entrar a cargar productos ni a ver los pedidos.
 *
 * Lo que NO se exige es que el formulario esté: muchos sitios ocultan o renombran
 * wp-login.php con un plugin de seguridad, así que un 301, un 403 o un 404 son
 * respuestas normales. Lo que no puede pasar es un 5xx o un fatal de PHP.
 * Si el sitio declara `loginPath`, ahí sí se exige el formulario.
 */
export async function expectLoginUsable(page: Page, site: Site): Promise<void> {
  const path = site.loginPath ?? '/wp-login.php';
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' });

  expect(response, `${path}: el servidor no respondió`).not.toBeNull();
  expect(response!.status(), `${path}: HTTP ${response!.status()} — el admin está caído`).toBeLessThan(
    500
  );

  expectNoPhpErrors(await contentStable(page), path);

  if (site.loginPath) {
    await expect(
      page.locator('#loginform, #user_login').first(),
      `${path}: el sitio declara este login pero no renderiza el formulario`
    ).toBeVisible();
  }
}
