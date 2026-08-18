import { expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { fibosearch } from '../profiles/plugins.js';

/**
 * El endpoint de búsqueda devuelve productos.
 *
 * Si un update de FiboSearch pierde el índice, la búsqueda queda muda: el sitio
 * se ve perfecto, la caja de búsqueda escribe, y nadie encuentra nada. En una
 * tienda donde la mitad del tráfico busca por nombre, eso es estar cerrado.
 *
 * Se pide el endpoint AJAX directo — el mismo que usa el buscador del header —
 * porque es determinista: la UI tiene debounce y da flaky.
 */
export async function expectSearchIndexAlive(
  request: APIRequestContext,
  query: string
): Promise<void> {
  const response = await request.get(fibosearch.endpoint(query));
  expect(response.status(), 'el endpoint de búsqueda no responde').toBe(200);

  const body = (await response.json()) as { suggestions?: Array<{ type?: string }> };
  // "no-results" es una sugerencia más en el formato de FiboSearch: contarla
  // haría pasar el test justo cuando el índice está vacío.
  const hits = (body.suggestions ?? []).filter((s) => s.type !== 'no-results');

  expect(hits.length, `la búsqueda de "${query}" no devolvió productos: ¿se cayó el índice?`).toBeGreaterThan(
    0
  );
}

/**
 * El buscador del header engancha el JS y sugiere.
 *
 * Complemento del anterior: el índice puede estar sano y el widget roto (un
 * conflicto de scripts deja el input inerte). Uno sin el otro no alcanza.
 */
export async function expectSearchBoxSuggests(page: Page, query: string): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const input = page.locator(fibosearch.input).first();
  await expect(input, 'no hay caja de búsqueda visible en el header').toBeVisible();

  // Se espera la respuesta del AJAX, no un timeout fijo: el widget tiene debounce
  // y dormir N segundos es exactamente como se fabrican los tests flaky.
  //
  // Se espera CUALQUIER consulta del buscador, no la del término completo: al
  // escribir tecla por tecla el widget dispara una por pulsación y decide solo
  // cuáles cancela. Exigir la del término entero hacía fallar el test cuando el
  // debounce se comía la última — sin que el buscador tuviera nada roto.
  // Que el resultado sea el correcto lo prueba la sugerencia visible, más abajo.
  const suggested = page.waitForResponse((r) => r.url().includes(fibosearch.ajaxUrlPart), {
    timeout: 30_000,
  });

  await input.click();
  // Tecla por tecla: el buscador escucha eventos de teclado, no un fill().
  await input.pressSequentially(query, { delay: 80 });
  await suggested;

  await expect(
    page.locator(fibosearch.suggestion).first(),
    'el buscador consultó pero no mostró sugerencias'
  ).toBeVisible({ timeout: 10_000 });
}
