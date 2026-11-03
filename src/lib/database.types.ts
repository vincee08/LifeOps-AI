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
export type WorkoutMeasurement = 'reps' | 'weighted_reps' | 'duration';
export type ExerciseRow = {
  id: string;
  user_id: string;
  client_request_id: string;
  name: string;
  measurement_kind: WorkoutMeasurement;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};
export type WorkoutSessionRow = {
  id: string;
  user_id: string;
  client_request_id: string;
  title: string;
  planned_date: string | null;
  performed_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};
export type WorkoutSessionExerciseRow = {
  id: string;
  user_id: string;
  session_id: string;
  exercise_id: string;
  position: number;
  name_snapshot: string;
  measurement_kind: WorkoutMeasurement;
  sets: number | null;
  reps: number | null;
  weight_kg: string | null;
  duration_seconds: number | null;
};
export type WorkoutProgressRow = Omit<WorkoutSessionExerciseRow, 'id' | 'position'> & {
  performed_date: string;
};

export type Database = {
  public: {
    Tables: {
      exercises: {
        Row: ExerciseRow;
        Insert: Pick<ExerciseRow, 'client_request_id' | 'name' | 'measurement_kind'>;
        Update: Partial<Pick<ExerciseRow, 'name' | 'measurement_kind' | 'archived_at'>>;
        Relationships: [];
      };
      workout_sessions: {
        Row: WorkoutSessionRow & { last_request_id: string; last_request_fingerprint: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      workout_session_exercises: {
        Row: Omit<WorkoutSessionExerciseRow, 'weight_kg'> & { weight_kg: number | null };
        Insert: never;
        Update: never;
        Relationships: [];
      };
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
      workout_progress_read: { Row: WorkoutProgressRow; Relationships: [] };
      loan_summary_read: { Row: LoanRow; Relationships: [] };
      loan_installment_read: { Row: LoanInstallmentRow; Relationships: [] };
    };
    Functions: {
      save_workout_session: {
        Args: {
          p_session_id: string | null;
          p_request_id: string;
          p_expected_updated_at: string | null;
          p_title: string;
          p_planned_date: string | null;
          p_performed_date: string | null;
          p_entries: {
            exercise_id: string;
            sets: number | null;
            reps: number | null;
            weight_kg: string | null;
            duration_seconds: number | null;
          }[];
        };
        Returns: string;
      };
      delete_workout_session: {
        Args: { p_session_id: string; p_expected_updated_at: string };
        Returns: boolean;
      };
      workout_week_activity: {
        Args: { p_today: string };
        Returns: { week_start: string; session_count: number }[];
      };
      set_loan_installment_paid: {
        Args: { p_installment_id: string; p_paid: boolean };
        Returns: string | null;
      };
    };
    Enums: { task_priority: TaskPriority; workout_measurement: WorkoutMeasurement };
    CompositeTypes: Record<string, never>;
  };
};
