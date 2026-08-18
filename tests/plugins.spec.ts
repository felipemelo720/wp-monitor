import { test } from '@playwright/test';
import { sites } from '../sites/index.js';
import { expectSearchIndexAlive, expectSearchBoxSuggests } from '../checks/search.js';
import { expectContactFormUsable } from '../checks/forms.js';
import { expectGatewayAvailable, expectCheckoutMachineryWorks } from '../checks/checkout.js';
import { expectProductPageSellable } from '../checks/woo.js';

// Los tests que dependen de los plugins de cada tienda: buscador, ficha de
// producto, pasarela de pago, checkout y formulario de contacto.
//
// Acá está el cambio grande contra v1: allá esto eran clandent.spec.js y
// surdent.spec.js, 90% idénticos. Lo que de verdad cambiaba entre sitios eran
// datos — qué término buscar, qué captcha, en qué ruta está el formulario — pero
// como estaban duplicados, cada check nuevo había que escribirlo dos veces y las
// correcciones se aplicaban a uno solo. Los dos archivos ya habían divergido.
//
// Ahora el sitio declara qué plugins tiene (sites/*.ts, campo `plugins`) y esto
// arma los tests. Una tienda nueva con el mismo stack no agrega ni una línea de
// test.

for (const site of sites) {
  const plugins = site.plugins;
  if (!plugins) continue;

  test.describe(site.name, { tag: `@${site.name}` }, () => {
    if (plugins.fibosearch) {
      const { query } = plugins.fibosearch;

      test('buscador: el índice devuelve productos', async ({ request }) => {
        await expectSearchIndexAlive(request, query);
      });

      test('buscador: la caja del header sugiere', async ({ page }) => {
        await expectSearchBoxSuggests(page, query);
      });
    }

    if (site.woo) {
      test('ficha de producto: precio en pesos y botón de compra', async ({ page }, testInfo) => {
        await expectProductPageSellable(page, site, testInfo);
      });
    }

    if (plugins.checkout) {
      test('checkout: la pasarela de pago está disponible', async ({ page }, testInfo) => {
        await expectGatewayAvailable(page, site, testInfo);
      });

      test('checkout: RUT, regiones, envío, totales y validación', async ({ page }, testInfo) => {
        // 90s: son cinco navegaciones y tres idas y vueltas de AJAX contra una
        // tienda compartida. Con el timeout global de 45s daba flaky por lento,
        // no por roto.
        test.setTimeout(90_000);
        await expectCheckoutMachineryWorks(page, site, testInfo);
      });
    }

    if (plugins.contactForm) {
      const { path, captcha } = plugins.contactForm;

      test('formulario de contacto: campos y protección', async ({ page }) => {
        await expectContactFormUsable(page, path, captcha);
      });
    }
  });
}
