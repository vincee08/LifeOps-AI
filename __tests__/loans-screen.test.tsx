import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { LoansScreen } from '@/features/loans/LoansScreen';
import type { Loan, LoanInstallment } from '@/features/loans/loans-service';

const mockGetLoan = jest.fn();
const mockListLoans = jest.fn();
const mockListInstallments = jest.fn();
const mockNext = jest.fn();
const mockCreate = jest.fn();
const mockMark = jest.fn();
const mockSetPaid = jest.fn();
const mockReconcile = jest.fn();
const mockSetParams = jest.fn();
jest.mock('expo-crypto', () => ({ randomUUID: () => 'e0000000-0000-4000-8000-000000000001' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ setParams: mockSetParams }),
  useFocusEffect: (effect: () => void) => {
    const React = require('react');
    React.useEffect(effect, [effect]);
  },
}));
jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ state: { status: 'signed-in', session: { user: { id: 'owner' } } } }),
}));
jest.mock('@/features/settings/profile-service', () => ({
  loadProfile: jest.fn(async () => ({ timezone: 'Asia/Manila' })),
}));
jest.mock('@/features/loans/loan-notifications', () => ({
  reconcileUpcomingLoanReminders: () => mockReconcile(),
  loanReminderWarning: () => '',
}));
jest.mock('@/features/loans/loans-service', () => ({
  getLoan: (...args: unknown[]) => mockGetLoan(...args),
  listLoans: (...args: unknown[]) => mockListLoans(...args),
  listLoanInstallments: (...args: unknown[]) => mockListInstallments(...args),
  getNextLoanPayment: (...args: unknown[]) => mockNext(...args),
  createLoan: (...args: unknown[]) => mockCreate(...args),
  markInstallmentPaid: (...args: unknown[]) => mockMark(...args),
  setInstallmentPaid: (...args: unknown[]) => mockSetPaid(...args),
}));

const initial: Loan = {
  id: 'loan-1',
  user_id: 'owner',
  title: 'Motorcycle Loan',
  monthly_payment_centavos: '350000',
  first_due_date: '2026-11-15',
  total_months: 12,
  notes: null,
  archived_at: null,
  created_at: '',
  updated_at: '',
  paid_months: 0,
  next_due_date: '2026-11-15',
  next_installment_id: 'installment-1',
};
const first: LoanInstallment = {
  id: 'installment-1',
  user_id: 'owner',
  loan_id: 'loan-1',
  installment_number: 1,
  due_date: '2026-11-15',
  paid_at: null,
  created_at: '',
  title: 'Motorcycle Loan',
  monthly_payment_centavos: '350000',
  archived_at: null,
};
const second = { ...first, id: 'installment-2', installment_number: 2, due_date: '2026-12-15' };
let currentLoan = initial;
let currentNext: LoanInstallment | null = first;
let currentOverdue: LoanInstallment[] = [];
let currentPaid: LoanInstallment[] = [];
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-30T00:00:00Z'));
  currentLoan = initial;
  currentNext = first;
  currentOverdue = [];
  currentPaid = [];
  mockGetLoan.mockImplementation(async () => currentLoan);
  mockNext.mockImplementation(async () => currentNext);
  mockListLoans.mockResolvedValue({ items: [], hasMore: false });
  mockListInstallments.mockImplementation(
    async (_owner: string, _loan: string, section: string) => ({
      items: section === 'overdue' ? currentOverdue : currentPaid,
      hasMore: false,
    }),
  );
  mockCreate.mockResolvedValue('loan-1');
  mockReconcile.mockResolvedValue({ status: 'none', count: 0 });
  mockMark.mockImplementation(async (id: string) => {
    currentLoan = {
      ...currentLoan,
      paid_months: currentLoan.paid_months + 1,
      next_due_date: id === 'installment-1' ? '2026-12-15' : currentLoan.next_due_date,
      next_installment_id:
        id === 'installment-1' ? 'installment-2' : currentLoan.next_installment_id,
    };
    const target = [...currentOverdue, currentNext].find((item) => item?.id === id);
    currentOverdue = currentOverdue.filter((item) => item.id !== id);
    if (target) currentPaid = [{ ...target, paid_at: '2026-11-15T01:00:00Z' }, ...currentPaid];
    if (currentNext?.id === id) currentNext = second;
  });
});
afterEach(() => jest.restoreAllMocks());

it('shows simple counts and advances the next due after marking paid', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  await render(<LoansScreen initialLoanId="loan-1" />);
  await screen.findByText('0 of 12 months paid');
  expect(screen.getByText('12 months remaining')).toBeTruthy();
  expect(screen.getByText('Earliest unpaid: Nov 15, 2026')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Mark installment 1 paid' }));
  const buttons = alert.mock.calls[0]?.[2];
  const confirm = Array.isArray(buttons)
    ? buttons.find((button) => button.text === 'Mark as paid')
    : null;
  await act(async () => {
    await confirm?.onPress?.();
  });
  await waitFor(() => expect(screen.getByText('1 of 12 months paid')).toBeTruthy());
  expect(screen.getByText('11 months remaining')).toBeTruthy();
  expect(screen.getByText('Earliest unpaid: Dec 15, 2026')).toBeTruthy();
  expect(screen.getByText('Installment 2')).toBeTruthy();
  expect(mockMark).toHaveBeenCalledWith('installment-1');
  expect(mockReconcile).toHaveBeenCalled();
  alert.mockRestore();
});

