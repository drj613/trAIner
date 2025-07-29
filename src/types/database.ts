export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string;
          full_name: string | null;
          avatar_url: string | null;
          age: number | null;
          weight_lbs: number | null;
          height_inches: number | null;
          biological_sex: 'male' | 'female' | 'other' | null;
          fitness_level: 'beginner' | 'intermediate' | 'advanced' | null;
          goals: string[] | null;
          injuries: string[] | null;
          equipment_access: string[] | null;
          preferred_trainer: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          age?: number | null;
          weight_lbs?: number | null;
          height_inches?: number | null;
          biological_sex?: 'male' | 'female' | 'other' | null;
          fitness_level?: 'beginner' | 'intermediate' | 'advanced' | null;
          goals?: string[] | null;
          injuries?: string[] | null;
          equipment_access?: string[] | null;
          preferred_trainer?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          age?: number | null;
          weight_lbs?: number | null;
          height_inches?: number | null;
          biological_sex?: 'male' | 'female' | 'other' | null;
          fitness_level?: 'beginner' | 'intermediate' | 'advanced' | null;
          goals?: string[] | null;
          injuries?: string[] | null;
          equipment_access?: string[] | null;
          preferred_trainer?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      exercises: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          muscle_groups_primary: string[];
          muscle_groups_secondary: string[] | null;
          equipment_required: string[] | null;
          difficulty_level: number;
          movement_pattern: string | null;
          instructions: string | null;
          safety_notes: string | null;
          video_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          muscle_groups_primary: string[];
          muscle_groups_secondary?: string[] | null;
          equipment_required?: string[] | null;
          difficulty_level: number;
          movement_pattern?: string | null;
          instructions?: string | null;
          safety_notes?: string | null;
          video_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          muscle_groups_primary?: string[];
          muscle_groups_secondary?: string[] | null;
          equipment_required?: string[] | null;
          difficulty_level?: number;
          movement_pattern?: string | null;
          instructions?: string | null;
          safety_notes?: string | null;
          video_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      workouts: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          trainer_persona: string;
          exercises: any[]; // JSON array of exercise objects
          duration_minutes: number | null;
          difficulty: number;
          focus_areas: string[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          trainer_persona: string;
          exercises: any[];
          duration_minutes?: number | null;
          difficulty: number;
          focus_areas?: string[] | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string | null;
          trainer_persona?: string;
          exercises?: any[];
          duration_minutes?: number | null;
          difficulty?: number;
          focus_areas?: string[] | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      workout_sessions: {
        Row: {
          id: string;
          user_id: string;
          workout_id: string;
          started_at: string;
          completed_at: string | null;
          exercises_completed: any[] | null;
          notes: string | null;
          rating: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          workout_id: string;
          started_at?: string;
          completed_at?: string | null;
          exercises_completed?: any[] | null;
          notes?: string | null;
          rating?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          workout_id?: string;
          started_at?: string;
          completed_at?: string | null;
          exercises_completed?: any[] | null;
          notes?: string | null;
          rating?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      chat_history: {
        Row: {
          id: string;
          user_id: string;
          trainer_persona: string;
          messages: any[]; // JSON array of message objects
          workout_context: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          trainer_persona: string;
          messages: any[];
          workout_context?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          trainer_persona?: string;
          messages?: any[];
          workout_context?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}