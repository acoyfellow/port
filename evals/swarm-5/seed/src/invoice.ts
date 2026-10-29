import type { Cart } from './cart.ts';
import { lineTotal, subtotal } from './cart.ts';
import type { Money } from './core/money.ts';
import { add, zero } from './core/money.ts';
import type { Discount } from './discount.ts';
import { applyDiscount, discountAmount } from './discount.ts';
import { shippingFor } from './shipping.ts';
import { taxFor } from './tax.ts';

export interface InvoiceLine {
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
  readonly unit: Money;
  readonly total: Money;
}

export interface Invoice {
  readonly number: string;
  readonly region: string;
  readonly currency: string;
  readonly lines: readonly InvoiceLine[];
  readonly subtotal: Money;
  readonly discount: Money;
  readonly tax: Money;
  readonly shipping: Money;
  readonly total: Money;
}

export function buildInvoice(number: string, cart: Cart, region: string, discount?: Discount): Invoice {
  if (cart.lines.length === 0) throw new RangeError(`invoice ${number}: the cart is empty`);
  const lines = cart.lines.map((l) => ({
    sku: l.product.sku,
    name: l.product.name,
    quantity: l.quantity,
    unit: l.product.price,
    total: lineTotal(l),
  }));
  const sub = subtotal(cart);
  const off = discount ? discountAmount(sub, discount) : zero(cart.currency);
  const taxable = discount ? applyDiscount(sub, discount) : sub;
  const tax = taxFor(taxable, region);
  const shipping = shippingFor(region, cart.currency);
  return {
    number,
    region,
    currency: cart.currency,
    lines,
    subtotal: sub,
    discount: off,
    tax,
    shipping,
    total: add(add(taxable, tax), shipping),
  };
}
