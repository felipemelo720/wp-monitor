import type { SiteInput } from './schema.js';

// surdent.cl — mismo negocio que clandent, plugins distintos: reCAPTCHA en vez de
// Turnstile, y la grilla de /tienda/ armada con JetEngine (Crocoblock) en vez del
// loop nativo de Woo.
export const surdent = {
  name: 'surdent',
  baseURL: 'https://surdent.cl',

  paths: [
    '/',
    '/tienda/',
    '/carrito/',
    '/finalizar-compra/',
    '/contacto/',
    '/mi-cuenta/',
    '/cotizar-producto/',
  ],

  mustContain: {
    '/': 'Inicio',
    '/tienda/': 'Tienda',
    '/carrito/': 'Carrito',
    '/contacto/': 'Contacto',
    '/mi-cuenta/': 'Mi cuenta',
    '/cotizar-producto/': 'Cotiz', // recortado: el título alterna "Cotizar"/"Cotización"
    // /finalizar-compra/ sin ancla: con el carro vacío hace 302 a /carrito/.
  },

  woo: {
    shopPath: '/tienda/',
    cartPath: '/carrito/',
    checkoutPath: '/finalizar-compra/',
    // Producto SIMPLE elegido a mano: el primero de la grilla es variable y su
    // botón de compra no agrega nada sin elegir variante.
    sampleProduct: '/producto/bacteria-filter-vs300/',
  },

  knownIssues: [
    {
      match: 'wp is not defined',
      // Solo estas cuatro: medido el 2026-08-17, el error NO aparece en
      // /carrito/, /finalizar-compra/ ni /mi-cuenta/. Si mañana sale ahí, es
      // una rotura nueva y tiene que fallar — que es justo lo que el silencio
      // global de v1 no dejaba ver.
      paths: ['/', '/tienda/', '/contacto/', '/cotizar-producto/'],
      expires: '2026-09-30',
      reason:
        'Bug preexistente de producción: un script se encola antes que wp-util. No rompe la compra ni el checkout. Silenciado hasta que se revise el orden de dependencias del theme.',
    },
  ],
} satisfies SiteInput;
