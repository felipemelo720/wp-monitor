import type { Page } from '@playwright/test';

/** Mensajes de CDP que son un race transitorio, no una rotura del sitio. */
const CDP_RACE = /navigating and changing|Execution context was destroyed/;

/**
 * Reintenta una operación de CDP (content(), addStyleTag(), etc.) que puede tirar
 * "Unable to retrieve content because the page is navigating and changing the
 * content" o "Execution context was destroyed" con la página ya quieta: en
 * surdent.cl los widgets (reCAPTCHA, chat) siguen tocando el frame después de
 * 'load'. Reintentar siempre converge — no es una rotura del sitio.
 *
 * Sin esto el monitor tiene falsos positivos que además son irreproducibles a
 * mano, que es la peor combinación posible para el que recibe la alerta.
 */
async function withCdpRetry<T>(fn: () => Promise<T>, page: Page, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!CDP_RACE.test(message)) throw error;
      await page.waitForTimeout(300);
    }
  }
  throw lastError;
}

export function contentStable(page: Page, attempts = 5): Promise<string> {
  return withCdpRetry(() => page.content(), page, attempts);
}

export function addStyleTagStable(
  page: Page,
  opts: Parameters<Page['addStyleTag']>[0],
  attempts = 5
): Promise<unknown> {
  return withCdpRetry(() => page.addStyleTag(opts), page, attempts);
}
