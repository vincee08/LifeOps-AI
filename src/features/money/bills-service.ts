import { getSupabaseClient } from '@/lib/supabase';
import { randomUUID } from 'expo-crypto';
import type { BillRow, BillOccurrenceRow } from '@/lib/database.types';
import {
  BILL_CATEGORIES,
  BILL_RECURRENCES,
  isBillDate,
  parsePesoInput,
  type BillCategory,
  type BillRecurrence,
} from '@/features/money/bills-model';

export type Bill = BillRow;
export type BillOccurrence = BillOccurrenceRow;
export type BillDraft = {
  title: string;
  amount: string;
  due_on: string;
  category: BillCategory;
  recurrence: BillRecurrence;
  notes: string;
};
export type BillItem = { bill: Bill; occurrence: BillOccurrence };
export const BILL_PAGE_SIZE = 30;
const billFields =
  'id,user_id,client_request_id,title,category,amount_minor,currency_code,recurrence,anchor_due_on,notes,archived_at,created_at,updated_at';
const occurrenceFields =
  'id,user_id,bill_id,ordinal,due_on,amount_minor,status,paid_at,created_at,updated_at';

export function validateBillDraft(draft: BillDraft) {
  const title = draft.title.trim();
  const notes = draft.notes.trim();
  if (!title || title.length > 200) throw new Error('Title must be 1–200 characters.');
  if (notes.length > 2000) throw new Error('Notes are too long.');
  if (!BILL_CATEGORIES.includes(draft.category)) throw new Error('Invalid category.');
  if (!BILL_RECURRENCES.includes(draft.recurrence)) throw new Error('Invalid recurrence.');
  if (!isBillDate(draft.due_on)) throw new Error('Enter a valid due date (YYYY-MM-DD).');
  return {
    title,
    notes,
    category: draft.category,
    recurrence: draft.recurrence,
    due_on: draft.due_on,
    amount_minor: parsePesoInput(draft.amount),
  };
}

type Action = 'create' | 'edit' | 'edit_due' | 'set_paid' | 'archive' | 'delete' | 'reconcile';
async function command(action: Action, requestId: string, payload: Record<string, unknown>) {
  const { data, error } = await getSupabaseClient().functions.invoke('bills', {
    body: { action, request_id: requestId, payload },
  });
  if (error || !data?.result) {
    const response = error && 'context' in error ? error.context : null;
    const body = response instanceof Response ? await response.json().catch(() => null) : null;
    throw new Error(
      typeof body?.error === 'string'
        ? body.error
        : 'Bill could not be saved. Check your connection and retry.',
    );
  }
  return data.result as Record<string, unknown>;
}

export async function createBill(requestId: string, draft: BillDraft): Promise<string> {
  const result = await command('create', requestId, validateBillDraft(draft));
  if (typeof result.bill_id !== 'string') throw new Error('Bill save could not be confirmed.');
  return result.bill_id;
}
export async function editBill(requestId: string, id: string, draft: BillDraft): Promise<void> {
  await command('edit', requestId, { id, ...validateBillDraft(draft) });
}
export async function setBillPaid(requestId: string, id: string, paid: boolean): Promise<void> {
  await command('set_paid', requestId, { id, paid });
}
export async function editBillDue(
  requestId: string,
  occurrenceId: string,
  dueOn: string,
): Promise<void> {
  if (!isBillDate(dueOn)) throw new Error('Enter a valid due date (YYYY-MM-DD).');
  await command('edit_due', requestId, { id: occurrenceId, due_on: dueOn });
}
export async function archiveBill(requestId: string, id: string): Promise<void> {
  await command('archive', requestId, { id });
}
export async function deleteBill(requestId: string, id: string): Promise<void> {
  await command('delete', requestId, { id });
}
export async function generateBillOccurrences(): Promise<void> {
  await command('reconcile', randomUUID(), {});
}

