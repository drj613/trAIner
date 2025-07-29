import { createClient } from '@/lib/supabase/server';
import { Database } from '@/types/database';

type Profile = Database['public']['Tables']['profiles']['Row'];
type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];
type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

export class ProfileService {
  static async getProfile(userId: string): Promise<Profile | null> {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }

    return data;
  }

  static async createProfile(profile: ProfileInsert): Promise<Profile | null> {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('profiles')
      .insert(profile)
      .select()
      .single();

    if (error) {
      console.error('Error creating profile:', error);
      return null;
    }

    return data;
  }

  static async updateProfile(
    userId: string,
    updates: ProfileUpdate
  ): Promise<Profile | null> {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      return null;
    }

    return data;
  }

  static async hasCompletedOnboarding(userId: string): Promise<boolean> {
    const profile = await this.getProfile(userId);
    
    return !!(
      profile?.age &&
      profile?.fitness_level &&
      profile?.goals &&
      profile?.goals.length > 0
    );
  }
}