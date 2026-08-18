import { z } from 'zod';

// Schema de un sitio monitoreado. Reemplaza al config.spec.js de v1: allá la
// config se validaba con tests, así que una config rota solo se detectaba si esa
// suite corría — la corrida visual (VISUAL=1) no la corría y pasaba en verde con
// la config podrida. Acá la validación ocurre al IMPORTAR: cualquier suite que
// toque sites/ explota antes del primer test, con el campo exacto en el mensaje.

/**
 * Ruta del sitio: siempre con barra inicial y final.
 *
 * La barra final no es cosmética: sin ella WordPress redirige (301 a la versión
 * canónica), y entonces el path que se pide deja de ser el path que se mide —
 * el baseline visual se guarda con otro nombre y el mustContain se evalúa contra
 * la página equivocada.
 */
const Path = z
  .string()
  .startsWith('/', 'debe empezar con "/"')
  .endsWith('/', 'debe terminar con "/" (sin ella WordPress redirige)')
  .refine((p) => !/[?#\s]/.test(p), 'sin query string, ni fragmento, ni espacios');

/**
 * Bug de producción ya detectado y aceptado: silencia UNA rotura concreta para que
 * el monitor no quede en rojo permanente y entrene a ignorar las alertas del sitio.
 *
 * Dos diferencias con el knownIssues de v1, y las dos son el punto:
 *  - `paths`: allá el silencio era global. Un "wp is not defined" del home tapaba
 *    el mismo error en el checkout, que sí sería una rotura nueva.
 *  - `expires`: allá el silencio era eterno. Acá vence; pasada la fecha el mute
 *    deja de aplicar y el error vuelve a fallar el smoke. Un bug aceptado "por
 *    ahora" tiene que volver a preguntar.
 */
export const KnownIssueSchema = z.object({
  /**
   * Texto exacto del error a silenciar (substring del mensaje de consola).
   * Mínimo 11 caracteres: un match corto como "Error" o "not defined" silenciaría
   * clases enteras de rotura real, no un bug puntual.
   */
  match: z.string().min(11, 'demasiado corto/genérico: taparía roturas reales'),
  /** Rutas afectadas. Omitido = todas las del sitio (usar solo si de verdad es global). */
  paths: z.array(Path).nonempty().optional(),
  /** Fecha en que el silencio caduca y el error vuelve a fallar. YYYY-MM-DD. */
  expires: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'formato YYYY-MM-DD')
    .refine((d) => !Number.isNaN(Date.parse(d)), 'no es una fecha real'),
  /** Por qué se acepta. Lo lee el que herede esto dentro de seis meses. */
  reason: z.string().min(10, 'explicá por qué se acepta'),
});

/** Rutas de WooCommerce. Su presencia es lo que marca al sitio como tienda. */
export const WooSchema = z.object({
  shopPath: Path,
  cartPath: Path,
  checkoutPath: Path,
  /**
   * Producto SIMPLE conocido para las pruebas de carrito.
   * No "el primero de la tienda": en surdent el primero resultó ser un producto
   * variable, el botón de agregar no hace nada sin elegir variante, y el carro
   * quedaba vacío sin que hubiera ninguna rotura real de por medio.
   */
  sampleProduct: Path.optional(),
});

/**
 * Plugins del sitio. Cada entrada enciende un bloque de tests genéricos: en v1
 * esto eran dos archivos (clandent.spec.js y surdent.spec.js) 90% idénticos, y
 * cada check nuevo había que escribirlo dos veces o quedaba cojo en un sitio.
 *
 * Lo que cambia entre tiendas son datos (qué buscar, qué pasarela, qué captcha),
 * no lógica. Acá van los datos; la lógica vive en checks/ y los selectores en
 * profiles/.
 */
export const PluginsSchema = z
  .object({
    /** Buscador AJAX de productos (FiboSearch). */
    fibosearch: z
      .object({
        /**
         * Término que SIEMPRE tiene que devolver resultados en esa tienda.
         * Mínimo 4 letras: con 2 o 3 el buscador no dispara y el test mediría
         * el debounce en vez del índice.
         */
        query: z.string().min(4),
      })
      .strict()
      .optional(),

    /** Formulario de contacto de Elementor Pro, con o sin captcha. */
    contactForm: z
      .object({
        path: Path,
        captcha: z.enum(['turnstile', 'recaptcha']).optional(),
      })
      .strict()
      .optional(),

    /** Checkout de Woo con los plugins fiscales chilenos. */
    checkout: z
      .object({
        /**
         * Texto que identifica a la pasarela en el checkout, como regex.
         * Si el plugin se desregistra con un update, el cliente llega hasta acá
         * y no puede pagar: no hay ningún otro síntoma en el sitio.
         */
        gateway: z
          .string()
          .min(3)
          .refine((source) => {
            try {
              new RegExp(source, 'i');
              return true;
            } catch {
              return false;
            }
          }, 'no es una expresión regular válida'),
        /** Campo RUT del plugin fiscal: sin él, o nadie compra o los pedidos salen sin RUT. */
        rutField: z.boolean().default(true),
        /** Selects región/comuna dependientes: si su JS muere, el checkout es incompletable. */
        regionSelect: z.boolean().default(true),
      })
      .strict()
      .optional(),
  })
  .strict();

export const SiteSchema = z
  .object({
    /** Identificador corto. Es el nombre del project de Playwright y del lock del cron. */
    name: z
      .string()
      .min(2)
      .regex(/^[a-z0-9][a-z0-9-]*$/, 'solo minúsculas, números y guiones'),
    /** Origen, sin barra final: se concatena con los paths, que ya la traen adelante. */
    baseURL: z
      .string()
      .regex(/^https:\/\/[^/\s]+$/, 'debe ser https://host sin barra final ni ruta'),
    /** Rutas que recorre el smoke. */
    paths: z.array(Path).nonempty('sin rutas no hay nada que monitorear'),
    /**
     * Texto que debe aparecer en el título o el body de cada ruta.
     * Es el ÚNICO check que detecta permalinks rotos: WordPress devuelve 200 en
     * rutas fantasma, así que el status HTTP no delata nada.
     */
    mustContain: z.record(Path, z.string().min(1)).optional(),
    /** Login real, si un plugin de seguridad lo movió de /wp-login.php. */
    loginPath: Path.optional(),
    /**
     * Presupuesto de tiempo hasta el primer byte, por ruta.
     * 5s por defecto: holgado a propósito. Esto no mide "rápido", mide "el
     * servidor se está ahogando" — y un umbral ajustado convierte cada pico de
     * tráfico en una alerta falsa, que es como se muere la confianza en el monitor.
     */
    ttfbBudgetMs: z.number().int().min(500).max(30_000).default(5_000),
    woo: WooSchema.optional(),
    plugins: PluginsSchema.optional(),
    knownIssues: z.array(KnownIssueSchema).optional(),
  })
  .strict() // una key con typo ("mustContains") sería una config que no hace nada
  .superRefine((site, ctx) => {
    const paths = new Set(site.paths);

    if (paths.size !== site.paths.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['paths'],
        message: 'hay rutas repetidas',
      });
    }

    // El check que justifica todo el archivo: mustContain se lee como
    // mustContain[path], así que una key que no esté en paths NUNCA se evalúa.
    // No rompe nada, no avisa nada — simplemente ese contenido deja de vigilarse.
    for (const key of Object.keys(site.mustContain ?? {})) {
      if (!paths.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['mustContain', key],
          message: `"${key}" no está en paths: ese check no correría nunca`,
        });
      }
    }

    // El home es la ruta que más veces se sirve como fallback: sin ancla de
    // contenido, una página de mantenimiento o un theme a medio cargar pasa
    // como sitio sano.
    if (paths.has('/') && !site.mustContain?.['/']) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mustContain', '/'],
        message: 'el home tiene que tener mustContain',
      });
    }

    // Tienda y carro deben estar en paths: si no, el smoke no los mira y los
    // checks de Woo asumen que cargan bien una página que nadie verificó.
    // sampleProduct queda afuera a propósito: es una ficha de producto, no una
    // ruta estructural, y cambia cuando lo despublican.
    for (const key of ['shopPath', 'cartPath', 'checkoutPath'] as const) {
      const value = site.woo?.[key];
      if (value && !paths.has(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['woo', key],
          message: `"${value}" no está en paths: el smoke no lo recorrería`,
        });
      }
    }

    // El formulario de contacto se testea sobre una ruta que el smoke ya recorre:
    // si no está en paths, nadie verificó que esa página siquiera cargue.
    const formPath = site.plugins?.contactForm?.path;
    if (formPath && !paths.has(formPath)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['plugins', 'contactForm', 'path'],
        message: `"${formPath}" no está en paths`,
      });
    }

    // Sin rutas de Woo no hay checkout que probar: la config diría que sí y los
    // tests no tendrían dónde ir.
    if (site.plugins?.checkout && !site.woo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['plugins', 'checkout'],
        message: 'hay checkout configurado pero el sitio no declara woo',
      });
    }

    for (const [i, issue] of (site.knownIssues ?? []).entries()) {
      for (const [j, p] of (issue.paths ?? []).entries()) {
        if (!paths.has(p)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['knownIssues', i, 'paths', j],
            message: `"${p}" no está en paths: el silencio no aplicaría a nada`,
          });
        }
      }
    }
  });

