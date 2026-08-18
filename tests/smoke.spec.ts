import { test } from '@playwright/test';
import { sites } from '../sites/index.js';
import { gotoOk, expectRenderedContent } from '../checks/http.js';
import { expectNoPhpErrors } from '../checks/php.js';
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
      test(`${path} responde y renderiza`, async ({ page }) => {
        await gotoOk(page, path); // baseURL viene del project
        expectNoPhpErrors(await contentStable(page), path);
        await expectRenderedContent(page, path);
      });
    }

    test('el home no imprime errores de PHP antes del HTML', async ({ request }) => {
      // Sin navegador: pide el HTML crudo. Pilla los warnings que el theme imprime
      // arriba de todo y que el JS del sitio después tapa o reemplaza — en el DOM
      // renderizado ya no están, en la respuesta sí.
      const response = await request.get('/');
      expectNoPhpErrors(await response.text(), '/ (respuesta cruda)');
    });
  });
}
