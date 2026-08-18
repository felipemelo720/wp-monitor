import { expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import type { Site } from '../sites/schema.js';
import { wooSelectors, CLP_TOTAL, CLP_ZERO } from '../profiles/woo.js';
import { openSampleProduct, addToCart } from './woo.js';

/** Deja un producto en el carro y abre el checkout. */
async function goToCheckoutWithCart(page: Page, site: Site, testInfo: TestInfo): Promise<void> {
  await openSampleProduct(page, site, testInfo);
  await addToCart(page);
  await page.goto(site.woo!.checkoutPath, { waitUntil: 'domcontentloaded' });
}

/**
 * La pasarela de pago aparece en el checkout.
 *
 * ES el riesgo de estas dos tiendas: si un update desregistra el plugin de
 * Transbank, el cliente recorre todo el embudo y en el último paso no puede
 * pagar. No hay error de PHP, no hay 500, no hay nada roto a la vista — solo
 * deja de entrar plata, y se nota cuando alguien mira las ventas del día.
 */
export async function expectGatewayAvailable(
  page: Page,
  site: Site,
  testInfo: TestInfo
): Promise<void> {
  const gateway = new RegExp(site.plugins!.checkout!.gateway, 'i');
  await goToCheckoutWithCart(page, site, testInfo);

  await expect(
    page.locator('body'),
    `el checkout no ofrece la pasarela (/${gateway.source}/): nadie puede pagar`
  ).toContainText(gateway, { timeout: 15_000 });

  // Y el formulario de facturación renderiza: un checkout roto a medias se ve
  // como una página con el resumen del pedido y sin campos donde escribir.
  await expect(
    page.locator(wooSelectors.checkout.firstName).first(),
    'el checkout no renderiza el formulario de facturación'
  ).toBeVisible();
}

/**
 * Ejercita toda la maquinaria del checkout SIN crear pedidos.
 *
 * Lo que vigila, en orden:
 *  - el campo RUT del plugin fiscal chileno;
 *  - los selects región/comuna dependientes: si su JS muere, quedan vacíos y el
 *    checkout es incompletable;
 *  - update_order_review, el AJAX que recalcula totales. Su muerte es LA rotura
 *    clásica después de un update: la página se ve perfecta y nada responde;
 *  - que haya métodos de envío con precio (una zona de envío rota = no hay
 *    métodos = no hay venta);
 *  - el total en formato chileno y distinto de cero.
 *
 * Y al final aprieta "Realizar el pedido" con el formulario VACÍO. Eso recorre
 * nonce, sesión y validación completos, y por diseño NO puede crear un pedido:
 * Woo lo rechaza por campos requeridos. Si en vez de errores apareciera "pedido
 * recibido", el test explota a propósito — significaría que el checkout está
 * aceptando pedidos sin datos, que es peor que estar caído.
 */
export async function expectCheckoutMachineryWorks(
  page: Page,
  site: Site,
  testInfo: TestInfo
): Promise<void> {
  const config = site.plugins!.checkout!;
  const s = wooSelectors.checkout;

  await goToCheckoutWithCart(page, site, testInfo);

  if (config.rutField) {
    await expect(
      page.locator(s.rut),
      'no está el campo RUT: o nadie puede comprar, o los pedidos salen sin RUT'
    ).toBeVisible();
  }

  if (config.regionSelect) {
    // Chile tiene 16 regiones; menos de 10 opciones es un plugin a medio cargar.
    const regions = await page.locator(`${s.state} option`).count();
    expect(regions, 'el select de regiones está casi vacío').toBeGreaterThan(10);

    // 30s: este AJAX recalcula envíos e impuestos contra una tienda que ya está
    // atendiendo al resto de la corrida. Con 20s fallaba por lento, no por roto.
    const review = page.waitForResponse((r) => r.url().includes(wooSelectors.updateOrderReview), {
      timeout: 30_000,
    });
    // force: el <select> nativo está oculto por selectWoo (select2). selectOption
    // igual setea el valor y dispara el change que select2 y el checkout escuchan.
    await page.locator(s.state).selectOption({ index: 8 }, { force: true });

    const reviewResponse = await review;
    expect(reviewResponse.status(), 'update_order_review falló: el checkout no recalcula').toBe(200);

    await expect
      .poll(async () => page.locator(`${s.city} option`).count(), {
        timeout: 15_000,
        message: 'las comunas no se repoblaron al elegir región',
      })
      .toBeGreaterThan(1);
  }

  const shipping = await page.locator(s.shippingMethods).count();
  expect(shipping, 'no hay métodos de envío: la zona de envío está rota').toBeGreaterThan(0);

  const total = await page.locator(s.orderTotal).first().innerText();
  expect(total, `el total no tiene formato chileno: "${total}"`).toMatch(CLP_TOTAL);
  expect(total, 'el total del pedido es cero').not.toMatch(CLP_ZERO);

  await page.locator(s.placeOrder).click();

  // toBeAttached vía poll y no toBeVisible: el theme de clandent deja el
  // contenedor de avisos en display:none, pero los <li> igual llegan al DOM — eso
  // prueba que el POST corrió y que la validación respondió.
  await expect
    .poll(async () => page.locator(s.validationErrors).count(), {
      timeout: 25_000,
      message: 'el submit con el formulario vacío no devolvió errores de validación',
    })
    .toBeGreaterThan(0);

  expect(page.url(), '¡el checkout ACEPTÓ un pedido vacío!').not.toMatch(
    /order-received|pedido-recibido/
  );
}
