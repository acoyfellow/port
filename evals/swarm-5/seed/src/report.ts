import { format, sum } from './core/money.ts';
import type { Invoice } from './invoice.ts';

export function salesReport(invoices: readonly Invoice[]): string {
  const lines = invoices.map((inv) => `${inv.number} ${inv.region} ${format(inv.total, false)}`);
  const total = sum(
    invoices.map((inv) => inv.total),
    invoices[0]?.currency,
  );
  return [...lines, `TOTAL ${format(total, false)}`].join('\n');
}
