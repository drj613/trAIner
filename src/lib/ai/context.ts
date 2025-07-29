import { Database } from '@/types/database';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Workout = Database['public']['Tables']['workouts']['Row'];

export interface ConversationContext {
  userId: string;
  profile?: Profile;
  currentWorkout?: Workout;
  recentWorkouts?: Workout[];
  trainerPersona: string;
  conversationHistory: any[];
}

export class ContextManager {
  private context: Map<string, ConversationContext> = new Map();

  getContext(userId: string): ConversationContext | undefined {
    return this.context.get(userId);
  }

  setContext(userId: string, context: ConversationContext): void {
    this.context.set(userId, context);
  }

  updateContext(
    userId: string,
    updates: Partial<ConversationContext>
  ): void {
    const existing = this.context.get(userId);
    if (existing) {
      this.context.set(userId, { ...existing, ...updates });
    }
  }

  clearContext(userId: string): void {
    this.context.delete(userId);
  }

  // Build context for AI prompts
  buildPromptContext(context: ConversationContext): string {
    const parts = [];

    if (context.profile) {
      parts.push(`User Profile:
- Age: ${context.profile.age}
- Fitness Level: ${context.profile.fitness_level}
- Goals: ${context.profile.goals?.join(', ')}
- Injuries: ${context.profile.injuries?.join(', ') || 'None'}
- Equipment: ${context.profile.equipment_access?.join(', ') || 'None'}`);
    }

    if (context.currentWorkout) {
      parts.push(`Current Workout: ${context.currentWorkout.title}`);
    }

    return parts.join('\n\n');
  }
}