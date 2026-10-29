import type { Money } from './core/money.ts';
import { money } from './core/money.ts';

export const SHIPPING_CENTS: Readonly<Record<string, number>> = { CA: 599, NY: 699, TX: 649, OR: 599 };

export function shippingFor(region: string, currency: string = 'USD'): Money {
  const cents = SHIPPING_CENTS[region];
  if (cents === undefined) throw new RangeError(`shipping: no shipping to region ${region}`);
  return money(cents, currency);
}
