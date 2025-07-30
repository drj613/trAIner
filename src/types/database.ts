// Generated TypeScript types for the database schema
// This file should be updated whenever the database schema changes

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          user_id: string
          full_name: string | null
          avatar_url: string | null
          age: number | null
          weight_lbs: number | null
          height_inches: number | null
          biological_sex: 'male' | 'female' | 'other' | null
          fitness_level: 'beginner' | 'intermediate' | 'advanced' | null
          goals: string[]
          injuries: string[]
          equipment_access: string[]
          preferred_trainer: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          full_name?: string | null
          avatar_url?: string | null
          age?: number | null
          weight_lbs?: number | null
          height_inches?: number | null
          biological_sex?: 'male' | 'female' | 'other' | null
          fitness_level?: 'beginner' | 'intermediate' | 'advanced' | null
          goals?: string[]
          injuries?: string[]
          equipment_access?: string[]
          preferred_trainer?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          full_name?: string | null
          avatar_url?: string | null
          age?: number | null
          weight_lbs?: number | null
          height_inches?: number | null
          biological_sex?: 'male' | 'female' | 'other' | null
          fitness_level?: 'beginner' | 'intermediate' | 'advanced' | null
          goals?: string[]
          injuries?: string[]
          equipment_access?: string[]
          preferred_trainer?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      exercises: {
        Row: {
          id: string
          name: string
          description: string | null
          muscle_groups_primary: string[]
          muscle_groups_secondary: string[]
          equipment_required: string[]
          difficulty_level: number
          movement_pattern: string | null
          instructions: string | null
          safety_notes: string | null
          video_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          muscle_groups_primary: string[]
          muscle_groups_secondary?: string[]
          equipment_required?: string[]
          difficulty_level: number
          movement_pattern?: string | null
          instructions?: string | null
          safety_notes?: string | null
          video_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          muscle_groups_primary?: string[]
          muscle_groups_secondary?: string[]
          equipment_required?: string[]
          difficulty_level?: number
          movement_pattern?: string | null
          instructions?: string | null
          safety_notes?: string | null
          video_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      workouts: {
        Row: {
          id: string
          user_id: string
          title: string
          description: string | null
          trainer_persona: string
          exercises: Json
          duration_minutes: number | null
          difficulty: number
          focus_areas: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          description?: string | null
          trainer_persona: string
          exercises?: Json
          duration_minutes?: number | null
          difficulty: number
          focus_areas?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          description?: string | null
          trainer_persona?: string
          exercises?: Json
          duration_minutes?: number | null
          difficulty?: number
          focus_areas?: string[]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      workout_sessions: {
        Row: {
          id: string
          user_id: string
          workout_id: string
          started_at: string
          completed_at: string | null
          exercises_completed: Json
          notes: string | null
          rating: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          workout_id: string
          started_at?: string
          completed_at?: string | null
          exercises_completed?: Json
          notes?: string | null
          rating?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          workout_id?: string
          started_at?: string
          completed_at?: string | null
          exercises_completed?: Json
          notes?: string | null
          rating?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sessions_workout_id_fkey"
            columns: ["workout_id"]
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          }
        ]
      }
      chat_history: {
        Row: {
          id: string
          user_id: string
          trainer_persona: string
          messages: Json
          workout_context: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          trainer_persona: string
          messages?: Json
          workout_context?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          trainer_persona?: string
          messages?: Json
          workout_context?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      trainer_preferences: {
        Row: {
          id: string
          user_id: string
          trainer_persona: string
          preference_score: number
          interaction_count: number
          last_interaction: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          trainer_persona: string
          preference_score?: number
          interaction_count?: number
          last_interaction?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          trainer_persona?: string
          preference_score?: number
          interaction_count?: number
          last_interaction?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      exercise_categories: {
        Row: {
          id: string
          name: string
          description: string | null
          parent_category_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          parent_category_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          parent_category_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_categories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            referencedRelation: "exercise_categories"
            referencedColumns: ["id"]
          }
        ]
      }
      workout_templates: {
        Row: {
          id: string
          name: string
          description: string | null
          trainer_persona: string
          template_data: Json
          difficulty: number
          duration_minutes: number | null
          focus_areas: string[]
          equipment_required: string[]
          is_public: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          trainer_persona: string
          template_data?: Json
          difficulty: number
          duration_minutes?: number | null
          focus_areas?: string[]
          equipment_required?: string[]
          is_public?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          trainer_persona?: string
          template_data?: Json
          difficulty?: number
          duration_minutes?: number | null
          focus_areas?: string[]
          equipment_required?: string[]
          is_public?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      exercise_substitutions: {
        Row: {
          id: string
          primary_exercise_id: string
          substitute_exercise_id: string
          substitution_reason: string | null
          compatibility_score: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          primary_exercise_id: string
          substitute_exercise_id: string
          substitution_reason?: string | null
          compatibility_score?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          primary_exercise_id?: string
          substitute_exercise_id?: string
          substitution_reason?: string | null
          compatibility_score?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_substitutions_primary_exercise_id_fkey"
            columns: ["primary_exercise_id"]
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_substitutions_substitute_exercise_id_fkey"
            columns: ["substitute_exercise_id"]
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          }
        ]
      }
      user_measurements: {
        Row: {
          id: string
          user_id: string
          measurement_type: 'weight' | 'body_fat' | 'muscle_mass' | 'waist' | 'chest' | 'arms' | 'thighs' | 'custom'
          value: number
          unit: 'lbs' | 'kg' | 'inches' | 'cm' | 'percent'
          notes: string | null
          measured_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          measurement_type: 'weight' | 'body_fat' | 'muscle_mass' | 'waist' | 'chest' | 'arms' | 'thighs' | 'custom'
          value: number
          unit: 'lbs' | 'kg' | 'inches' | 'cm' | 'percent'
          notes?: string | null
          measured_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          measurement_type?: 'weight' | 'body_fat' | 'muscle_mass' | 'waist' | 'chest' | 'arms' | 'thighs' | 'custom'
          value?: number
          unit?: 'lbs' | 'kg' | 'inches' | 'cm' | 'percent'
          notes?: string | null
          measured_at?: string
          created_at?: string
        }
        Relationships: []
      }
      workout_exercise_logs: {
        Row: {
          id: string
          workout_session_id: string
          exercise_id: string
          sets_completed: number
          reps_completed: number[]
          weights_used: number[]
          rest_seconds: number[]
          difficulty_rating: number | null
          form_notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workout_session_id: string
          exercise_id: string
          sets_completed?: number
          reps_completed?: number[]
          weights_used?: number[]
          rest_seconds?: number[]
          difficulty_rating?: number | null
          form_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workout_session_id?: string
          exercise_id?: string
          sets_completed?: number
          reps_completed?: number[]
          weights_used?: number[]
          rest_seconds?: number[]
          difficulty_rating?: number | null
          form_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_exercise_logs_workout_session_id_fkey"
            columns: ["workout_session_id"]
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_exercise_logs_exercise_id_fkey"
            columns: ["exercise_id"]
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          }
        ]
      }
      user_goals: {
        Row: {
          id: string
          user_id: string
          goal_type: 'strength' | 'endurance' | 'weight_loss' | 'weight_gain' | 'muscle_building' | 'flexibility' | 'custom'
          title: string
          description: string | null
          target_value: number | null
          target_unit: string | null
          current_value: number
          target_date: string | null
          priority: number
          status: 'active' | 'completed' | 'paused' | 'cancelled'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          goal_type: 'strength' | 'endurance' | 'weight_loss' | 'weight_gain' | 'muscle_building' | 'flexibility' | 'custom'
          title: string
          description?: string | null
          target_value?: number | null
          target_unit?: string | null
          current_value?: number
          target_date?: string | null
          priority?: number
          status?: 'active' | 'completed' | 'paused' | 'cancelled'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          goal_type?: 'strength' | 'endurance' | 'weight_loss' | 'weight_gain' | 'muscle_building' | 'flexibility' | 'custom'
          title?: string
          description?: string | null
          target_value?: number | null
          target_unit?: string | null
          current_value?: number
          target_date?: string | null
          priority?: number
          status?: 'active' | 'completed' | 'paused' | 'cancelled'
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_profile: {
        Args: {
          user_uuid: string
        }
        Returns: {
          profile_data: Json
        }[]
      }
      get_user_recent_workouts: {
        Args: {
          user_uuid: string
          limit_count?: number
        }
        Returns: {
          workout_data: Json
        }[]
      }
      get_trainer_chat_history: {
        Args: {
          user_uuid: string
          trainer_name: string
        }
        Returns: {
          chat_data: Json
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Additional type definitions for convenience
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Exercise = Database['public']['Tables']['exercises']['Row']
export type Workout = Database['public']['Tables']['workouts']['Row']
export type WorkoutSession = Database['public']['Tables']['workout_sessions']['Row']
export type ChatHistory = Database['public']['Tables']['chat_history']['Row']
export type TrainerPreference = Database['public']['Tables']['trainer_preferences']['Row']
export type ExerciseCategory = Database['public']['Tables']['exercise_categories']['Row']
export type WorkoutTemplate = Database['public']['Tables']['workout_templates']['Row']
export type ExerciseSubstitution = Database['public']['Tables']['exercise_substitutions']['Row']
export type UserMeasurement = Database['public']['Tables']['user_measurements']['Row']
export type WorkoutExerciseLog = Database['public']['Tables']['workout_exercise_logs']['Row']
export type UserGoal = Database['public']['Tables']['user_goals']['Row']

// Insert types
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
export type ExerciseInsert = Database['public']['Tables']['exercises']['Insert']
export type WorkoutInsert = Database['public']['Tables']['workouts']['Insert']
export type WorkoutSessionInsert = Database['public']['Tables']['workout_sessions']['Insert']
export type ChatHistoryInsert = Database['public']['Tables']['chat_history']['Insert']
export type TrainerPreferenceInsert = Database['public']['Tables']['trainer_preferences']['Insert']
export type UserMeasurementInsert = Database['public']['Tables']['user_measurements']['Insert']
export type WorkoutExerciseLogInsert = Database['public']['Tables']['workout_exercise_logs']['Insert']
export type UserGoalInsert = Database['public']['Tables']['user_goals']['Insert']

// Update types
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update']
export type ExerciseUpdate = Database['public']['Tables']['exercises']['Update']
export type WorkoutUpdate = Database['public']['Tables']['workouts']['Update']
export type WorkoutSessionUpdate = Database['public']['Tables']['workout_sessions']['Update']
export type ChatHistoryUpdate = Database['public']['Tables']['chat_history']['Update']
export type TrainerPreferenceUpdate = Database['public']['Tables']['trainer_preferences']['Update']
export type UserMeasurementUpdate = Database['public']['Tables']['user_measurements']['Update']
export type WorkoutExerciseLogUpdate = Database['public']['Tables']['workout_exercise_logs']['Update']
export type UserGoalUpdate = Database['public']['Tables']['user_goals']['Update']

// Specific structured types for JSONB fields
export interface WorkoutExercise {
  exercise_id: string
  sets: number
  reps: number | number[]
  weight?: number
  rest_seconds?: number
  notes?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'trainer'
  content: string
  timestamp: string
  metadata?: Record<string, unknown>
}

export interface WorkoutTemplateData {
  exercises: WorkoutExercise[]
  warm_up?: WorkoutExercise[]
  cool_down?: WorkoutExercise[]
  instructions?: string
  notes?: string
}