import { test, expect } from '@playwright/test';
import { sites, SiteListSchema, activeMutes, isMuteActive } from '../sites/index.js';
import type { KnownIssue, SiteInput } from '../sites/index.js';

// Tests del schema, no de la config. Sin red: milisegundos.
//
// v1 validaba la config con tests. Acá eso lo hace el schema al importar, así que
// lo que queda por probar es el schema mismo: que de verdad rechace lo que dice
// rechazar. Un guardrail que no se prueba es un guardrail que un día deja de
// serlo — y su modo de falla es silencioso, porque todo sigue en verde.

const base: SiteInput = {
  name: 'demo',
  baseURL: 'https://demo.cl',
  paths: ['/', '/tienda/'],
  mustContain: { '/': 'Inicio' },
};

/** Aplica un cambio sobre la config válida y devuelve los mensajes de error. */
function errorsFor(...overrides: Array<Partial<SiteInput>>): string[] {
  const result = SiteListSchema.safeParse(overrides.map((o) => ({ ...base, ...o })));
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

test.describe('schema de sitios', () => {
  test('la config real de producción es válida', () => {
    // Redundante con el import (que ya habría explotado), y a propósito: deja el
    // fallo con nombre propio en el reporte en vez de un stack de import.
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.map((s) => s.name)).toEqual(['clandent', 'surdent']);
  });

  test('acepta la config mínima', () => {
    expect(errorsFor({})).toEqual([]);
  });

  test('rechaza baseURL con barra final o con ruta', () => {
    expect(errorsFor({ baseURL: 'https://demo.cl/' })).not.toEqual([]);
    expect(errorsFor({ baseURL: 'https://demo.cl/sub' })).not.toEqual([]);
    expect(errorsFor({ baseURL: 'http://demo.cl' })).not.toEqual([]);
  });

  test('rechaza rutas sin barra final', () => {
    // El caso real: "/tienda" y "/tienda/" son la misma página para el usuario,
    // pero WordPress redirige de una a otra y el path medido deja de ser el pedido.
    const errors = errorsFor({ paths: ['/', '/tienda'], mustContain: { '/': 'Inicio' } });
    expect(errors.join(' ')).toContain('WordPress redirige');
  });

  test('rechaza rutas repetidas', () => {
    expect(errorsFor({ paths: ['/', '/', '/tienda/'] }).join(' ')).toContain('repetidas');
  });

  test('rechaza mustContain que apunte a una ruta inexistente', () => {
    // EL bug de v1: la key con typo no rompía nada, ese contenido simplemente
    // dejaba de vigilarse y el smoke seguía en verde.
    const errors = errorsFor({ mustContain: { '/': 'Inicio', '/tinda/': 'Tienda' } });
    expect(errors.join(' ')).toContain('no está en paths');
  });

  test('exige mustContain en el home', () => {
    expect(errorsFor({ mustContain: { '/tienda/': 'Tienda' } }).join(' ')).toContain(
      'el home tiene que tener mustContain'
    );
  });

  test('rechaza keys desconocidas', () => {
    // Un "mustContains" con S de más sería una config que no hace absolutamente
    // nada, sin ninguna señal de que no la hace.
    const bad = { ...base, mustContains: { '/': 'Inicio' } };
    expect(SiteListSchema.safeParse([bad]).success).toBe(false);
  });

  test('exige que las rutas de Woo estén en paths', () => {
    const errors = errorsFor({
      woo: { shopPath: '/shop/', cartPath: '/carrito/', checkoutPath: '/finalizar-compra/' },
    });
    expect(errors.join(' ')).toContain('el smoke no lo recorrería');
  });

  test('rechaza silencios genéricos', () => {
    // "not defined" (11 chars) taparía cualquier ReferenceError del sitio.
    const short = [{ match: 'Error', expires: '2027-01-01', reason: 'porque sí, da igual' }];
    expect(errorsFor({ knownIssues: short }).join(' ')).toContain('demasiado corto');
  });

  test('rechaza silencios sin fecha de vencimiento o mal formada', () => {
    const noExpiry = [{ match: 'wp is not defined', reason: 'bug preexistente aceptado' }];
    expect(SiteListSchema.safeParse([{ ...base, knownIssues: noExpiry }]).success).toBe(false);
    const badDate = [
      { match: 'wp is not defined', expires: '30-09-2026', reason: 'bug preexistente aceptado' },
    ];
    expect(errorsFor({ knownIssues: badDate }).join(' ')).toContain('YYYY-MM-DD');
  });

  test('rechaza nombres de sitio duplicados', () => {
    // Cada nombre es un project de Playwright y un lock del cron.
    expect(errorsFor({}, {}).join(' ')).toContain('nombre duplicado');
  });
});

test.describe('vigencia de los silencios', () => {
  const issue: KnownIssue = {
    match: 'wp is not defined',
    expires: '2026-09-30',
    reason: 'bug preexistente aceptado',
  };

  test('el silencio cubre todo el día de vencimiento y no el siguiente', () => {
    expect(isMuteActive(issue, new Date('2026-09-30T23:00:00Z'))).toBe(true);
    expect(isMuteActive(issue, new Date('2026-10-01T00:30:00Z'))).toBe(false);
  });

  test('vencido, el error vuelve a fallar el smoke', () => {
    const site = { ...base, knownIssues: [issue] };
    const parsed = SiteListSchema.parse([site])[0];
    expect(activeMutes(parsed, '/', new Date('2026-08-01'))).toHaveLength(1);
    expect(activeMutes(parsed, '/', new Date('2027-01-01'))).toHaveLength(0);
  });

  test('un silencio con paths no se derrama a las otras rutas', () => {
    // v1 silenciaba por sitio: el error del home tapaba el mismo error en el
    // checkout, donde sí sería una rotura nueva.
    const site = { ...base, knownIssues: [{ ...issue, paths: ['/'] as [string] }] };
    const parsed = SiteListSchema.parse([site])[0];
    const now = new Date('2026-08-01');
    expect(activeMutes(parsed, '/', now)).toHaveLength(1);
    expect(activeMutes(parsed, '/tienda/', now)).toHaveLength(0);
  });
});
