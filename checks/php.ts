import { expect } from '@playwright/test';

/**
 * Huellas de PHP/WordPress roto en el HTML servido.
 *
 * Son regex y no substrings como en v1 por dos motivos:
 *  - exigen el formato real que imprime PHP ("Fatal error:", con dos puntos, y
 *    tolerando el <b> que mete display_errors en HTML), así que una página que
 *    mencione la frase en prosa no dispara la alarma;
 *  - cada una lleva su propia etiqueta en español, que es lo que termina en el
 *    correo de alerta a las 3 AM.
 *
 * Lo que v1 tenía y acá NO está, a propósito: "Deprecated:" y "Notice: Undefined".
 * WordPress, Woo y medio ecosistema de plugins escupen deprecations en cada
 * release de PHP sin que nada se rompa. Un monitor que se pone rojo por eso
 * enseña a ignorar sus alertas, que es la única forma de que un monitor falle
 * del todo.
 */
export const PHP_ERROR_PATTERNS: ReadonlyArray<{ label: string; re: RegExp }> = [
  { label: 'fatal de PHP', re: /(?:<b>)?Fatal error(?:<\/b>)?\s*:/i },
  { label: 'error de sintaxis de PHP', re: /(?:<b>)?Parse error(?:<\/b>)?\s*:/i },
  {
    label: 'excepción no capturada',
    re: /Uncaught (?:Error|TypeError|ValueError|ArgumentCountError|Exception)\b/,
  },
  {
    label: 'error crítico de WordPress',
    re: /There has been a critical error on this website|Ha ocurrido un error crítico en esta web/i,
  },
  {
    label: 'sin conexión a la base de datos',
    re: /Error establishing a database connection|Error al establecer una conexión con la base de datos/i,
  },
  {
    // El síntoma de un plugin a medio actualizar: falta un archivo que el código
    // sigue incluyendo. Suele romper solo una parte de la página.
    label: 'include/require fallido',
    re: /(?:<b>)?Warning(?:<\/b>)?\s*:\s*(?:require|include)(?:_once)?\s*\(/i,
  },
  {
    // Rompe redirecciones, cookies y sesión: el checkout deja de funcionar aunque
    // la página se vea entera.
    label: 'headers ya enviados',
    re: /Cannot modify header information|headers already sent/i,
  },
];

/** El primer error de PHP encontrado, o null. */
export function findPhpError(html: string): { label: string; excerpt: string } | null {
  for (const { label, re } of PHP_ERROR_PATTERNS) {
    const match = re.exec(html);
    if (match) {
      // Un pedazo del contexto: en el correo de alerta, "Fatal error: Uncaught
      // Error: Call to undefined function wc_get_cart_url()" dice qué plugin
      // murió. El nombre del patrón solo, no.
      const start = Math.max(0, match.index - 40);
      const excerpt = html.slice(start, match.index + 200).replace(/\s+/g, ' ').trim();
      return { label, excerpt };
    }
  }
  return null;
}

/** Falla nombrando el error y citando el fragmento donde aparece. */
export function expectNoPhpErrors(html: string, where: string): void {
  const found = findPhpError(html);
  expect(found === null ? '' : `${found.label} en ${where}: …${found.excerpt}…`).toBe('');
}
