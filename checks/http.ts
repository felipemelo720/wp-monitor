import { expect } from '@playwright/test';
import type { Page, Response } from '@playwright/test';

/**
 * Navega a una ruta del sitio y verifica que el servidor haya contestado algo
 * usable. Devuelve la respuesta para que quien llame siga chequeando.
 *
 * `domcontentloaded` y no `load` ni `networkidle`: estas tiendas tienen chat,
 * píxeles y Turnstile haciendo polling eterno, así que `networkidle` no se cumple
 * nunca y `load` queda a merced del recurso de terceros más lento. El HTML ya
 * está completo en `domcontentloaded`, que es lo que miran los checks de PHP.
 *
 * Un `null` en la respuesta significa que la navegación no llegó a hacer un
 * request HTTP (DNS caído, TLS rechazado, conexión rehusada): un sitio caído se
 * ve así, no como un 500.
 */
export async function gotoOk(page: Page, path: string): Promise<Response> {
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' });

  expect(response, `${path}: el servidor no respondió (¿DNS, TLS o el sitio caído?)`).not.toBeNull();
  const res = response as Response;

  // <400 y no ===200: un 301 a la versión canónica es normal y Playwright ya lo
  // siguió, así que acá el status es el del destino final. Lo que se rechaza es
  // 4xx (ruta muerta) y 5xx (PHP/servidor roto).
  expect(res.status(), `${path}: HTTP ${res.status()} ${res.statusText()}`).toBeLessThan(400);

  return res;
}

/**
 * Una página en blanco: WordPress con un fatal capturado, un theme que no cargó
 * o una redirección a una plantilla vacía devuelven 200 con el <body> pelado.
 * El status no delata nada; el largo del texto sí.
 *
 * 100 caracteres es deliberadamente bajo: no mide "la página está completa", mide
 * "hay algo". Que el contenido correcto esté es trabajo de mustContain (fase 2).
 */
export async function expectRenderedContent(page: Page, path: string): Promise<void> {
  await expect(page, `${path}: sin <title> (¿WordPress sirvió una página vacía?)`).toHaveTitle(
    /\S/
  );

  const text = (await page.locator('body').innerText()).trim();
  expect(text.length, `${path}: el body tiene ${text.length} caracteres de texto`).toBeGreaterThan(
    100
  );
}
