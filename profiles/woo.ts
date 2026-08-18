/**
 * Selectores de WooCommerce y de los plugins fiscales chilenos.
 *
 * Están juntos y en un solo lugar porque son lo primero que cambia cuando se
 * actualiza un theme: en v1 vivían repartidos entre cuatro archivos de tests y
 * cada ajuste había que hacerlo N veces, con el riesgo de dejar uno viejo y no
 * enterarse (un selector que no matchea nada falla igual que un sitio roto, pero
 * la alerta miente sobre la causa).
 *
 * `:visible` en precio: la ficha de surdent trae 18 nodos con esa clase
 * (duplicados de responsive y del carrusel de relacionados) y `.first()` sin
 * filtrar agarra uno oculto, que da falso negativo.
 */
export const wooSelectors = {
  price: '.woocommerce-Price-amount:visible',
  addToCartButton: '.single_add_to_cart_button',
  /** Acuse de recibo del add-to-cart. Es el contrato estable con el usuario. */
  addedToCartAck: '.woocommerce-message, .added_to_cart',

  checkout: {
    firstName: '#billing_first_name, [name="billing_first_name"]',
    /** Plugin fiscal chileno. */
    rut: '[name="billing_rut"]',
    state: 'select[name="billing_state"]',
    city: 'select[name="billing_city"]',
    shippingMethods: '#shipping_method li, .woocommerce-shipping-methods li',
    orderTotal: '.order-total',
    placeOrder: '#place_order',
    /** Los <li> de error llegan al DOM aunque el theme oculte el contenedor. */
    validationErrors: '.woocommerce-error li',
  },

  /** Fragmento de URL del AJAX que recalcula totales al cambiar región o envío. */
  updateOrderReview: 'update_order_review',
} as const;

/** Formato de precio chileno: signo peso y miles con punto. */
export const CLP_PRICE = /\$\s?[\d.]+/;
/** Total con al menos cuatro dígitos: descarta un "$0" o un "$ 50" imposible. */
export const CLP_TOTAL = /\$\s?[\d.]{4,}/;
export const CLP_ZERO = /\$\s?0(?:\D|$)/;
