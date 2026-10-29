import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addToCart, emptyCart, mergeCarts } from '../../src/cart.ts';
import { money } from '../../src/core/money.ts';

const a1 = { sku: 'A', name: 'Apple', price: money(100) };
const a2 = { sku: 'A', name: 'Apple (guest)', price: money(90) };
const b = { sku: 'B', name: 'Bread', price: money(200) };
const c = { sku: 'C', name: 'Cheese', price: money(300) };

test("merge: combines same sku at a's position with a's product", () => {
  const account = addToCart(addToCart(emptyCart(), a1, 2), b, 1);
  const guest = addToCart(addToCart(emptyCart(), c, 1), a2, 3);
  const merged = mergeCarts(account, guest);
  assert.deepEqual(
    merged.lines.map((l) => [l.product.sku, l.quantity]),
    [
      ['A', 5],
      ['B', 1],
      ['C', 1],
    ],
  );
  assert.equal(merged.lines[0].product.name, 'Apple');
  assert.deepEqual(
    account.lines.map((l) => l.quantity),
    [2, 1],
  );
  assert.deepEqual(
    guest.lines.map((l) => l.quantity),
    [1, 3],
  );
});

test('merge: caps at 99 and rejects mixed currencies', () => {
  const big = mergeCarts(addToCart(emptyCart(), a1, 60), addToCart(emptyCart(), a1, 60));
  assert.equal(big.lines[0].quantity, 99);
  assert.throws(() => mergeCarts(emptyCart('USD'), emptyCart('EUR')), TypeError);
});
