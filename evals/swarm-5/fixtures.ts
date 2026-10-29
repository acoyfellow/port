import { addToCart, emptyCart } from '../../src/cart.ts';
import { money } from '../../src/core/money.ts';
import { buildInvoice } from '../../src/invoice.ts';

export const tea = { sku: 'TEA', name: 'Green tea', price: money(450) };
export const pot = { sku: 'POT', name: 'Teapot', price: money(2999) };
export const cup = { sku: 'CUP', name: 'Cup', price: money(333) };

export const three = () =>
  buildInvoice('INV-3', addToCart(addToCart(addToCart(emptyCart(), tea, 2), pot), cup, 3), 'CA', {
    kind: 'percent',
    percent: 10,
  });
