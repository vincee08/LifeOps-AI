import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { TodayBills } from '@/features/today/TodayBills';
import type { BillItem } from '@/features/money/bills-service';
import type { TodayWindow } from '@/features/today/today-model';

const mockNavigate = jest.fn();
const mockList = jest.fn();
const mockGenerate = jest.fn();
const mockPaid = jest.fn();
const mockReconcile = jest.fn();
jest.mock('expo-crypto', () => ({ randomUUID: () => 'request-id' }));
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
jest.mock('@/features/money/bills-service', () => ({
  generateBillOccurrences: (...args: unknown[]) => mockGenerate(...args),
  listTodayBillItems: (...args: unknown[]) => mockList(...args),
  setBillPaid: (...args: unknown[]) => mockPaid(...args),
}));
jest.mock('@/features/money/bill-notifications', () => ({
  reconcileUpcomingBillReminders: (...args: unknown[]) => mockReconcile(...args),
  billReminderWarning: () => '',
}));

const today: TodayWindow = {
  now: '2026-11-15T00:00:00Z',
  start: '2026-11-14T16:00:00Z',
  end: '2026-11-15T16:00:00Z',
  timezone: 'Asia/Manila',
  date: '2026-11-15',
};
const item: BillItem = {
  bill: {
    id: 'bill',
    user_id: 'owner',
    client_request_id: 'request',
    title: 'Internet',
    category: 'utilities',
    amount_minor: '169900',
    currency_code: 'PHP',
    recurrence: 'none',
    anchor_due_on: '2026-11-15',
    notes: null,
    archived_at: null,
    created_at: '',
    updated_at: '',
  },
  occurrence: {
    id: 'cycle',
    user_id: 'owner',
    bill_id: 'bill',
    ordinal: 0,
    due_on: '2026-11-15',
    amount_minor: '169900',
    status: 'unpaid',
    paid_at: null,
    created_at: '',
    updated_at: '',
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGenerate.mockResolvedValue(undefined);
  mockList.mockImplementation((_owner: string, _date: string, section: string) =>
    Promise.resolve(
      section === 'today'
        ? { items: [item], total: 1, hasMore: false }
        : { items: [], total: 0, hasMore: false },
    ),
  );
  mockPaid.mockResolvedValue(undefined);
  mockReconcile.mockResolvedValue({ status: 'none', count: 0 });
});

it('shows only active due-today and overdue bill occurrences with exact counts', async () => {
  await render(<TodayBills window={today} />);
  expect(await screen.findByText('Bills due today (1)')).toBeTruthy();
  expect(screen.getByText('Internet')).toBeTruthy();
  expect(screen.getByText('₱1,699.00 · Due 2026-11-15')).toBeTruthy();
  expect(screen.queryByText('Overdue bills (0)')).toBeNull();
  expect(mockList).toHaveBeenCalledWith('owner', '2026-11-15', 'today');
  expect(mockGenerate.mock.invocationCallOrder[0]).toBeLessThan(
    mockList.mock.invocationCallOrder[0]!,
  );
});

it('removes a paid occurrence from active Today after persistence', async () => {
  await render(<TodayBills window={today} />);
  await screen.findByText('Internet');
  mockList.mockResolvedValue({ items: [], total: 0, hasMore: false });
  await act(async () =>
    fireEvent.press(screen.getByRole('button', { name: 'Mark Internet paid' })),
  );
  await waitFor(() => expect(mockPaid).toHaveBeenCalledWith(expect.any(String), 'cycle', true));
  await waitFor(() => expect(screen.queryByText('Internet')).toBeNull());
});

it('shows a retryable Bills error when recurring cycles cannot be refreshed', async () => {
  mockGenerate.mockRejectedValue(new Error('offline'));
  await render(<TodayBills window={today} />);
  expect(
    await screen.findAllByText('Bill cycles could not be refreshed. Retry to load Today bills.'),
  ).toHaveLength(2);
  expect(mockList).not.toHaveBeenCalled();
});
