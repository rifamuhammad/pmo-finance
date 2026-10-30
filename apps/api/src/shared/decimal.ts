import { Prisma } from '@prisma/client';

/**
 * Exact cent/rupiah decimal helpers using Prisma.Decimal or BigInt scaled by 100
 * to prevent floating-point drift in financial calculations.
 */
export function toCents(value: Prisma.Decimal | number | string | null | undefined): bigint {
  if (value === null || value === undefined || value === '') return 0n;
  const str = typeof value === 'object' ? value.toFixed(2) : Number(value).toFixed(2);
  const negative = str.startsWith('-');
  const normalized = negative ? str.slice(1) : str;
  const [whole = '0', frac = '00'] = normalized.split('.');
  const cents = BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0').slice(0, 2));
  return negative ? -cents : cents;
}

export function fromCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${frac}`;
}

export function toNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number(fromCents(toCents(value)));
}

export function addMoney(...values: Array<Prisma.Decimal | number | string | null | undefined>): string {
  let total = 0n;
  for (const val of values) {
    total += toCents(val);
  }
  return fromCents(total);
}

export function subMoney(
  a: Prisma.Decimal | number | string | null | undefined,
  b: Prisma.Decimal | number | string | null | undefined
): string {
  return fromCents(toCents(a) - toCents(b));
}

export function mulMoney(
  amount: Prisma.Decimal | number | string,
  qty: Prisma.Decimal | number | string
): string {
  const amountCents = toCents(amount);
  const qtyScaled = toCents(qty);
  // Both scaled by 100 -> product scaled by 10000, divide by 100 with half-up rounding
  const product = amountCents * qtyScaled;
  const rounded = product >= 0n ? (product + 50n) / 100n : (product - 50n) / 100n;
  return fromCents(rounded);
}

export function calcPercentage(
  amount: Prisma.Decimal | number | string,
  ratePercent: Prisma.Decimal | number | string
): string {
  const amountCents = toCents(amount);
  const rateScaled = toCents(ratePercent); // e.g., 11.00% -> 1100
  const product = amountCents * rateScaled;
  const rounded = product >= 0n ? (product + 5000n) / 10000n : (product - 5000n) / 10000n;
  return fromCents(rounded);
}
