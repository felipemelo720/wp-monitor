import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { KnownIssue } from '../sites/schema.js';

/**
 * Ruido de terceros. No es rotura del sitio y aparece en cualquier sitio vivo:
 * bloqueadores de publicidad, analytics que fallan, chats que reconectan.
 * Se aplica tanto a errores de consola como a URLs de requests fallidos.
 */
export const IGNORE_CONSOLE: readonly RegExp[] = [
  /google-analytics|googletagmanager|gtag|analytics\.js|doubleclick/i,
  /facebook\.net|fbevents|connect\.facebook/i,
  /hotjar|clarity\.ms|tawk\.to|crisp\.chat|intercom|recaptcha/i,
  /ERR_BLOCKED_BY_CLIENT|ERR_NETWORK_CHANGED/i,
  /fonts\.(googleapis|gstatic)/i,
  // Turnstile y el bot-management de Cloudflare contestan 401 por diseño mientras
  // resuelven el desafío: es el funcionamiento normal, no un recurso roto.
  /challenges\.cloudflare\.com|\/cdn-cgi\//i,
];

/**
 * Los únicos errores de JS que delatan un conflicto de plugins real: jQuery
 * migrado, un script desregistrado, un handle renombrado por un update.
 *
 * El resto — promesas rechazadas sin stack, autoplay de video bloqueado, errores
 * de extensiones del navegador — es ruido. Alertar por todo es no alertar.
 */
export const REAL_JS_BREAKAGE: readonly RegExp[] = [
  /is not a function/i,
  /is not defined/i,
  /ReferenceError/i,
  /Cannot read propert(?:y|ies) of (?:null|undefined)/i,
  /\$ is not|jQuery is not/i,
  /Unexpected token/i,
  /SyntaxError/i,
];

export type ConsoleVerdict =
  /** Ruido de terceros conocido. */
  | 'ignorado'
  /** Bug de producción aceptado y todavía vigente (ver knownIssues). */
  | 'silenciado'
  /** Rotura real: falla el test. */
  | 'rotura'
  /** Error de JS que no matchea ningún patrón de rotura conocida. */
  | 'irrelevante';

/**
 * Decide qué hacer con un error de consola. Función pura: es la que se prueba en
 * checks.spec.ts, porque el orden de las reglas importa y es fácil romperlo sin
 * que nada se ponga rojo.
 *
 * El orden es: ruido de terceros > silencio aceptado > rotura real. Un
 * knownIssue solo puede silenciar algo que de otro modo fallaría.
 */
export function classifyConsoleError(text: string, mutes: readonly KnownIssue[]): ConsoleVerdict {
  if (IGNORE_CONSOLE.some((re) => re.test(text))) return 'ignorado';
  if (mutes.some((m) => text.includes(m.match))) return 'silenciado';
  if (REAL_JS_BREAKAGE.some((re) => re.test(text))) return 'rotura';
  return 'irrelevante';
}

export interface ConsoleWatcher {
  /** Errores de JS clasificados como rotura real. */
  readonly breakages: string[];
  /** Recursos del sitio que contestaron 4xx/5xx. */
  readonly badRequests: string[];
}

/**
 * Engancha los listeners ANTES de navegar: los errores que tira un script en el
 * <head> ocurren durante el goto, y si se suscribe después ya se perdieron.
 *
 * `mutes` son los knownIssues vigentes PARA ESTA RUTA (ver activeMutes). Un
 * silencio vencido simplemente no llega acá, y el error vuelve a fallar el test.
 */
export function watchConsole(page: Page, mutes: readonly KnownIssue[] = []): ConsoleWatcher {
  const breakages: string[] = [];
  const badRequests: string[] = [];

  const record = (text: string) => {
    if (classifyConsoleError(text, mutes) === 'rotura') breakages.push(text);
  };

  page.on('console', (msg) => {
    if (msg.type() === 'error') record(msg.text());
  });
  // pageerror son las excepciones no capturadas: el conflicto de plugins que
  // corta la ejecución del script a la mitad aparece acá, no en console.
  page.on('pageerror', (error) => record(`pageerror: ${error.message}`));

  page.on('response', (response) => {
    const url = response.url();
    if (response.status() >= 400 && !IGNORE_CONSOLE.some((re) => re.test(url))) {
      badRequests.push(`${response.status()} ${url}`);
    }
  });

  return { breakages, badRequests };
}

/**
 * Se llama al final del test, después de 'load': un CSS o un JS que devuelve 404
 * puede tardar más que el DOM, y los errores de consola siguen llegando.
 */
export async function expectNoBreakage(
  page: Page,
  path: string,
  watcher: ConsoleWatcher
): Promise<void> {
  // El 'load' puede no llegar nunca si un widget hace polling eterno: por eso el
  // catch. Lo que interesa es haberle dado su ventana a los recursos lentos.
  await page.waitForLoadState('load').catch(() => {});

  expect(watcher.badRequests, `${path}: recursos del sitio con 4xx/5xx`).toEqual([]);
  expect(watcher.breakages, `${path}: errores de JS que delatan conflicto de plugins`).toEqual([]);
}
