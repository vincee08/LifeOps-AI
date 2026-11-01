import { installmentDate } from '@/features/loans/loans-model';
import {
  getNextLoanPayment,
  listLoanInstallments,
  type LoanInstallment,
} from '@/features/loans/loans-service';

let rows: LoanInstallment[] = [];
const mockFrom = jest.fn(() => {
  let result = [...rows];
  const sorts: Array<{ field: keyof LoanInstallment; ascending: boolean }> = [];
  const sorted = () =>
    [...result].sort((a, b) => {
      for (const { field, ascending } of sorts) {
        const left = a[field];
        const right = b[field];
        const comparison =
          typeof left === 'number' && typeof right === 'number'
            ? left - right
            : String(left).localeCompare(String(right));
        if (comparison) return ascending ? comparison : -comparison;
      }
      return 0;
    });
  const query = {
    select: () => query,
    eq: (field: keyof LoanInstallment, value: unknown) => {
      result = result.filter((row) => row[field] === value);
      return query;
    },
    is: (field: keyof LoanInstallment, value: null) => {
      result = result.filter((row) => row[field] === value);
      return query;
    },
    not: (field: keyof LoanInstallment, _operator: string, value: null) => {
      result = result.filter((row) => row[field] !== value);
      return query;
    },
    lt: (field: keyof LoanInstallment, value: string) => {
      result = result.filter((row) => String(row[field]) < value);
      return query;
    },
    gte: (field: keyof LoanInstallment, value: string) => {
      result = result.filter((row) => String(row[field]) >= value);
      return query;
    },
    order: (field: keyof LoanInstallment, options?: { ascending?: boolean }) => {
      sorts.push({ field, ascending: options?.ascending !== false });
      return query;
    },
    limit: (count: number) => {
      result = sorted().slice(0, count);
      return query;
    },
    maybeSingle: async () => ({ data: sorted()[0] ?? null, error: null }),
    range: async (start: number, end: number) => ({
      data: sorted().slice(start, end + 1),
      error: null,
    }),
  };
  return query;
});
jest.mock('@/lib/supabase', () => ({ getSupabaseClient: () => ({ from: mockFrom }) }));

beforeEach(() => {
  rows = Array.from({ length: 36 }, (_, index) => ({
    id: `installment-${index + 1}`,
    loan_id: 'loan-1',
    user_id: 'owner',
    installment_number: index + 1,
    due_date: installmentDate('2024-01-01', index + 1),
    paid_at: null,
    created_at: '',
    title: 'Motorcycle Loan',
    monthly_payment_centavos: '380100',
    archived_at: null,
  }));
});

it('queries one next payment and every historical unpaid installment without fetching future cards', async () => {
  rows[2]!.paid_at = '2024-03-02T00:00:00Z';
  const today = '2026-11-01';
  const next = await getNextLoanPayment('owner', 'loan-1', today);
  const firstPage = await listLoanInstallments('owner', 'loan-1', 'overdue', today);
  const secondPage = await listLoanInstallments('owner', 'loan-1', 'overdue', today, 1);
  const history = await listLoanInstallments('owner', 'loan-1', 'paid', today);
  expect(next?.installment_number).toBe(35);
  expect([...firstPage.items, ...secondPage.items]).toHaveLength(33);
  expect(firstPage.hasMore).toBe(true);
  expect(secondPage.hasMore).toBe(false);
  expect(
    [...firstPage.items, ...secondPage.items].every(
      (item) => item.due_date < today && !item.paid_at,
    ),
  ).toBe(true);
  expect(history.items.map((item) => item.installment_number)).toEqual([3]);
  expect(rows).toHaveLength(36);
  expect(rows[35]?.installment_number).toBe(36);
});
