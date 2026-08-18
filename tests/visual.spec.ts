import { test, expect } from '@playwright/test';
import { sites } from '../sites/index.js';
import { addStyleTagStable } from '../lib/page.js';

// Regresión visual: compara contra el baseline commiteado.
// Primera corrida (o tras un cambio de diseño intencional):
//   npm run visual:update
//
// Corre en su PROPIO project (ver playwright.config.ts), nunca junto al smoke:
// un diff de layout del 2% no es "sitio caído", y mezclar las dos señales
// degradaría la que ya funciona bien. En check.sh usa su propio lock y su propio
// monitor de Kuma.
//
// Por defecto captura SOLO el viewport (above the fold), no la página completa.
// Una tienda entera mide 20.000+ px de alto, y cualquier producto nuevo o cambio
// de precio la haría fallar. El viewport tiene header, nav, hero y primeros
// productos: ahí se ve el 90% de las roturas de layout, y es estable.

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 }, // los updates de theme rompen más acá
] as const;

for (const site of sites) {
  test.describe(site.name, { tag: `@${site.name}` }, () => {
    for (const vp of VIEWPORTS) {
      for (const path of site.paths) {
        test(`${vp.name} ${path} se ve igual que el baseline`, async ({ page }) => {
          await page.setViewportSize({ width: vp.width, height: vp.height });

          // Auto-check: DEMO_BREAK=1 bloquea el CSS del sitio, simulando un update
          // que desregistra el handle del theme. Si con esto el test NO falla, la
          // regresión visual está ciega y hay que revisar los baselines.
          if (process.env.DEMO_BREAK) await page.route(/\.css(?:\?|$)/, (r) => r.abort());

          // 'load', no 'networkidle': los widgets de chat y Turnstile hacen
          // polling eterno y networkidle nunca se cumple. toHaveScreenshot ya
          // reintenta hasta que dos capturas seguidas coinciden — el settling lo
          // cubre él.
          await page.goto(path, { waitUntil: 'load' });

          await addStyleTagStable(page, {
            content: `*, *::before, *::after { animation: none !important; transition: none !important; }`,
          });

          await expect(page).toHaveScreenshot(`${site.name}-${vp.name}${path.replace(/\//g, '_')}.png`, {
            maxDiffPixelRatio: 0.02, // 2%: absorbe banners rotativos y precios
            animations: 'disabled',
          });
        });
      }
    }
  });
}
