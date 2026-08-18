import { expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import type { Site } from '../sites/schema.js';

/**
 * Rutas donde el noindex es CORRECTO: carrito, checkout y mi cuenta son páginas
 * de sesión, no contenido, y Woo las marca noindex por diseño.
 *
 * Se derivan de la config (woo.cartPath, woo.checkoutPath) en vez de adivinarlas
 * con una regex sobre el path como hacía v1: si mañana un sitio llama "/basket/"
 * a su carrito, ahí la regex fallaba y el monitor pedía indexar el carrito.
 */
function sessionPaths(site: Site): Set<string> {
  const paths = new Set<string>();
  if (site.woo) {
    paths.add(site.woo.cartPath);
    paths.add(site.woo.checkoutPath);
  }
  // La cuenta no está en el schema de Woo (existe también sin tienda), así que
  // acá sí va por nombre: son las dos formas que usa WordPress en es/en.
  for (const p of site.paths) {
    if (/^\/(?:mi-cuenta|my-account)\//.test(p)) paths.add(p);
  }
  return paths;
}

/**
 * noindex en una ruta pública = desaparecer de Google en días, sin ningún síntoma
 * visible. Lo mete un plugin de mantenimiento, un staging clonado a producción, o
 * alguien que dejó marcado "disuadir a los motores de búsqueda" en Ajustes.
 *
 * Es la rotura más cara del catálogo y la más silenciosa: el sitio se ve perfecto
 * durante dos semanas mientras el tráfico orgánico se muere.
 */
export async function expectIndexable(page: Page, path: string, site: Site): Promise<void> {
  if (sessionPaths(site).has(path)) return;

  const robots = await page
    .locator('meta[name="robots"], meta[name="googlebot"]')
    .evaluateAll((tags) => tags.map((t) => (t as HTMLMetaElement).content).join(','))
    .catch(() => '');

  expect(
    /noindex/i.test(robots),
    `${path}: está en noindex ("${robots}") — el sitio se cae de Google y nada más lo delata`
  ).toBe(false);
}

/**
 * ¿El robots.txt bloquea el sitio entero para los buscadores?
 *
 * Función pura porque el parseo es donde está el bug fácil, y probarlo contra red
 * es imposible. Dos sutilezas que un `txt.includes('Disallow: /')` no ve:
 *  - Un robots.txt sano bloquea bots de SEO (Ahrefs, Semrush) con su propio
 *    "Disallow: /". Mirar el archivo entero da falso positivo.
 *  - Puede haber VARIOS bloques "User-agent: *" (surdent tiene el suyo y el que
 *    inyecta Yoast). Mirar solo el primero deja pasar un bloqueo agregado al segundo.
 */
export function blocksEverything(robotsTxt: string): boolean {
  return robotsTxt
    .split(/^User-agent:/im)
    .filter((block) => /^\s*\*/.test(block))
    .flatMap((block) => block.split('\n'))
    .some((line) => /^\s*Disallow:\s*\/\s*$/i.test(line));
}

export async function expectRobotsAllowsCrawling(request: APIRequestContext): Promise<void> {
  const response = await request.get('/robots.txt');
  // Sin robots.txt no hay bloqueo: 404 es un estado válido y se rastrea todo.
  if (response.status() >= 400) return;

  expect(
    blocksEverything(await response.text()),
    'robots.txt bloquea el sitio entero con "Disallow: /" para todos los bots'
  ).toBe(false);
}

/**
 * El sitemap es el canario del SEO: si el plugin que lo genera muere, Google deja
 * de descubrir productos nuevos. No falla nada visible durante meses.
 *
 * Se prueban los nombres habituales: Yoast/RankMath usan sitemap_index.xml, el
 * nativo de WordPress es wp-sitemap.xml. Se siguen redirects, así que un 301 al
 * que valga cuenta.
 */
export async function expectSitemapAlive(request: APIRequestContext): Promise<void> {
  const candidates = ['/sitemap_index.xml', '/sitemap.xml', '/wp-sitemap.xml'];
  const tried: string[] = [];

  for (const candidate of candidates) {
    const response = await request.get(candidate);
    tried.push(`${candidate} → ${response.status()}`);
    if (response.status() < 400) {
      const body = await response.text();
      // Que sea XML de verdad: un plugin roto puede servir 200 con una página de
      // error HTML, o un archivo vacío.
      if (/<(?:urlset|sitemapindex)\b/i.test(body)) return;
      tried[tried.length - 1] += ' (no es un sitemap XML)';
    }
  }

  expect(tried.join(', '), 'ningún sitemap válido: ¿murió el plugin de SEO?').toBe('');
}
