export const BILL_CATEGORIES = [
  'utilities',
  'housing',
  'subscription',
  'insurance',
  'installment',
  'school',
  'other',
] as const;
export const BILL_RECURRENCES = ['none', 'weekly', 'monthly', 'yearly'] as const;
export type BillCategory = (typeof BILL_CATEGORIES)[number];
export type BillRecurrence = (typeof BILL_RECURRENCES)[number];

export const MAX_BILL_MINOR = 1_000_000_000_000n;

export function parsePesoInput(input: string): string {
  const value = input.trim();
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(value);
  if (!match) throw new Error('Enter a valid peso amount with up to two decimal places.');
  const minor = BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
  if (minor < 1n) throw new Error('Amount must be greater than zero.');
  if (minor > MAX_BILL_MINOR) throw new Error('Amount is too large.');
  return minor.toString();
}

export function formatPesos(minorString: string): string {
  const minor = BigInt(minorString);
  const pesos = (minor / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `₱${pesos}.${(minor % 100n).toString().padStart(2, '0')}`;
}

export function pesoInputFromMinor(minorString: string): string {
  const minor = BigInt(minorString);
  return `${minor / 100n}.${(minor % 100n).toString().padStart(2, '0')}`;
}

export function isBillDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(instant.getTime()) &&
    instant.toISOString().slice(0, 10) === value &&
    value >= '2000-01-01' &&
    value <= '2100-12-31'
  );
}

export function billDueState(status: 'unpaid' | 'paid', dueOn: string, localDate: string) {
  if (status === 'paid') return 'paid';
  if (dueOn < localDate) return 'overdue';
  return dueOn === localDate ? 'today' : 'upcoming';
}

export function billListAfterCreate(
  dueOn: string,
  recurrence: BillRecurrence,
  localDate: string,
): 'upcoming' | 'overdue' {
  return recurrence !== 'none' || dueOn >= localDate ? 'upcoming' : 'overdue';
}
