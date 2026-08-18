import { test } from '@playwright/test';
import { sites, activeMutes } from '../sites/index.js';
import { gotoOk, expectRenderedContent } from '../checks/http.js';
import { expectNoPhpErrors } from '../checks/php.js';
import { expectContains } from '../checks/content.js';
import { watchConsole, expectNoBreakage } from '../checks/console.js';
import { expectIndexable, expectRobotsAllowsCrawling, expectSitemapAlive } from '../checks/seo.js';
import { expectWithinBudget } from '../checks/perf.js';
import { expectCertNotExpiringSoon } from '../checks/tls.js';
import { expectRestApiAlive } from '../checks/rest.js';
import { expectLoginUsable } from '../checks/wp.js';
import { contentStable } from '../lib/page.js';

// Smoke por ruta. Un test por ruta y no uno por sitio: cuando algo falla, el
// nombre del test ya dice cuál ruta se rompió, sin abrir el reporte.
//
// El filtrado por sitio lo hace el tag @<nombre> junto con el `grep` del project
// (ver playwright.config.ts): `--project=clandent` no ejecuta ni lista los tests
// de surdent. v1 usaba `--grep <nombre>`, que hacía match por substring y obligaba
// a prohibir nombres que se contuvieran entre sí.
//
// Ojo: los sitios se recorren en el módulo, así que todos los tests existen en el
// árbol; es el project el que decide cuáles corren. La configuración se valida al
// importar sites/, o sea antes de que exista el primer test.

for (const site of sites) {
  test.describe(site.name, { tag: `@${site.name}` }, () => {
    for (const path of site.paths) {
      test(`${path} responde y renderiza`, async ({ page }, testInfo) => {
        // Antes de navegar: los errores de un script del <head> ocurren durante
        // el goto y no hay forma de recuperarlos después.
        const watcher = watchConsole(page, activeMutes(site, path));

        const response = await gotoOk(page, path); // baseURL viene del project
        expectWithinBudget(response, path, site.ttfbBudgetMs, testInfo);
        expectNoPhpErrors(await contentStable(page), path);
        await expectRenderedContent(page, path);

        const needle = site.mustContain?.[path];
        if (needle) await expectContains(page, path, needle);

        await expectIndexable(page, path, site);

        // Al final: los recursos lentos y los errores tardíos ya tuvieron su
        // ventana, y así el reporte los junta todos en vez de cortar en el primero.
        await expectNoBreakage(page, path, watcher);
      });
    }

    test('el home no imprime errores de PHP antes del HTML', async ({ request }) => {
      // Sin navegador: pide el HTML crudo. Pilla los warnings que el theme imprime
      // arriba de todo y que el JS del sitio después tapa o reemplaza — en el DOM
      // renderizado ya no están, en la respuesta sí.
      const response = await request.get('/');
      expectNoPhpErrors(await response.text(), '/ (respuesta cruda)');
    });

    test('el sitio sigue siendo rastreable por Google', async ({ request }) => {
      // Dos formas de desaparecer de Google que no se ven en ninguna página:
      // el robots.txt que bloquea todo, y el sitemap que dejó de generarse.
      await expectRobotsAllowsCrawling(request);
      await expectSitemapAlive(request);
    });

    test('el certificado TLS no está por vencer', async () => {
      await expectCertNotExpiringSoon(site.baseURL);
    });

    test('la REST API de WordPress responde', async ({ request }) => {
      await expectRestApiAlive(request);
    });

    test('el login de WordPress no está caído', async ({ page }) => {
      await expectLoginUsable(page, site);
    });
  });
}
