/**
 * Selectores de los plugins de terceros que usan estas tiendas.
 * Un update de cualquiera de ellos puede romper la funcionalidad SIN tirar error
 * de PHP ni descuadrar el layout: ni el smoke ni la regresión visual los ven.
 */

/** FiboSearch (dgwt-wcas): el buscador de productos del header. */
export const fibosearch = {
  /**
   * `:visible` obligatorio: surdent tiene DOS inputs con esta clase en el DOM
   * (el del header y uno oculto de un layout alternativo). Sin filtrar,
   * `.first()` puede agarrar el escondido y el test falla sin rotura real.
   */
  input: '.dgwt-wcas-search-input:visible',
  /**
   * `:visible` por el mismo motivo que el input: clandent tiene un panel de
   * resultados duplicado y oculto (el del layout alternativo del header). Las
   * sugerencias se renderizan en LOS DOS, así que `.first()` sin filtrar agarra
   * una que existe, tiene el producto correcto y nunca se muestra — el test
   * fallaba con "no mostró sugerencias" mientras el usuario las veía perfecto.
   */
  suggestion: '.dgwt-wcas-suggestion:visible',
  /** Fragmento del AJAX, para esperar la respuesta en vez de dormir N segundos. */
  ajaxUrlPart: 'dgwt_wcas_ajax_search',
  /** El mismo endpoint que usa el buscador, pedido directo: es determinista. */
  endpoint: (query: string) =>
    `/?wc-ajax=dgwt_wcas_ajax_search&s=${encodeURIComponent(query)}`,
} as const;

/** Formularios de Elementor Pro. */
export const elementorForm = {
  form: '.elementor-form',
  email: 'input[type="email"], input[name*="email"]',
  submit: 'button[type="submit"]',
} as const;

/**
 * Captchas. Solo se verifica que el widget esté presente — no se resuelve ni se
 * envía nada. Si el plugin del captcha muere, el formulario queda o bloqueado
 * (nadie puede escribir) o sin protección (spam hasta que alguien se harte).
 */
export const captchaSelectors = {
  turnstile: '.cf-turnstile, iframe[src*="challenges.cloudflare.com"]',
  recaptcha: '.g-recaptcha, iframe[src*="recaptcha"], script[src*="recaptcha"]',
} as const;

export type CaptchaKind = keyof typeof captchaSelectors;
