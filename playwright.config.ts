import { defineConfig, devices } from '@playwright/test';

// WPM_CONTAINER=1 va en el crontab del CT de Proxmox. Dos problemas del LXC
// unprivileged, ninguno presente en un desktop:
//  --no-sandbox: el sandbox de namespaces de Chromium no arranca ahí. El CT ya es
//    el límite de aislamiento y solo se visitan sitios propios, así que el costo
//    es aceptable; local sigue con sandbox.
//  --disable-dev-shm-usage: LXC deja /dev/shm en 64 MB. Chromium lo llena y muere
//    con "Target closed" de forma intermitente — el falso positivo más difícil de
//    diagnosticar, porque parece un sitio lento y no lo es.
// Si se olvida la variable, Chromium no levanta y fallan TODOS los tests de una:
// ruidoso a propósito, se ve en la primera corrida a mano y no en producción.
const inContainer = process.env.WPM_CONTAINER === '1';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 4,
  // 1 retry: mata falsos positivos por red, no esconde roturas reales (una rotura
  // real falla las dos veces). Más retries empiezan a tapar sitios intermitentes.
  retries: 1,
  // forbidOnly: un `test.only` olvidado deja el cron monitoreando UNA ruta y
  // reportando verde. En CI/cron eso es un monitor mudo, no un test que pasa.
  forbidOnly: !!process.env.CI || inContainer,
  // El HTML siempre: es donde se ve el trace y el antes/después cuando algo falla.
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices['Desktop Chrome'],
    ignoreHTTPSErrors: false, // cert vencido = rotura real, queremos que falle
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      args: inContainer ? ['--no-sandbox', '--disable-dev-shm-usage'] : [],
    },
    // UA propio: deja rastro identificable en los logs de acceso del sitio, para
    // no confundir el tráfico del monitor con un bot cualquiera.
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 wp-monitor/2.0',
  },
  // Los projects por sitio se generan en la fase 1C, desde sites/index.ts.
});
