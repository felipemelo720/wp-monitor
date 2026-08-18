# wp-monitor

Monitor E2E de sitios WordPress/WooCommerce, pensado para correr por cron. Sin
agente en el servidor: el cron dispara desde afuera (un CT LXC de Proxmox).

Stack: Playwright + Chromium, TypeScript ESM, zod para la config.

## Estructura

```
sites/           config de cada sitio, validada por schema.ts al importar
checks/          la lógica de cada verificación, reusable y testeada
profiles/        selectores de plugins (Woo, FiboSearch, Elementor), centralizados
tests/
  sanity.spec.ts   entorno arranca, sin red
  config.spec.ts   prueba el schema de sites/
  checks.spec.ts   prueba las funciones puras de checks/, sin red
  smoke.spec.ts    por ruta: HTTP, PHP, contenido, consola, SEO, TLS, REST, login
  woo.spec.ts      tienda lista productos, agregar al carro
  plugins.spec.ts  búsqueda, checkout profundo, formulario de contacto
  visual.spec.ts   regresión pixel vs. baselines commiteados
bin/
  check.sh         orquestador para cron: lock + notificaciones
  notify.ts        lee el reporte JSON y arma la alerta (Kuma + correo)
```

## Agregar un sitio

1. Crear `sites/<nombre>.ts` con `satisfies SiteInput` (ver `clandent.ts` como
   ejemplo). TypeScript avisa campos faltantes en el editor; el schema explota
   con el mensaje exacto si algo queda mal formado.
2. Agregarlo al array en `sites/index.ts`.
3. Si comparte stack (WooCommerce + FiboSearch + Webpay + Elementor), declarar
   `plugins: { ... }` — `tests/plugins.spec.ts` arma los tests solo. Cero
   archivos nuevos.
4. `npm run visual:update -- --project=<nombre>-visual` para generar los
   baselines la primera vez.

## Comandos

```bash
npm test                              # smoke + woo + plugins de TODOS los sitios
npx playwright test --project=clandent   # solo ese sitio
npx playwright test --project=base       # solo entorno + schema, sin red
npm run visual                        # regresión visual de todos los sitios
npm run visual:update                 # regenera baselines (tras un rediseño)
npm run typecheck                     # TS sin correr nada
npm run report                        # abre el último reporte HTML
```

## Cron por sitio

Un `check.sh` por sitio, con su propio `KUMA_PUSH`: un push combinado mezcla la
salud de todos los sitios y no dice CUÁL se cayó.

```cron
WPM_CONTAINER=1

0 */6 * * *  KUMA_PUSH=https://kuma.example/api/push/SMOKE_CLANDENT     MAIL_TO=alertas@dominio.cl  cd /opt/wp-monitor && bin/check.sh clandent
5 */6 * * *  KUMA_PUSH=https://kuma.example/api/push/SMOKE_SURDENT      MAIL_TO=alertas@dominio.cl  cd /opt/wp-monitor && bin/check.sh surdent

30 4 * * *   KUMA_PUSH=https://kuma.example/api/push/VISUAL_CLANDENT    VISUAL=1  cd /opt/wp-monitor && bin/check.sh clandent
35 4 * * *   KUMA_PUSH=https://kuma.example/api/push/VISUAL_SURDENT     VISUAL=1  cd /opt/wp-monitor && bin/check.sh surdent
```

`WPM_CONTAINER=1` es obligatorio en el CT: sin `--no-sandbox` Chromium no
levanta ahí, y sin `--disable-dev-shm-usage` muere intermitente por el
`/dev/shm` de 64 MB del LXC (parece un sitio lento; no lo es).

Offsets de 5 minutos entre sitios: evita que dos Chromium completos arranquen
en el mismo segundo en un CT con recursos ajustados.

## Cómo avisa

`bin/check.sh`:
- toma un lock por `<sitio>` (o `<sitio>-visual` con `VISUAL=1`) — una corrida
  que se solapa con la anterior sale sin tocar Kuma, el heartbeat de la que
  sigue viva es el que vale;
- aborta ANTES de correr si `KUMA_PUSH` está seteado y no hay `curl`, o si
  `MAIL_TO` está seteado y no hay CLI de `resend` — un monitor que no puede
  avisar tiene que gritar, no seguir corriendo tests para nadie;
- corre Playwright con los reporters de `playwright.config.ts` (list + html +
  json a `reports/last.json`);
- llama a `bin/notify.ts`, que lee ese JSON y arma la alerta con el nombre
  exacto del test que falló y el primer renglón del error — no la cola cruda
  del log, que con 4 workers en paralelo casi nunca correspondía al fallo real.

## Bugs conocidos y aceptados

Van en `sites/<nombre>.ts`, campo `knownIssues`, con `paths` (a qué rutas
aplica) y `expires` (cuándo deja de aplicar). Pasada la fecha, el error vuelve
a fallar el smoke — un bug "aceptado por ahora" tiene que volver a preguntar.

## Presupuesto de tiempo de respuesta

`site.ttfbBudgetMs` (5s por defecto) es deliberadamente holgado: mide "el
servidor se está ahogando", no "el sitio es rápido". El valor se anota en el
reporte incluso cuando pasa, para ver la degradación antes de cruzar el umbral.
