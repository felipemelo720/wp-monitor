import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Verifica que la ruta contenga el texto que la identifica.
 *
 * Es el único check capaz de detectar un permalink roto: WordPress devuelve 200
 * en rutas que no existen (sirve el home, una plantilla vacía o el archivo del
 * blog), así que el status HTTP no delata nada y la página "carga bien".
 *
 * Busca en el <title> Y en el texto del body: hay rutas donde el ancla está solo
 * en el título (una categoría) y otras donde está solo en el contenido.
 */
export async function expectContains(page: Page, path: string, needle: string): Promise<void> {
  const title = await page.title();
  const body = await page.locator('body').innerText();
  const haystack = `${title}\n${body}`.toLowerCase();

  expect(
    haystack.includes(needle.toLowerCase()),
    `${path}: no aparece "${needle}" ni en el título ni en el body — ¿permalink roto, plantilla cambiada o página de mantenimiento?`
  ).toBe(true);
}