async function attachBills(
  userId: string,
  occurrences: BillOccurrence[],
  includeArchived = false,
): Promise<BillItem[]> {
  if (occurrences.length === 0) return [];
  const ids = [...new Set(occurrences.map((item) => item.bill_id))];
  const { data, error } = await getSupabaseClient()
    .from('bill_read')
    .select(billFields)
    .eq('user_id', userId)
    .in('id', ids);
  if (error) throw new Error('Bills could not be loaded. Please try again.');
  const bills = new Map(((data ?? []) as Bill[]).map((bill) => [bill.id, bill]));
  return occurrences.flatMap((occurrence) => {
    const bill = bills.get(occurrence.bill_id);
    return bill && (includeArchived || !bill.archived_at) ? [{ bill, occurrence }] : [];
  });
}

export async function listBillItems(
  userId: string,
  filter: 'overdue' | 'upcoming' | 'paid' | 'archived',
  localDate: string,
  page = 0,
): Promise<{ items: BillItem[]; hasMore: boolean }> {
  let query = getSupabaseClient()
    .from(
      filter === 'archived'
        ? 'archived_bill_occurrence_read'
        : filter === 'paid'
          ? 'bill_occurrence_read'
          : 'active_bill_occurrence_read',
    )
    .select(occurrenceFields)
    .eq('user_id', userId);
  if (filter !== 'archived') query = query.eq('status', filter === 'paid' ? 'paid' : 'unpaid');
  if (filter === 'overdue') query = query.lt('due_on', localDate);
  if (filter === 'upcoming') query = query.gte('due_on', localDate);
  query =
    filter === 'paid'
      ? query.order('paid_at', { ascending: false })
      : query.order('due_on', { ascending: filter !== 'archived' });
  const { data, error } = await query
    .order('id', { ascending: filter !== 'paid' })
    .range(page * BILL_PAGE_SIZE, (page + 1) * BILL_PAGE_SIZE);
  if (error) throw new Error('Bills could not be loaded. Please try again.');
  const rows = (data ?? []) as BillOccurrence[];
  return {
    items: await attachBills(
      userId,
      rows.slice(0, BILL_PAGE_SIZE),
      filter === 'paid' || filter === 'archived',
    ),
    hasMore: rows.length > BILL_PAGE_SIZE,
  };
}

export async function listTodayBillItems(
  userId: string,
  localDate: string,
  section: 'overdue' | 'today',
): Promise<{ items: BillItem[]; total: number; hasMore: boolean }> {
  let query = getSupabaseClient()
    .from('active_bill_occurrence_read')
    .select(occurrenceFields, { count: 'exact' })
    .eq('user_id', userId)
    .eq('status', 'unpaid');
  query = section === 'overdue' ? query.lt('due_on', localDate) : query.eq('due_on', localDate);
  const { data, count, error } = await query.order('due_on').order('id').range(0, 19);
  if (error || count === null) throw new Error('Today bills could not be loaded.');
  const items = await attachBills(userId, (data ?? []) as BillOccurrence[]);
  return { items, total: count, hasMore: count > items.length };
}

export async function listUpcomingReminderBills(userId: string, from: string, through: string) {
  const { data, error } = await getSupabaseClient()
    .from('active_bill_occurrence_read')
    .select(occurrenceFields)
    .eq('user_id', userId)
    .eq('status', 'unpaid')
    .gte('due_on', from)
    .lte('due_on', through)
    .order('due_on')
    .limit(101);
  if (error) throw new Error('Bill reminders could not be checked.');
  if ((data ?? []).length > 100)
    throw new Error('More than 100 upcoming bill reminders need attention.');
  return attachBills(userId, (data ?? []) as BillOccurrence[]);
}

export async function getReminderBillItems(userId: string, ids: string[]) {
  if (!ids.length) return [];
  const { data, error } = await getSupabaseClient()
    .from('bill_occurrence_read')
    .select(occurrenceFields)
    .eq('user_id', userId)
    .in('id', ids.slice(0, 100));
  if (error) throw new Error('Scheduled bill reminders could not be checked.');
  return attachBills(userId, (data ?? []) as BillOccurrence[]);
}
