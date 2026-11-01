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

export type LoanRow = {
  id: string;
  user_id: string;
  title: string;
  monthly_payment_centavos: string;
  first_due_date: string;
  total_months: number;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  paid_months: number;
  next_due_date: string | null;
  next_installment_id: string | null;
};

export type LoanInstallmentRow = {
  id: string;
  loan_id: string;
  user_id: string;
  installment_number: number;
  due_date: string;
  monthly_payment_centavos: string;
  paid_at: string | null;
  created_at: string;
  title: string;
  archived_at: string | null;
};

export type Database = {
  public: {
    Tables: {
      loans: {
        Row: Omit<
          LoanRow,
          'monthly_payment_centavos' | 'paid_months' | 'next_due_date' | 'next_installment_id'
        > & { monthly_payment_centavos: number };
        Insert: Pick<
          LoanRow,
          'id' | 'title' | 'monthly_payment_centavos' | 'first_due_date' | 'total_months' | 'notes'
        >;
        Update: Partial<
          Pick<
            LoanRow,
            | 'title'
            | 'monthly_payment_centavos'
            | 'first_due_date'
            | 'total_months'
            | 'notes'
            | 'archived_at'
          >
        >;
        Relationships: [];
      };
      loan_installments: {
        Row: Omit<LoanInstallmentRow, 'title' | 'archived_at' | 'monthly_payment_centavos'> & {
          monthly_payment_centavos: number;
        };
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
      loan_summary_read: { Row: LoanRow; Relationships: [] };
      loan_installment_read: { Row: LoanInstallmentRow; Relationships: [] };
    };
    Functions: {
      set_loan_installment_paid: {
        Args: { p_installment_id: string; p_paid: boolean };
        Returns: string | null;
      };
    };
    Enums: { task_priority: TaskPriority };
    CompositeTypes: Record<string, never>;
  };
};
