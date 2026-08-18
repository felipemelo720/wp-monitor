import type { Page } from '@playwright/test';

/**
 * page.content() puede tirar "Unable to retrieve content because the page is
 * navigating and changing the content" con la página ya quieta: en surdent.cl los
 * widgets (reCAPTCHA, chat) siguen tocando el frame después de 'load'. Es un error
 * transitorio de CDP, no una rotura del sitio — reintentar siempre converge.
 *
 * Sin esto el monitor tiene falsos positivos que además son irreproducibles a
 * mano, que es la peor combinación posible para el que recibe la alerta.
 */
export async function contentStable(page: Page, attempts = 5): Promise<string> {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await page.content();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/navigating and changing|Execution context was destroyed/.test(message)) throw error;
      await page.waitForTimeout(300);
    }
  }
  throw lastError;
}
