export interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: string; // Can be a range like "8-12"
  rest: number; // Rest in seconds
  weight?: number;
  notes?: string;
  targetMuscles: string[];
  equipment?: string[];
}

export interface WorkoutPlan {
  id: string;
  name: string;
  description: string;
  exercises: Exercise[];
  duration: number; // Duration in minutes
  difficulty: 1 | 2 | 3 | 4 | 5;
  focusAreas: string[];
  trainerNotes?: string;
}

export interface WorkoutPreferences {
  duration: number;
  difficulty: number;
  equipment: string[];
  focusAreas: string[];
  excludeExercises?: string[];
}

export interface ProgressionMetrics {
  volume: number;
  intensity: number;
  frequency: number;
  recovery: number;
}