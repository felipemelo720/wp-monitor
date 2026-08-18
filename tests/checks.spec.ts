import { test, expect } from '@playwright/test';
import { findPhpError } from '../checks/php.js';
import { classifyConsoleError } from '../checks/console.js';
import { blocksEverything } from '../checks/seo.js';
import type { KnownIssue } from '../sites/index.js';

// El detector de errores de PHP, probado contra HTML de mentira. Sin red.
//
// Es el check más importante del monitor y el único que nunca se ejercita en una
// corrida sana: si sus regex se rompen, todo sigue verde para siempre y nadie se
// entera hasta que un cliente avisa que la tienda tira "Fatal error".

test.describe('detección de errores de PHP', () => {
  test('encuentra un fatal y cita el fragmento útil', () => {
    const html = `<div class="site"><b>Fatal error</b>: Uncaught Error: Call to undefined function wc_get_cart_url() in /var/www/html/wp-content/plugins/x.php:12`;
    const found = findPhpError(html);
    expect(found?.label).toBe('fatal de PHP');
    // El fragmento tiene que nombrar la función muerta: eso es lo que dice qué
    // plugin se rompió. La etiqueta sola no alcanza para diagnosticar nada.
    expect(found?.excerpt).toContain('wc_get_cart_url');
  });

  test.describe('cada patrón detecta su rotura', () => {
    const cases: Array<[string, string]> = [
      ['error de sintaxis de PHP', 'Parse error: syntax error, unexpected token in /x.php'],
      ['excepción no capturada', 'Uncaught TypeError: foo(): Argument #1 must be of type int'],
      ['error crítico de WordPress', '<p>Ha ocurrido un error crítico en esta web.</p>'],
      ['sin conexión a la base de datos', '<h1>Error establishing a database connection</h1>'],
      ['include/require fallido', "Warning: require_once(/var/www/x.php): Failed to open stream"],
      ['headers ya enviados', 'Cannot modify header information - headers already sent by'],
    ];
    for (const [label, html] of cases) {
      test(label, () => {
        expect(findPhpError(html)?.label).toBe(label);
      });
    }
  });

  test('no se dispara con texto legítimo de la página', () => {
    // El riesgo de buscar substrings en HTML renderizado: una tienda de insumos
    // dentales no habla de PHP, pero una entrada de blog o un mensaje de ayuda sí
    // puede. Los patrones exigen el formato real que imprime PHP.
    const inocentes = [
      '<p>Si ves un error fatal en tu sitio, escribinos a soporte.</p>',
      '<p>Fatal Attraction, la película</p>',
      '<p>Este método está deprecated: usá el nuevo formulario.</p>',
      '<p>Notice: Undefined es un mensaje típico de PHP, no te preocupes.</p>',
      '<h2>Error 404: la página no existe</h2>',
    ];
    for (const html of inocentes) {
      expect(findPhpError(html), `falso positivo con: ${html}`).toBeNull();
    }
  });

  test('las deprecations de PHP no ensucian la señal', () => {
    // Decisión explícita: v1 fallaba con "Deprecated:" y "Notice: Undefined".
    // WordPress y medio ecosistema de plugins los escupen sin que nada se rompa,
    // y un monitor rojo permanente es un monitor que se ignora.
    expect(findPhpError('Deprecated: Creation of dynamic property is deprecated in /x.php')).toBeNull();
    expect(findPhpError('Notice: Undefined index: foo in /x.php on line 3')).toBeNull();
  });
});

test.describe('clasificación de errores de consola', () => {
  const mute: KnownIssue = {
    match: 'wp is not defined',
    expires: '2026-09-30',
    reason: 'bug preexistente aceptado',
  };

  test('el ruido de terceros no es rotura', () => {
    // Todos matchean también REAL_JS_BREAKAGE: el orden de las reglas es lo que
    // los salva, y por eso se prueba.
    expect(classifyConsoleError('gtag is not defined', [])).toBe('ignorado');
    expect(classifyConsoleError('fbq is not a function (connect.facebook.net)', [])).toBe(
      'ignorado'
    );
    expect(classifyConsoleError('GET https://challenges.cloudflare.com/x 401', [])).toBe('ignorado');
  });

  test('un conflicto de plugins es rotura', () => {
    expect(classifyConsoleError('Uncaught TypeError: $ is not a function', [])).toBe('rotura');
    expect(classifyConsoleError('pageerror: jQuery is not defined', [])).toBe('rotura');
    expect(classifyConsoleError("Cannot read properties of null (reading 'addEventListener')", [])).toBe(
      'rotura'
    );
  });

  test('el ruido que no delata nada tampoco alerta', () => {
    expect(classifyConsoleError('Failed to load resource: the server responded with 403', [])).toBe(
      'irrelevante'
    );
    expect(classifyConsoleError('play() failed because the user didn\'t interact', [])).toBe(
      'irrelevante'
    );
  });

  test('un knownIssue vigente silencia solo su error', () => {
    expect(classifyConsoleError('Uncaught ReferenceError: wp is not defined', [mute])).toBe(
      'silenciado'
    );
    // Y NO tapa otra rotura distinta del mismo tipo: ese era el riesgo de
    // silenciar por sitio entero como hacía v1.
    expect(classifyConsoleError('Uncaught ReferenceError: jQuery is not defined', [mute])).toBe(
      'rotura'
    );
  });

  test('sin silencios vigentes, el mismo error vuelve a fallar', () => {
    // Lo que pasa el 1 de octubre de 2026 con el knownIssue de surdent: activeMutes
    // deja de devolverlo y este error pasa a ser rotura otra vez.
    expect(classifyConsoleError('Uncaught ReferenceError: wp is not defined', [])).toBe('rotura');
  });
});

test.describe('parseo de robots.txt', () => {
  test('un robots.txt normal no bloquea', () => {
    expect(blocksEverything('User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php')).toBe(
      false
    );
  });

  test('bloquear bots de SEO no es bloquear el sitio', () => {
    // El falso positivo clásico: leer el archivo entero y encontrar "Disallow: /"
    // en el bloque de Ahrefs. Es una configuración sana y muy común.
    const txt = `User-agent: *\nDisallow: /wp-admin/\n\nUser-agent: AhrefsBot\nDisallow: /\n\nUser-agent: SemrushBot\nDisallow: /`;
    expect(blocksEverything(txt)).toBe(false);
  });

  test('detecta el bloqueo global aunque esté en el segundo bloque "*"', () => {
    // surdent tiene dos bloques "User-agent: *" (el suyo y el que inyecta Yoast):
    // mirar solo el primero deja pasar un bloqueo agregado al segundo.
    const txt = `User-agent: *\nDisallow: /wp-admin/\n\nUser-agent: *\nDisallow: /`;
    expect(blocksEverything(txt)).toBe(true);
  });

  test('detecta el bloqueo con espacios y mayúsculas raras', () => {
    expect(blocksEverything('user-agent: *\n  disallow:  / ')).toBe(true);
  });
});
