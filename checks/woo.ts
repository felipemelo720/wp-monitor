import { expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import type { Site } from '../sites/schema.js';

/**
 * Selectores de grilla de productos. Son cuatro porque los cuatro conviven en el
 * ecosistema: el loop clásico de Woo (li.product), los bloques de Gutenberg (dos
 * generaciones), y JetEngine/Crocoblock, que es lo que usa surdent para armar su
 * tienda sin el loop nativo.
 */
const PRODUCT_GRID_ITEMS = [
  'li.product',
  '.wc-block-grid__product',
  '.wp-block-woocommerce-product-template li',
  '.jet-listing-grid__item',
].join(', ');

const PRODUCT_LINK = 'a[href*="/producto/"], a[href*="/product/"]';

/**
 * La tienda lista productos.
 *
 * Rotura real y silenciosa: un índice de búsqueda corrupto, una categoría
 * despublicada o un update que rompe el loop dejan /tienda/ cargando perfecto y
 * vacía. HTTP 200, sin errores de PHP, sin nada raro en consola — y sin nada que
 * vender.
 */
export async function expectShopListsProducts(page: Page, site: Site): Promise<void> {
  const shopPath = site.woo!.shopPath;
  await page.goto(shopPath, { waitUntil: 'domcontentloaded' });

  await expect(
    page.locator(PRODUCT_GRID_ITEMS).first(),
    `${shopPath}: la tienda cargó pero no muestra ni un producto`
  ).toBeVisible();
}

/**
 * Agrega un producto al carro y verifica que el carro deje de estar vacío.
 *
 * Se usa un producto SIMPLE declarado en la config y no "el primero de la
 * grilla": en surdent el primero es un producto variable, su botón no hace nada
 * hasta elegir variante, y el carro quedaba vacío sin que hubiera ninguna rotura
 * real. Ese fue el falso positivo más caro de v1.
 *
 * Si el producto declarado ya no existe (lo despublicaron), se cae al primero de
 * la tienda y se anota en el reporte: es una config que envejeció, no una tienda
 * rota, y el mensaje tiene que decir eso.
 */
export async function expectAddToCartWorks(
  page: Page,
  site: Site,
  testInfo: TestInfo
): Promise<void> {
  const woo = site.woo!;
  let usedFallback = false;

  let opened = false;
  if (woo.sampleProduct) {
    const response = await page.goto(woo.sampleProduct, { waitUntil: 'domcontentloaded' });
    opened = !!response && response.status() < 400;
    if (!opened) {
      usedFallback = true;
      testInfo.annotations.push({
        type: 'config vencida',
        description: `sampleProduct "${woo.sampleProduct}" ya no existe (HTTP ${response?.status() ?? 'sin respuesta'}): actualizalo en sites/${site.name}.ts`,
      });
    }
  }

  if (!opened) {
    usedFallback = true;
    await page.goto(woo.shopPath, { waitUntil: 'domcontentloaded' });
    await page.locator(PRODUCT_LINK).first().click();
    await page.waitForLoadState('domcontentloaded');
  }

  await page.locator('.single_add_to_cart_button').click();

  // toBeAttached y no toBeVisible: clandent oculta por CSS el enlace "Ver
  // carrito" — llega al DOM pero nunca se ve, y el test fallaba sin rotura real.
  // Que el nodo exista prueba que el ida y vuelta del add-to-cart ocurrió; que el
  // producto haya entrado de verdad lo prueba el carro, más abajo.
  await expect(
    page.locator('.woocommerce-message, .added_to_cart').first(),
    'el sitio no acusó recibo del producto agregado'
    // 30s: el add-to-cart es un ida y vuelta de AJAX contra una tienda que ya
    // está sirviendo el resto de la corrida. Con 20s daba flaky cuando los dos
    // sitios se monitorean a la vez.
  ).toBeAttached({ timeout: 30_000 });

  await page.goto(woo.cartPath, { waitUntil: 'domcontentloaded' });
  const cartText = await page.locator('body').innerText();

  const emptyCart = /(?:carro|carrito).{0,15}(?:está|esta) vac|your cart is (?:currently )?empty/i;
  expect(
    emptyCart.test(cartText),
    usedFallback
      ? `el carro quedó vacío usando el producto de reserva (sampleProduct de la config no sirve): puede ser un producto variable, no una rotura`
      : `el carro quedó vacío después de agregar ${woo.sampleProduct} — la tienda no puede vender`
  ).toBe(false);
}
