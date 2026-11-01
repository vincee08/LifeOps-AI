import {
  installmentDate,
  installmentState,
  loanStatus,
  remainingMonths,
} from '@/features/loans/loans-model';
import { validateLoanDraft } from '@/features/loans/loans-service';

const draft = {
  title: '  Motorcycle Loan  ',
  monthlyPayment: '3500',
  firstDueDate: '2026-11-15',
  totalMonths: '12',
  notes: '',
};

it('validates the simple PHP monthly loan and exact centavos', () => {
  expect(validateLoanDraft(draft)).toEqual({
    title: 'Motorcycle Loan',
    monthly_payment_centavos: '350000',
    first_due_date: '2026-11-15',
    total_months: 12,
    notes: null,
  });
  expect(() => validateLoanDraft({ ...draft, monthlyPayment: '3,500' })).toThrow();
  expect(() => validateLoanDraft({ ...draft, monthlyPayment: '3500.001' })).toThrow();
  expect(() => validateLoanDraft({ ...draft, totalMonths: '0' })).toThrow();
  expect(() => validateLoanDraft({ ...draft, totalMonths: '12.5' })).toThrow();
});

it('derives every date from the original month-end anchor', () => {
  expect(Array.from({ length: 5 }, (_, i) => installmentDate('2028-01-31', i + 1))).toEqual([
    '2028-01-31',
    '2028-02-29',
    '2028-03-31',
    '2028-04-30',
    '2028-05-31',
  ]);
  expect(installmentDate('2027-01-31', 2)).toBe('2027-02-28');
  expect(installmentDate('2027-01-31', 3)).toBe('2027-03-31');
  expect(installmentDate('2024-02-29', 13)).toBe('2025-02-28');
  expect(installmentDate('2026-11-15', 12)).toBe('2027-10-15');
});

it('derives counts, paid-off status, and overdue from source state', () => {
  const loan = { total_months: 12, paid_months: 4, archived_at: null };
  expect(remainingMonths(loan)).toBe(8);
  expect(remainingMonths({ ...loan, paid_months: 5 })).toBe(7);
  expect(loanStatus(loan)).toBe('Active');
  expect(loanStatus({ ...loan, paid_months: 12 })).toBe('Paid Off');
  expect(loanStatus({ ...loan, archived_at: '2026-10-30T00:00:00Z' })).toBe('Archived');
  expect(installmentState(null, '2026-11-14', '2026-11-15')).toBe('Overdue');
  expect(installmentState(null, '2026-11-15', '2026-11-15')).toBe('Due today');
  expect(installmentState('2026-11-14T00:00:00Z', '2026-11-14', '2026-11-15')).toBe('Paid');
});
