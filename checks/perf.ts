import { expect } from '@playwright/test';
import type { Response, TestInfo } from '@playwright/test';

/**
 * Tiempo hasta el primer byte, en ms. -1 si Playwright no lo pudo medir (pasa
 * cuando la respuesta salió de la caché del navegador).
 *
 * Los tiempos del `timing()` son relativos al inicio del request, así que
 * responseStart YA es el TTFB: incluye DNS, TLS y lo que el servidor tardó en
 * pensar. Es el número que mide "WordPress está agonizando" — un sitio con la
 * base de datos saturada sigue devolviendo 200, solo que a los 12 segundos.
 */
export function ttfbOf(response: Response): number {
  const { responseStart } = response.request().timing();
  return responseStart < 0 ? -1 : Math.round(responseStart);
}

/**
 * Presupuesto de respuesta. Un sitio que tarda 10 segundos está caído para el
 * negocio aunque conteste 200: el visitante ya se fue.
 *
 * El TTFB se deja anotado en el reporte incluso cuando pasa, para poder ver la
 * degradación antes de que cruce el umbral: entre "1.9s" de siempre y un
 * "4.8s" nuevo hay una historia, y sin el dato registrado no se puede contar.
 */
export function expectWithinBudget(
  response: Response,
  path: string,
  budgetMs: number,
  testInfo: TestInfo
): void {
  const ttfb = ttfbOf(response);
  if (ttfb < 0) return;

  testInfo.annotations.push({ type: 'ttfb', description: `${path} — ${ttfb}ms` });

  expect(
    ttfb,
    `${path}: primer byte a los ${ttfb}ms (presupuesto ${budgetMs}ms) — el sitio contesta, pero tarde`
  ).toBeLessThanOrEqual(budgetMs);
}
