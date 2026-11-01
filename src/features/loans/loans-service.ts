import { getSupabaseClient } from '@/lib/supabase';
import type { LoanInstallmentRow, LoanRow } from '@/lib/database.types';
import { installmentDate, isLoanDate, parsePesoInput } from './loans-model';

export type Loan = LoanRow;
export type LoanInstallment = LoanInstallmentRow;
export type LoanDraft = {
  title: string;
  monthlyPayment: string;
  firstDueDate: string;
  totalMonths: string;
  notes: string;
};
export const LOAN_PAGE_SIZE = 30;
const loanFields =
  'id,user_id,title,monthly_payment_centavos,first_due_date,total_months,notes,archived_at,created_at,updated_at,paid_months,next_due_date,next_installment_id';
const installmentFields =
  'id,loan_id,user_id,installment_number,due_date,paid_at,created_at,title,monthly_payment_centavos,archived_at';

export function validateLoanDraft(draft: LoanDraft) {
  const title = draft.title.trim();
  const notes = draft.notes.trim();
  if (!title || title.length > 200) throw new Error('Loan name must be 1–200 characters.');
  if (notes.length > 2000) throw new Error('Notes are too long.');
  if (!isLoanDate(draft.firstDueDate))
    throw new Error('Enter a valid first due date (YYYY-MM-DD).');
  if (!/^[1-9][0-9]*$/.test(draft.totalMonths)) throw new Error('Enter the number of months.');
  const totalMonths = Number(draft.totalMonths);
  if (!Number.isSafeInteger(totalMonths) || totalMonths > 600)
    throw new Error('Months must be between 1 and 600.');
  if (installmentDate(draft.firstDueDate, totalMonths) > '2100-12-31')
    throw new Error('Last installment must be by 2100-12-31.');
  return {
    title,
    monthly_payment_centavos: parsePesoInput(draft.monthlyPayment),
    first_due_date: draft.firstDueDate,
    total_months: totalMonths,
    notes: notes || null,
  };
}

export async function getLoan(userId: string, id: string): Promise<Loan | null> {
  const { data, error } = await getSupabaseClient()
    .from('loan_summary_read')
    .select(loanFields)
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('Loan could not be loaded.');
  return data as Loan | null;
}
export async function createLoan(
  requestId: string,
  userId: string,
  draft: LoanDraft,
): Promise<string> {
  const value = validateLoanDraft(draft);
  const { error } = await getSupabaseClient()
    .from('loans')
    .insert({ id: requestId, ...value });
  if (!error) return requestId;
  const saved = await getLoan(userId, requestId);
  if (saved && sameDraft(saved, value)) return requestId;
  throw new Error('Loan could not be saved. Check your connection and retry.');
}
type ValidatedDraft = ReturnType<typeof validateLoanDraft>;
function sameDraft(saved: Loan, value: ValidatedDraft) {
  return (
    saved.title === value.title &&
    saved.monthly_payment_centavos === value.monthly_payment_centavos &&
    saved.first_due_date === value.first_due_date &&
    saved.total_months === value.total_months &&
    saved.notes === value.notes
  );
}
export async function editLoan(userId: string, loan: Loan, draft: LoanDraft): Promise<void> {
  const value = validateLoanDraft(draft);
  const { data, error } = await getSupabaseClient()
    .from('loans')
    .update(value)
    .eq('id', loan.id)
    .eq('user_id', userId)
    .eq('updated_at', loan.updated_at)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) {
    const saved = await getLoan(userId, loan.id);
    if (saved && sameDraft(saved, value)) return;
    throw new Error('Loan changed elsewhere. Reload it and try again.');
  }
}
export async function markInstallmentPaid(id: string): Promise<void> {
  await setInstallmentPaid(id, true);
}
export async function setInstallmentPaid(id: string, paid: boolean): Promise<void> {
  const { error } = await getSupabaseClient().rpc('set_loan_installment_paid', {
    p_installment_id: id,
    p_paid: paid,
  });
  if (error) throw new Error('Installment change could not be confirmed. Reload and try again.');
}
export async function archiveLoan(userId: string, id: string): Promise<void> {
  const { data, error } = await getSupabaseClient()
    .from('loans')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .is('archived_at', null)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data?.length && !(await getLoan(userId, id))?.archived_at)
    throw new Error('Loan could not be archived.');
}
export async function deleteLoan(userId: string, id: string): Promise<void> {
  const { data, error } = await getSupabaseClient()
    .from('loans')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data?.length && (await getLoan(userId, id))) throw new Error('Loan could not be deleted.');
}
export async function listLoans(userId: string, archived: boolean, page = 0) {
  let query = getSupabaseClient()
    .from('loan_summary_read')
    .select(loanFields)
    .eq('user_id', userId);
  query = archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(page * LOAN_PAGE_SIZE, (page + 1) * LOAN_PAGE_SIZE);
  if (error) throw new Error('Loans could not be loaded.');
  return {
    items: ((data ?? []) as Loan[]).slice(0, LOAN_PAGE_SIZE),
    hasMore: (data ?? []).length > LOAN_PAGE_SIZE,
  };
}
export async function getNextLoanPayment(userId: string, loanId: string, localDate: string) {
  const { data, error } = await getSupabaseClient()
    .from('loan_installment_read')
    .select(installmentFields)
    .eq('user_id', userId)
    .eq('loan_id', loanId)
    .is('paid_at', null)
    .gte('due_date', localDate)
    .order('due_date')
    .order('installment_number')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error('Next payment could not be loaded.');
  return data as LoanInstallment | null;
}

