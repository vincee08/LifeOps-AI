import { fireEvent, render, screen } from '@testing-library/react-native';

import { AppButton } from '@/components/ui/AppButton';
import { EmptyState, ErrorState } from '@/components/ui/StateView';

describe('foundational states', () => {
  it('explains an empty screen without inventing records', async () => {
    await render(<EmptyState title="Nothing planned" description="Your plans will appear here." />);

    expect(screen.getByText('Nothing planned')).toBeTruthy();
    expect(screen.getByText('Your plans will appear here.')).toBeTruthy();
  });

  it('offers a working retry action and blocks disabled submissions', async () => {
    const onRetry = jest.fn();
    const onSubmit = jest.fn();
    await render(
      <>
        <ErrorState onRetry={onRetry} />
        <AppButton label="Save" submitting onPress={onSubmit} />
      </>,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
