import { test } from '@playwright/test';
import { sites } from '../sites/index.js';
import { expectShopListsProducts, expectAddToCartWorks } from '../checks/woo.js';

// La tienda, aparte del smoke. Son los tests lentos (varias navegaciones y un
// ida y vuelta de AJAX por caso) y los que prueban lo único que de verdad
// importa: que se pueda comprar.
//
// Archivo propio para poder correr `--grep-invert` y sacarlos de una corrida
// rápida, sin tocar la config.

for (const site of sites) {
  if (!site.woo) continue;

  test.describe(site.name, { tag: `@${site.name}` }, () => {
    test('WooCommerce: la tienda lista productos', async ({ page }) => {
      await expectShopListsProducts(page, site);
    });

    test('WooCommerce: agregar al carro funciona', async ({ page }, testInfo) => {
      await expectAddToCartWorks(page, site, testInfo);
    });
  });
}
