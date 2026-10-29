import type { Product } from './catalog.ts';
import type { Money } from './core/money.ts';
import { multiply, sum } from './core/money.ts';

export interface CartLine {
  readonly product: Product;
  readonly quantity: number;
}

export interface Cart {
  readonly currency: string;
  readonly lines: readonly CartLine[];
}

export function emptyCart(currency: string = 'USD'): Cart {
  return { currency, lines: [] };
}

export function addToCart(cart: Cart, product: Product, quantity: number = 1): Cart {
  if (!Number.isSafeInteger(quantity) || quantity < 1)
    throw new RangeError(`cart: quantity ${quantity} is not a positive whole number`);
  if (product.price.currency !== cart.currency)
    throw new TypeError(
      `cart: ${product.sku} is priced in ${product.price.currency}, the cart in ${cart.currency}`,
    );
  const i = cart.lines.findIndex((l) => l.product.sku === product.sku);
  if (i === -1) return { ...cart, lines: [...cart.lines, { product, quantity }] };
  const lines = cart.lines.map((l, j) =>
    j === i ? { product: l.product, quantity: l.quantity + quantity } : l,
  );
  return { ...cart, lines };
}

export function lineTotal(line: CartLine): Money {
  return multiply(line.product.price, line.quantity);
}

export function subtotal(cart: Cart): Money {
  return sum(cart.lines.map(lineTotal), cart.currency);
}
