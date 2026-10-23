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

export type Database = {
  public: {
    Tables: {
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
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: { task_priority: TaskPriority };
    CompositeTypes: Record<string, never>;
  };
};
