import { createClient } from '@/lib/supabase/server';
import { Database } from '@/types/database';

type Workout = Database['public']['Tables']['workouts']['Row'];
type WorkoutInsert = Database['public']['Tables']['workouts']['Insert'];
type WorkoutUpdate = Database['public']['Tables']['workouts']['Update'];

export class WorkoutService {
  static async getWorkouts(userId: string): Promise<Workout[]> {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('workouts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching workouts:', error);
      return [];
    }

    return data || [];
  }

  static async getWorkout(workoutId: string): Promise<Workout | null> {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('workouts')
      .select('*')
      .eq('id', workoutId)
      .single();

    if (error) {
      console.error('Error fetching workout:', error);
      return null;
    }

    return data;
  }

  static async createWorkout(workout: WorkoutInsert): Promise<Workout | null> {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('workouts')
      .insert(workout)
      .select()
      .single();

    if (error) {
      console.error('Error creating workout:', error);
      return null;
    }

    return data;
  }

  static async updateWorkout(
    workoutId: string,
    updates: WorkoutUpdate
  ): Promise<Workout | null> {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('workouts')
      .update(updates)
      .eq('id', workoutId)
      .select()
      .single();

    if (error) {
      console.error('Error updating workout:', error);
      return null;
    }

    return data;
  }

  static async deleteWorkout(workoutId: string): Promise<boolean> {
    const supabase = await createClient();
    
    const { error } = await supabase
      .from('workouts')
      .delete()
      .eq('id', workoutId);

    if (error) {
      console.error('Error deleting workout:', error);
      return false;
    }

    return true;
  }
}