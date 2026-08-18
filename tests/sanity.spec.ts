import { test, expect } from '@playwright/test';

// Auto-chequeo del monitor, sin red. Responde una sola pregunta: ¿el entorno donde
// corre esto puede levantar un Chromium y ejecutar JS?
//
// Existe porque en el CT de Proxmox el modo de falla más caro no es un sitio caído
// sino un monitor que no arranca: sin --no-sandbox o con /dev/shm chico, TODOS los
// tests fallan y el correo de alerta dice "el sitio está roto" cuando el roto es el
// monitor. Con este archivo la diferencia se lee de una: si sanity falla, el
// problema es local; si sanity pasa y el resto no, el problema es el sitio.
//
// Sin red a propósito: tiene que dar verde aunque los sitios estén caídos.

test.describe('entorno', () => {
  test('Chromium levanta y ejecuta JS', async ({ page }) => {
    await page.setContent('<h1>wp-monitor</h1>');
    await expect(page.locator('h1')).toHaveText('wp-monitor');
    expect(await page.evaluate(() => 1 + 1)).toBe(2);
  });

  test('el user agent del monitor llega al navegador', async ({ page }) => {
    // Si esto falla, el `use` de la config no se está aplicando: cualquier otra
    // opción de ahí (args del contenedor incluidos) tampoco estaría aplicándose.
    await page.setContent('<p>x</p>');
    const ua = await page.evaluate(() => navigator.userAgent);
    expect(ua).toContain('wp-monitor/2.0');
  });

  test('la versión de Node es la soportada', () => {
    const major = Number(process.versions.node.split('.')[0]);
    expect(major, `Node ${process.versions.node}: se requiere >=20`).toBeGreaterThanOrEqual(20);
  });
});
