import { render, screen, fireEvent } from '@testing-library/react-native';
import { TodayLoans } from '@/features/today/TodayLoans';

const mockNavigate = jest.fn();
const mockList = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate }),
  useFocusEffect: (effect: () => void) => {
    const React = require('react');
    React.useEffect(effect, [effect]);
  },
}));
jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ state: { status: 'signed-in', session: { user: { id: 'owner' } } } }),
}));
jest.mock('@/features/loans/loans-service', () => ({
  listTodayLoanInstallments: (...args: unknown[]) => mockList(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockImplementation(async (_owner: string, _date: string, section: string) => ({
    items:
      section === 'overdue'
        ? [
            {
              id: 'installment-1',
              loan_id: 'loan-1',
              user_id: 'owner',
              title: 'Motorcycle',
              monthly_payment_centavos: '350000',
              due_date: '2026-11-14',
              paid_at: null,
              installment_number: 1,
              archived_at: null,
              created_at: '',
            },
          ]
        : [
            {
              id: 'installment-2',
              loan_id: 'loan-2',
              user_id: 'owner',
              title: 'Laptop',
              monthly_payment_centavos: '250000',
              due_date: '2026-11-15',
              paid_at: null,
              installment_number: 2,
              archived_at: null,
              created_at: '',
            },
          ],
    total: 1,
    hasMore: false,
  }));
});

it('shows due and overdue installments from owner-scoped source queries', async () => {
  await render(
    <TodayLoans
      window={{ date: '2026-11-15', now: '', start: '', end: '', timezone: 'Asia/Manila' }}
    />,
  );
  await screen.findByText('Motorcycle');
  expect(screen.getByText('Laptop')).toBeTruthy();
  expect(mockList).toHaveBeenCalledWith('owner', '2026-11-15', 'overdue');
  expect(mockList).toHaveBeenCalledWith('owner', '2026-11-15', 'today');
  fireEvent.press(screen.getByRole('button', { name: 'Open Motorcycle loan due 2026-11-14' }));
  expect(mockNavigate).toHaveBeenCalledWith({
    pathname: '/(tabs)/loans',
    params: { loanId: 'loan-1' },
  });
});