export async function listLoanInstallments(
  userId: string,
  loanId: string,
  section: 'overdue' | 'paid',
  localDate: string,
  page = 0,
) {
  let query = getSupabaseClient()
    .from('loan_installment_read')
    .select(installmentFields)
    .eq('user_id', userId)
    .eq('loan_id', loanId);
  query =
    section === 'overdue'
      ? query.is('paid_at', null).lt('due_date', localDate)
      : query.not('paid_at', 'is', null);
  const { data, error } = await query
    .order('due_date', { ascending: section === 'overdue' })
    .order('installment_number', { ascending: section === 'overdue' })
    .range(page * LOAN_PAGE_SIZE, (page + 1) * LOAN_PAGE_SIZE);
  if (error) throw new Error('Installments could not be loaded.');
  return {
    items: ((data ?? []) as LoanInstallment[]).slice(0, LOAN_PAGE_SIZE),
    hasMore: (data ?? []).length > LOAN_PAGE_SIZE,
  };
}
export async function listTodayLoanInstallments(
  userId: string,
  localDate: string,
  section: 'overdue' | 'today',
) {
  let query = getSupabaseClient()
    .from('loan_installment_read')
    .select(installmentFields, { count: 'exact' })
    .eq('user_id', userId)
    .is('archived_at', null)
    .is('paid_at', null);
  query = section === 'overdue' ? query.lt('due_date', localDate) : query.eq('due_date', localDate);
  const { data, count, error } = await query.order('due_date').order('id').range(0, 19);
  if (error || count === null) throw new Error('Today loans could not be loaded.');
  return {
    items: (data ?? []) as LoanInstallment[],
    total: count,
    hasMore: count > (data ?? []).length,
  };
}
export async function listUpcomingReminderInstallments(
  userId: string,
  from: string,
  through: string,
) {
  const { data, error } = await getSupabaseClient()
    .from('loan_installment_read')
    .select(installmentFields)
    .eq('user_id', userId)
    .is('archived_at', null)
    .is('paid_at', null)
    .gte('due_date', from)
    .lte('due_date', through)
    .order('due_date')
    .limit(301);
  if (error || (data ?? []).length > 300)
    throw new Error('Upcoming loan reminders could not be checked.');
  return (data ?? []) as LoanInstallment[];
}
export async function getReminderInstallments(userId: string, ids: string[]) {
  if (!ids.length) return [];
  const { data, error } = await getSupabaseClient()
    .from('loan_installment_read')
    .select(installmentFields)
    .eq('user_id', userId)
    .in('id', ids.slice(0, 100));
  if (error) throw new Error('Scheduled loan reminders could not be checked.');
  return (data ?? []) as LoanInstallment[];
}
