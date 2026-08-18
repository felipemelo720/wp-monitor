import type { SiteInput } from './schema.js';

// clandent.cl — insumos dentales. WooCommerce + Elementor Pro + FiboSearch +
// Transbank Webpay + Turnstile. La validación real la hace el schema al importar
// sites/index.ts; el `satisfies` de acá es la misma red, pero en el editor.
export const clandent = {
  name: 'clandent',
  baseURL: 'https://clandent.cl',

  paths: ['/', '/tienda/', '/carrito/', '/finalizar-compra/', '/contactanos/', '/mi-cuenta/'],

  mustContain: {
    '/': 'Insumos Dentales',
    '/tienda/': 'Tienda',
    '/carrito/': 'Carrito',
    '/contactanos/': 'Contacto',
    '/mi-cuenta/': 'Mi cuenta',
    // /finalizar-compra/ sin ancla: con el carro vacío Woo redirige al carrito,
    // así que el texto que aparece no es el del checkout.
  },

  woo: {
    shopPath: '/tienda/',
    cartPath: '/carrito/',
    checkoutPath: '/finalizar-compra/',
    sampleProduct: '/producto/abreboca-adulto-medio-con-retractor-lingual/',
  },
} satisfies SiteInput;
