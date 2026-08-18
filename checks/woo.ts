import { expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import type { Site } from '../sites/schema.js';
import { wooSelectors, CLP_PRICE } from '../profiles/woo.js';

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
 * Abre una ficha de producto comprable.
 *
 * Se usa un producto SIMPLE declarado en la config y no "el primero de la
 * grilla": en surdent el primero es un producto variable, su botón no hace nada
 * hasta elegir variante, y el carro quedaba vacío sin que hubiera ninguna rotura
 * real. Ese fue el falso positivo más caro de v1.
 *
 * Si el producto declarado ya no existe (lo despublicaron), se cae al primero de
 * la tienda y se anota en el reporte: es una config que envejeció, no una tienda
 * rota, y el mensaje tiene que decir eso.
 *
 * @returns true si hubo que usar el producto de reserva.
 */
export async function openSampleProduct(
  page: Page,
  site: Site,
  testInfo: TestInfo
): Promise<boolean> {
  const woo = site.woo!;

  if (woo.sampleProduct) {
    const response = await page.goto(woo.sampleProduct, { waitUntil: 'domcontentloaded' });
    if (response && response.status() < 400) return false;

    testInfo.annotations.push({
      type: 'config vencida',
      description: `sampleProduct "${woo.sampleProduct}" ya no existe (HTTP ${response?.status() ?? 'sin respuesta'}): actualizalo en sites/${site.name}.ts`,
    });
  }

  await page.goto(woo.shopPath, { waitUntil: 'domcontentloaded' });
  await page.locator(PRODUCT_LINK).first().click();
  await page.waitForLoadState('domcontentloaded');
  return true;
}

/**
 * Agrega al carro el producto de la ficha abierta y espera el acuse de recibo.
 *
 * toBeAttached y no toBeVisible: clandent oculta por CSS el enlace "Ver carrito"
 * — llega al DOM pero nunca se ve, y el test fallaba sin rotura real. Que el nodo
 * exista prueba que el ida y vuelta del add-to-cart ocurrió; que el producto haya
 * entrado de verdad lo prueba el carro.
 */
export async function addToCart(page: Page): Promise<void> {
  await page.locator(wooSelectors.addToCartButton).click();

  // 30s: es AJAX contra una tienda que ya está sirviendo el resto de la corrida.
  // Con 20s daba flaky cuando los dos sitios se monitorean a la vez.
  await expect(
    page.locator(wooSelectors.addedToCartAck).first(),
    'el sitio no acusó recibo del producto agregado'
  ).toBeAttached({ timeout: 30_000 });
}

/** El carro deja de estar vacío después de agregar un producto. */
export async function expectAddToCartWorks(
  page: Page,
  site: Site,
  testInfo: TestInfo
): Promise<void> {
  const usedFallback = await openSampleProduct(page, site, testInfo);
  await addToCart(page);

  await page.goto(site.woo!.cartPath, { waitUntil: 'domcontentloaded' });
  const cartText = await page.locator('body').innerText();

  const emptyCart = /(?:carro|carrito).{0,15}(?:está|esta) vac|your cart is (?:currently )?empty/i;
  expect(
    emptyCart.test(cartText),
    usedFallback
      ? 'el carro quedó vacío usando el producto de reserva (el sampleProduct de la config no sirve): puede ser un producto variable, no una rotura'
      : `el carro quedó vacío después de agregar ${site.woo!.sampleProduct} — la tienda no puede vender`
  ).toBe(false);
}

/**
 * La ficha de producto muestra precio en pesos y el botón de compra habilitado.
 *
 * Un update de Woo que rompa la configuración de moneda muestra "$0" o formato
 * gringo, y la tienda sigue viéndose entera mientras vende a precio equivocado.
 */
export async function expectProductPageSellable(
  page: Page,
  site: Site,
  testInfo: TestInfo
): Promise<void> {
  await openSampleProduct(page, site, testInfo);

  const price = page.locator(wooSelectors.price).first();
  await expect(price, 'la ficha no muestra precio').toBeVisible();
  await expect(price, 'el precio no tiene formato chileno').toContainText(CLP_PRICE);

  const button = page.locator(wooSelectors.addToCartButton);
  await expect(button, 'la ficha no tiene botón de compra').toBeVisible();
  await expect(button, 'el botón de compra está deshabilitado').toBeEnabled();
}