it('creates a loan without another payment amount and keeps a request ID on retry', async () => {
  mockCreate.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('loan-1');
  await render(<LoansScreen />);
  await screen.findByText('No loans yet.');
  await fireEvent.press(screen.getByRole('button', { name: 'Add loan' }));
  await screen.findByLabelText('Loan name');
  await fireEvent.changeText(screen.getByLabelText('Loan name'), 'Motorcycle Loan');
  await fireEvent.changeText(screen.getByLabelText('Monthly payment (PHP)'), '3500');
  await fireEvent.changeText(screen.getByLabelText('First due date (YYYY-MM-DD)'), '2026-11-15');
  await fireEvent.changeText(screen.getByLabelText('Months to pay'), '12');
  await fireEvent.press(screen.getByRole('button', { name: 'Save loan' }));
  await screen.findByText('offline');
  await fireEvent.press(screen.getByRole('button', { name: 'Save loan' }));
  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(2));
  expect(mockCreate.mock.calls[0]).toEqual(mockCreate.mock.calls[1]);
  await screen.findByText('0 of 12 months paid');
});

it('offers a confirmed correction for a paid installment', async () => {
  currentLoan = { ...initial, paid_months: 1, next_due_date: '2026-12-15' };
  currentNext = second;
  currentPaid = [{ ...first, paid_at: '2026-11-15T01:00:00Z' }];
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockSetPaid.mockImplementation(async () => {
    currentLoan = initial;
    currentPaid = [];
    currentNext = first;
  });
  await render(<LoansScreen initialLoanId="loan-1" />);
  await screen.findByText('1 of 12 months paid');
  await fireEvent.press(screen.getByRole('button', { name: 'Correct installment 1' }));
  const buttons = alert.mock.calls[0]?.[2];
  const confirm = Array.isArray(buttons)
    ? buttons.find((button) => button.text === 'Mark unpaid')
    : null;
  await act(async () => {
    await confirm?.onPress?.();
  });
  await waitFor(() => expect(screen.getByText('0 of 12 months paid')).toBeTruthy());
  expect(mockSetPaid).toHaveBeenCalledWith('installment-1', false);
});

it('shows all ten overdue months separately from one due-today payment and targets the selected ID', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-31T18:00:00Z'));
  currentLoan = {
    ...initial,
    total_months: 12,
    first_due_date: '2026-01-01',
    next_due_date: '2026-01-01',
  };
  currentOverdue = Array.from({ length: 10 }, (_, index) => ({
    ...first,
    id: `overdue-${index + 1}`,
    installment_number: index + 1,
    due_date: `2026-${String(index + 1).padStart(2, '0')}-01`,
  }));
  currentNext = { ...first, id: 'due-today', installment_number: 11, due_date: '2026-11-01' };
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  await render(<LoansScreen initialLoanId="loan-1" />);
  await screen.findByText('Overdue Payments');
  await waitFor(() => expect(screen.getByText('Installment 10')).toBeTruthy());
  expect(screen.getByText('Installment 11')).toBeTruthy();
  expect(screen.queryByText('Installment 12')).toBeNull();
  expect(screen.getAllByText(/₱.*Overdue$/)).toHaveLength(10);
  expect(mockNext).toHaveBeenCalledWith('owner', 'loan-1', '2026-11-01');
  expect(mockListInstallments).toHaveBeenCalledWith('owner', 'loan-1', 'overdue', '2026-11-01');
  await fireEvent.press(screen.getByRole('button', { name: 'Mark installment 3 paid' }));
  const buttons = alert.mock.calls[0]?.[2];
  const confirm = Array.isArray(buttons)
    ? buttons.find((button) => button.text === 'Mark as paid')
    : null;
  await act(async () => {
    await confirm?.onPress?.();
  });
  await waitFor(() => expect(screen.queryByText('Installment 3')).toBeNull());
  expect(mockMark).toHaveBeenCalledWith('overdue-3');
  expect(screen.getByText('Installment 11')).toBeTruthy();
  expect(screen.getByText('1 of 12 months paid')).toBeTruthy();
  expect(screen.getByText('11 months remaining')).toBeTruthy();
  expect(screen.getByText('Paid History')).toBeTruthy();
  expect(screen.getByText('Installment 2')).toBeTruthy();
});

it('does not call an overdue-only loan paid off, and labels an all-paid loan Paid Off', async () => {
  currentLoan = {
    ...initial,
    total_months: 1,
    first_due_date: '2026-01-01',
    next_due_date: '2026-01-01',
  };
  currentNext = null;
  currentOverdue = [{ ...first, due_date: '2026-01-01' }];
  const view = await render(<LoansScreen initialLoanId="loan-1" />);
  await screen.findByText('No upcoming installment remains. Review Overdue Payments below.');
  expect(screen.queryByText('Paid Off')).toBeNull();
  await view.unmount();
  currentLoan = { ...currentLoan, paid_months: 1, next_due_date: null, next_installment_id: null };
  currentOverdue = [];
  currentPaid = [{ ...first, due_date: '2026-01-01', paid_at: '2026-01-02T00:00:00Z' }];
  await render(<LoansScreen initialLoanId="loan-1" />);
  await waitFor(() => expect(screen.getByText('Paid Off')).toBeTruthy());
});
