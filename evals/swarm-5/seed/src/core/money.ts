export interface Money {
  readonly cents: number;
  readonly currency: string;
}

export const DEFAULT_CURRENCY = 'USD';

const SYMBOLS: Readonly<Record<string, string>> = { USD: '$', EUR: '€', GBP: '£' };

export function money(cents: number, currency: string = DEFAULT_CURRENCY): Money {
  if (!Number.isSafeInteger(cents)) throw new RangeError(`money: ${cents} is not a whole number of cents`);
  return { cents: cents === 0 ? 0 : cents, currency };
}

export function zero(currency: string = DEFAULT_CURRENCY): Money {
  return money(0, currency);
}

function sameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new TypeError(`currency mismatch: ${a.currency} and ${b.currency}`);
}

export function add(a: Money, b: Money): Money {
  sameCurrency(a, b);
  return money(a.cents + b.cents, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  sameCurrency(a, b);
  return money(a.cents - b.cents, a.currency);
}

export function roundHalfAway(x: number): number {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

export function multiply(m: Money, factor: number): Money {
  return money(roundHalfAway(m.cents * factor), m.currency);
}

export function percentOf(m: Money, percent: number): Money {
  return money(roundHalfAway(m.cents * (percent / 100)), m.currency);
}

export function sum(amounts: readonly Money[], currency: string = DEFAULT_CURRENCY): Money {
  return amounts.reduce((total, m) => add(total, m), zero(amounts[0]?.currency ?? currency));
}

export function compare(a: Money, b: Money): number {
  sameCurrency(a, b);
  return Math.sign(a.cents - b.cents);
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.cents === b.cents;
}

export function format(m: Money, symbol: boolean = true): string {
  const sign = m.cents < 0 ? '-' : '';
  const abs = Math.abs(m.cents);
  const number = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  if (!symbol) return `${sign}${number}`;
  const s = SYMBOLS[m.currency];
  return s === undefined ? `${sign}${number} ${m.currency}` : `${sign}${s}${number}`;
}

export function parse(text: string, currency: string = DEFAULT_CURRENCY): Money {
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) throw new SyntaxError(`parse: "${text}" is not an amount`);
  const cents = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  return money(m[1] ? -cents : cents, currency);
}