/**
 * Lista completa. Nombres únicos porque cada uno es un project de Playwright y un
 * lock del cron; repetido, un sitio se comería la corrida del otro.
 *
 * v1 además exigía que ningún nombre fuera substring de otro, porque el filtrado
 * era `--grep <nombre>`. Acá el filtro es `--project=<nombre>`, que hace match
 * exacto: esa restricción desaparece junto con su test.
 */
export const SiteListSchema = z
  .array(SiteSchema)
  .nonempty('no hay sitios configurados')
  .superRefine((sites, ctx) => {
    const seen = new Set<string>();
    for (const [i, site] of sites.entries()) {
      if (seen.has(site.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i, 'name'],
          message: `nombre duplicado: "${site.name}"`,
        });
      }
      seen.add(site.name);
    }
  });

export type Site = z.infer<typeof SiteSchema>;
export type SiteInput = z.input<typeof SiteSchema>;
export type KnownIssue = z.infer<typeof KnownIssueSchema>;

/** Convierte un ZodError en algo que se lee de un vistazo en el log del cron. */
export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => `  ${i.path.length ? i.path.join('.') : '(raíz)'}: ${i.message}`)
    .join('\n');
}

/**
 * Valida la lista y devuelve la versión tipada, o lanza con las rutas exactas de
 * los campos rotos. Se llama al importar sites/index.ts — no dentro de un test.
 */
export function parseSites(raw: unknown): Site[] {
  const result = SiteListSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`configuración de sitios inválida:\n${formatIssues(result.error)}`);
  }
  return result.data;
}

/**
 * ¿Este silencio sigue vigente? Vencido, el error vuelve a fallar el smoke.
 * La comparación es por día completo: expires="2026-09-30" cubre todo ese día.
 */
export function isMuteActive(issue: KnownIssue, now: Date = new Date()): boolean {
  return now.getTime() <= Date.parse(`${issue.expires}T23:59:59Z`);
}

/** Silencios que aplican a una ruta concreta hoy. Sin `paths`, el mute es del sitio entero. */
export function activeMutes(site: Site, path: string, now: Date = new Date()): KnownIssue[] {
  return (site.knownIssues ?? []).filter(
    (i) => isMuteActive(i, now) && (!i.paths || i.paths.includes(path))
  );
}
