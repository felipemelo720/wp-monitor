import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { elementorForm, captchaSelectors } from '../profiles/plugins.js';
import type { CaptchaKind } from '../profiles/plugins.js';

/**
 * El formulario de contacto está entero y protegido.
 *
 * Elementor Pro lo renderiza y el captcha lo protege. Si cualquiera de los dos se
 * rompe con un update, los clientes dejan de poder escribir y nadie se entera:
 * no hay error, no hay 500, simplemente deja de llegar correo. Se detecta
 * semanas después, cuando alguien pregunta por qué nadie consulta.
 *
 * Solo se verifica presencia. NO se envía nada: mandar un formulario de verdad
 * cada seis horas llena la casilla del cliente de mensajes de prueba.
 */
export async function expectContactFormUsable(
  page: Page,
  path: string,
  captcha?: CaptchaKind
): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });

  const form = page.locator(elementorForm.form).first();
  await expect(form, `${path}: no hay formulario de Elementor`).toBeVisible();
  await expect(
    form.locator(elementorForm.email).first(),
    `${path}: el formulario no tiene campo de email`
  ).toBeVisible();
  await expect(
    form.locator(elementorForm.submit),
    `${path}: el formulario no tiene botón de envío`
  ).toBeVisible();

  if (captcha) {
    // toBeAttached: el widget puede estar en un iframe que todavía no pintó, o
    // renderizarse fuera del viewport. Lo que importa es que el plugin lo inyectó.
    await expect(
      page.locator(captchaSelectors[captcha]).first(),
      `${path}: falta el widget de ${captcha} — el formulario quedó sin protección o bloqueado`
    ).toBeAttached({ timeout: 15_000 });
  }
}
