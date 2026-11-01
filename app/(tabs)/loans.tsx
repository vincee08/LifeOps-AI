import { useLocalSearchParams } from 'expo-router';

import { LoansScreen } from '@/features/loans/LoansScreen';

export default function LoansTab() {
  const { loanId } = useLocalSearchParams<{ loanId?: string }>();
  return <LoansScreen key={loanId ?? ''} initialLoanId={loanId || undefined} />;
}
