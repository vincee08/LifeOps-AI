export type ProfileRow = {
  id: string;
  display_name: string | null;
  timezone: string;
  currency_code: 'PHP';
  created_at: string;
  updated_at: string;
};

export type TaskPriority = 'high' | 'medium' | 'low';
export type TaskCategory = 'personal' | 'work' | 'other';
export type TaskRow = {
  id: string;
  user_id: string;
  client_request_id: string;
  title: string;
  description: string | null;
  category: TaskCategory;
  priority: TaskPriority;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BillCategory =
  'utilities' | 'housing' | 'subscription' | 'insurance' | 'installment' | 'school' | 'other';
export type BillRecurrence = 'none' | 'weekly' | 'monthly' | 'yearly';
export type BillRow = {
  id: string;
  user_id: string;
  client_request_id: string;
  title: string;
  category: BillCategory;
  amount_minor: string;
  currency_code: 'PHP';
  recurrence: BillRecurrence;
  anchor_due_on: string;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};
export type BillOccurrenceRow = {
  id: string;
  user_id: string;
  bill_id: string;
  ordinal: number;
  due_on: string;
  amount_minor: string;
  status: 'unpaid' | 'paid';
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      bills: {
        Row: Omit<BillRow, 'amount_minor'> & { amount_minor: number };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      bill_occurrences: {
        Row: Omit<BillOccurrenceRow, 'amount_minor'> & { amount_minor: number };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      tasks: {
        Row: TaskRow;
        Insert: Pick<TaskRow, 'user_id' | 'client_request_id' | 'title'> &
          Partial<Pick<TaskRow, 'description' | 'category' | 'priority' | 'due_at'>>;
        Update: Partial<
          Pick<
            TaskRow,
            'title' | 'description' | 'category' | 'priority' | 'due_at' | 'completed_at'
          >
        >;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: {
          id: string;
          display_name?: string | null;
          timezone?: string;
          currency_code?: 'PHP';
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
    };
    Views: {
      bill_read: { Row: BillRow; Relationships: [] };
      bill_occurrence_read: { Row: BillOccurrenceRow; Relationships: [] };
      active_bill_occurrence_read: { Row: BillOccurrenceRow; Relationships: [] };
      archived_bill_occurrence_read: { Row: BillOccurrenceRow; Relationships: [] };
    };
    Functions: Record<string, never>;
    Enums: { task_priority: TaskPriority };
    CompositeTypes: Record<string, never>;
  };
};
