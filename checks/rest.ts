import { expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

/**
 * La REST API de WordPress viva.
 *
 * Rotura que nadie ve desde el front: el editor de bloques, la app móvil, el
 * carrito por AJAX de los themes modernos y medio panel de administración hablan
 * por /wp-json/. Un plugin de seguridad mal configurado, un mod_security nuevo o
 * un .htaccess tocado la matan sin despeinar una sola página pública. El sitio se
 * ve perfecto y el que quiere editarlo no puede.
 *
 * Se pide la raíz, que es pública y no expone datos: devuelve el nombre del sitio
 * y el índice de rutas.
 */
export async function expectRestApiAlive(request: APIRequestContext): Promise<void> {
  const response = await request.get('/wp-json/');

  expect(
    response.status(),
    `/wp-json/ respondió ${response.status()}: la REST API está bloqueada o rota`
  ).toBe(200);

  // Que conteste 200 con una página de error HTML es un modo de falla real
  // (plugins de caché sirviendo el home): tiene que ser el JSON del índice.
  const body: unknown = await response.json().catch(() => null);
  expect(body, '/wp-json/ no devolvió JSON válido').not.toBeNull();

  const index = body as Record<string, unknown>;
  expect(typeof index['name'], '/wp-json/ sin el nombre del sitio').toBe('string');
  expect(
    'routes' in index || 'namespaces' in index,
    '/wp-json/ sin índice de rutas: la API contesta pero no registra endpoints'
  ).toBe(true);
}
