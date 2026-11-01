import type { LoanRow } from '@/lib/database.types';

const MAX_PAYMENT_CENTAVOS = 1_000_000_000_000n;

export function parsePesoInput(input: string): string {
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(input.trim());
  if (!match) throw new Error('Enter a valid peso amount with up to two decimal places.');
  const centavos = BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
  if (centavos < 1n || centavos > MAX_PAYMENT_CENTAVOS)
    throw new Error('Monthly payment is outside the supported range.');
  return centavos.toString();
}

export function formatPesos(value: string): string {
  const centavos = BigInt(value);
  const pesos = (centavos / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `₱${pesos}.${(centavos % 100n).toString().padStart(2, '0')}`;
}

export function pesoInputFromMinor(value: string): string {
  const centavos = BigInt(value);
  return `${centavos / 100n}.${(centavos % 100n).toString().padStart(2, '0')}`;
}

export function isLoanDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(instant.getTime()) &&
    instant.toISOString().slice(0, 10) === value &&
    value >= '2000-01-01' &&
    value <= '2100-12-31'
  );
}

export function installmentDate(firstDueDate: string, number: number): string {
  if (!isLoanDate(firstDueDate) || !Number.isInteger(number) || number < 1)
    throw new Error('Invalid installment.');
  const [year, month, day] = firstDueDate.split('-').map(Number);
  const target = new Date(Date.UTC(year!, month! + number - 2, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day!, last)))
    .toISOString()
    .slice(0, 10);
}
export function remainingMonths(loan: Pick<LoanRow, 'total_months' | 'paid_months'>) {
  return loan.total_months - loan.paid_months;
}
export function loanStatus(loan: Pick<LoanRow, 'archived_at' | 'total_months' | 'paid_months'>) {
  if (loan.archived_at) return 'Archived';
  return remainingMonths(loan) === 0 ? 'Paid Off' : 'Active';
}
export function installmentState(paidAt: string | null, dueDate: string, localDate: string) {
  if (paidAt) return 'Paid';
  if (dueDate < localDate) return 'Overdue';
  return dueDate === localDate ? 'Due today' : 'Upcoming';
}
