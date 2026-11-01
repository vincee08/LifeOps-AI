import { act, render, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';

import { LegacyBillNotificationCleanup } from '@/features/notifications/LegacyBillNotificationCleanup';

const mockBillCleanup = jest.fn();
const mockTaskCleanup = jest.fn();
jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ state: { status: 'signed-out' } }),
}));
jest.mock('@/features/notifications/legacy-bill-cleanup', () => ({
  cleanupLegacyBillNotifications: () => mockBillCleanup(),
  cleanupLegacyAndroidTaskChannel: () => mockTaskCleanup(),
}));

it('shows a warning after cleanup failure and retries safely on resume', async () => {
  const listeners: Array<(state: AppStateStatus) => void> = [];
  const subscription = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type, listener) => {
      listeners.push(listener);
      return { remove: jest.fn() } as NativeEventSubscription;
    });
  mockBillCleanup.mockRejectedValueOnce(new Error('OS unavailable')).mockResolvedValue(undefined);
  mockTaskCleanup.mockResolvedValue(undefined);
  try {
    const view = await render(<LegacyBillNotificationCleanup />);
    expect(
      await view.findByText(
        'Old notification channels could not be cleared. Reopen the app to retry.',
      ),
    ).toBeTruthy();
    await act(async () => {
      for (const listener of listeners) listener('active');
    });
    await waitFor(() =>
      expect(
        view.queryByText(
          'Old notification channels could not be cleared. Reopen the app to retry.',
        ),
      ).toBeNull(),
    );
    expect(mockBillCleanup).toHaveBeenCalledTimes(2);
  } finally {
    subscription.mockRestore();
  }
});
