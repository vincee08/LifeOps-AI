import {
  billDueState,
  billListAfterCreate,
  formatPesos,
  isBillDate,
  parsePesoInput,
  pesoInputFromMinor,
} from '@/features/money/bills-model';
import { validateBillDraft } from '@/features/money/bills-service';

it.each([
  ['1699', '169900'],
  ['1699.5', '169950'],
  ['1699.50', '169950'],
  ['2350.50', '235050'],
  ['0.01', '1'],
  ['10000000000', '1000000000000'],
])('parses %s into exact centavos %s', (input, expected) => {
  expect(parsePesoInput(input)).toBe(expected);
  expect(parsePesoInput(pesoInputFromMinor(expected))).toBe(expected);
  expect(formatPesos(expected)).toMatch(/^₱/);
});

it.each([
  '0',
  '0.00',
  '-1',
  '+1',
  '1.234',
  '1,000',
  '₱100',
  '1e3',
  'abc',
  '10000000000.01',
  '999999999999999999999999',
])('rejects invalid peso input %s', (input) => {
  expect(() => parsePesoInput(input)).toThrow();
});

it('validates the minimum bill and required amount/date', () => {
  const draft = {
    title: 'Electricity',
    amount: '1699',
    due_on: '2026-11-15',
    category: 'other',
    recurrence: 'none',
    notes: '',
  } as const;
  expect(validateBillDraft(draft)).toEqual({
    title: 'Electricity',
    amount_minor: '169900',
    due_on: '2026-11-15',
    category: 'other',
    recurrence: 'none',
    notes: '',
  });
  expect(() => validateBillDraft({ ...draft, amount: '' })).toThrow();
  expect(() => validateBillDraft({ ...draft, due_on: '' })).toThrow();
  expect(() => validateBillDraft({ ...draft, category: 'bank' as 'other' })).toThrow();
  expect(() => validateBillDraft({ ...draft, recurrence: 'daily' as 'none' })).toThrow();
  expect(isBillDate('2026-02-30')).toBe(false);
  expect(isBillDate('2028-02-29')).toBe(true);
});

it('derives overdue by local calendar date and removes paid items from active Today', () => {
  expect(billDueState('unpaid', '2026-11-14', '2026-11-15')).toBe('overdue');
  expect(billDueState('unpaid', '2026-11-15', '2026-11-15')).toBe('today');
  expect(billDueState('unpaid', '2026-11-16', '2026-11-15')).toBe('upcoming');
  expect(billDueState('paid', '2026-11-14', '2026-11-15')).toBe('paid');
});

it('opens Upcoming after creating an overdue recurring bill so future cycles are visible', () => {
  expect(billListAfterCreate('2026-09-30', 'monthly', '2026-10-25')).toBe('upcoming');
  expect(billListAfterCreate('2026-09-30', 'none', '2026-10-25')).toBe('overdue');
  expect(billListAfterCreate('2027-01-31', 'monthly', '2026-10-25')).toBe('upcoming');
});
