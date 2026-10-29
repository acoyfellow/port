import type { Money } from './core/money.ts';
import { compare, percentOf, subtract } from './core/money.ts';

export type Discount =
  | { readonly kind: 'fixed'; readonly amount: Money }
  | { readonly kind: 'percent'; readonly percent: number };

export function discountAmount(subtotal: Money, discount: Discount): Money {
  const off = discount.kind === 'fixed' ? discount.amount : percentOf(subtotal, discount.percent);
  return compare(off, subtotal) > 0 ? subtotal : off;
}

export function applyDiscount(subtotal: Money, discount: Discount): Money {
  return subtract(subtotal, discountAmount(subtotal, discount));
}
