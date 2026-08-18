import { defineConfig, devices } from '@playwright/test';
import { sites } from './sites/index.js';

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
  projects: [
    // "base": todo lo que no toca la red — entorno y schema. Es dependencia de
    // los sitios, así que si el monitor está roto (Chromium que no levanta en el
    // LXC, config inválida) los projects de sitio NI SIQUIERA CORREN. La alerta
    // dice "el monitor está roto", que es distinto de "el sitio está caído":
    // en v1 los dos casos llegaban como el mismo correo rojo.
    {
      name: 'base',
      testMatch: ['sanity.spec.ts', 'config.spec.ts', 'checks.spec.ts'],
    },

    // Un project por sitio, generado desde la config. Agregar una tienda es
    // agregar un archivo en sites/ — acá no se toca nada.
    ...sites.map((site) => ({
      name: site.name,
      dependencies: ['base'],
      testIgnore: ['sanity.spec.ts', 'config.spec.ts', 'checks.spec.ts'],
      // El tag @nombre lo pone cada describe. Con la lookahead, "@clandent" no
      // matchea "@clandent-b2b": el filtro es exacto y los tests de los otros
      // sitios no aparecen ni como "skipped". Reemplaza al `--grep <nombre>` de
      // v1, que mezclaba sitios con nombres parecidos y falseaba el push a Kuma.
      grep: new RegExp(`@${site.name}(?![a-z0-9-])`),
      use: {
        // Con esto los tests piden rutas ('/tienda/'), no URLs completas: un
        // dominio mal escrito deja de ser algo que se pueda copiar y pegar mal.
        baseURL: site.baseURL,
      },
    })),
  ],
});
