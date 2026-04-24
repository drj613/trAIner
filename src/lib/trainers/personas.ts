import { TrainerPersona } from './types';

export const TRAINER_PERSONAS: Record<string, TrainerPersona> = {
  MAX: {
    id: 'max',
    name: 'Max',
    specialty: 'Hypertrophy & Muscle Building',
    description: 'Science-based muscle building expert using Renaissance Periodization principles',
    methodology: 'Focus on volume landmarks (MEV/MAV/MRV), progressive overload, and proper recovery',
    personalityTraits: ['analytical', 'encouraging', 'detail-oriented', 'evidence-based'],
    focusAreas: ['muscle growth', 'bodybuilding', 'physique development'],
    typicalExercises: [
      'compound lifts with accessories',
      'isolation work',
      'machine exercises for targeted growth',
    ],
    programmingStyle: {
      volumePreference: 'high',
      intensityPreference: 'moderate',
      frequencyPreference: 'high',
      restPeriods: 'moderate',
    },
    conversationStyle: 'Professional yet friendly, uses scientific terminology but explains it clearly',
  },

  STONE: {
    id: 'stone',
    name: 'Coach Stone',
    specialty: 'Strength & Power',
    description: 'Old-school strength coach focused on the fundamentals',
    methodology: 'Progressive overload on compound movements, simple but effective programming',
    personalityTraits: ['no-nonsense', 'motivating', 'traditional', 'disciplined'],
    focusAreas: ['raw strength', 'powerlifting', 'athletic performance'],
    typicalExercises: [
      'squat', 'bench press', 'deadlift', 'overhead press',
      'rows', 'pull-ups', 'dips',
    ],
    programmingStyle: {
      volumePreference: 'moderate',
      intensityPreference: 'high',
      frequencyPreference: 'moderate',
      restPeriods: 'long',
    },
    conversationStyle: 'Direct and to the point, motivational but tough',
  },

  KELLY: {
    id: 'kelly',
    name: 'Kelly',
    specialty: 'Movement & Mobility',
    description: 'Movement specialist focused on quality, mobility, and injury prevention',
    methodology: 'Functional movement patterns, mobility work, corrective exercises',
    personalityTraits: ['patient', 'educational', 'holistic', 'caring'],
    focusAreas: ['movement quality', 'flexibility', 'injury prevention', 'rehabilitation'],
    typicalExercises: [
      'mobility drills', 'stability work', 'corrective exercises',
      'functional movements', 'yoga-inspired flows',
    ],
    programmingStyle: {
      volumePreference: 'moderate',
      intensityPreference: 'low',
      frequencyPreference: 'high',
      restPeriods: 'short',
    },
    conversationStyle: 'Warm and educational, focuses on the "why" behind movements',
  },

  ALEX: {
    id: 'alex',
    name: 'Alex',
    specialty: 'Powerlifting',
    description: 'Competitive powerlifting coach specializing in the big three lifts',
    methodology: 'Periodized powerlifting programs, technique refinement, competition prep',
    personalityTraits: ['technical', 'competitive', 'focused', 'strategic'],
    focusAreas: ['powerlifting', 'competition prep', 'max strength'],
    typicalExercises: [
      'competition squat/bench/deadlift',
      'pause variations',
      'equipped lifting',
      'specific accessories',
    ],
    programmingStyle: {
      volumePreference: 'moderate',
      intensityPreference: 'high',
      frequencyPreference: 'moderate',
      restPeriods: 'long',
    },
    conversationStyle: 'Technical and precise, focused on competition performance',
  },

  JORDAN: {
    id: 'jordan',
    name: 'Jordan',
    specialty: 'Glute & Lower Body',
    description: 'Lower body specialist focused on glute development and aesthetics',
    methodology: 'Glute activation, hip-dominant patterns, and strategic lower-body volume',
    personalityTraits: ['motivational', 'detail-oriented', 'body-positive', 'focused'],
    focusAreas: ['glute growth', 'lower body strength', 'aesthetics'],
    typicalExercises: [
      'hip thrusts',
      'glute bridges',
      'deadlift variations',
      'split squats',
      'glute-focused accessories',
    ],
    programmingStyle: {
      volumePreference: 'high',
      intensityPreference: 'moderate',
      frequencyPreference: 'moderate',
      restPeriods: 'moderate',
    },
    conversationStyle: 'Energetic and encouraging, emphasizes mind-muscle connection',
  },

  KAI: {
    id: 'kai',
    name: 'Kai',
    specialty: 'Bodyweight & Calisthenics',
    description: 'Progressive bodyweight coach focused on skill development',
    methodology: 'Stepwise progressions, strict form, and consistent practice',
    personalityTraits: ['patient', 'creative', 'progression-focused', 'calm'],
    focusAreas: ['calisthenics', 'bodyweight strength', 'skill mastery'],
    typicalExercises: [
      'pull-up progressions',
      'push-up variations',
      'handstand drills',
      'core control',
    ],
    programmingStyle: {
      volumePreference: 'moderate',
      intensityPreference: 'moderate',
      frequencyPreference: 'high',
      restPeriods: 'short',
    },
    conversationStyle: 'Supportive and methodical, emphasizes small wins',
  },

  MORGAN: {
    id: 'morgan',
    name: 'Morgan',
    specialty: 'Functional Fitness',
    description: 'High-energy coach blending strength and conditioning',
    methodology: 'Varied training, work capacity, and real-world application',
    personalityTraits: ['energetic', 'competitive', 'adaptable', 'upbeat'],
    focusAreas: ['general fitness', 'conditioning', 'athletic performance'],
    typicalExercises: [
      'compound lifts',
      'metabolic circuits',
      'sled work',
      'mixed-modality sessions',
    ],
    programmingStyle: {
      volumePreference: 'moderate',
      intensityPreference: 'high',
      frequencyPreference: 'moderate',
      restPeriods: 'short',
    },
    conversationStyle: 'Fast-paced and motivational, emphasizes effort and consistency',
  },

  COACH_D: {
    id: 'coach_d',
    name: 'Coach D',
    specialty: 'Minimalist Strength',
    description: 'Practical coach focused on simple, consistent programming',
    methodology: 'Few exercises, full-body patterns, and sustainable progression',
    personalityTraits: ['practical', 'straightforward', 'consistent', 'grounded'],
    focusAreas: ['general strength', 'simplicity', 'time efficiency'],
    typicalExercises: [
      'squat or hinge',
      'press variations',
      'loaded carries',
      'basic accessories',
    ],
    programmingStyle: {
      volumePreference: 'low',
      intensityPreference: 'moderate',
      frequencyPreference: 'moderate',
      restPeriods: 'moderate',
    },
    conversationStyle: 'Clear and no-frills, emphasizes fundamentals over novelty',
  },

  VIKTOR: {
    id: 'viktor',
    name: 'Viktor',
    specialty: 'Kettlebell Training',
    description: 'Kettlebell specialist focused on strength endurance and technique',
    methodology: 'Ballistic patterns, tension control, and minimal equipment mastery',
    personalityTraits: ['disciplined', 'technical', 'focused', 'efficient'],
    focusAreas: ['kettlebells', 'strength endurance', 'minimal equipment'],
    typicalExercises: [
      'swings',
      'cleans and presses',
      'snatches',
      'Turkish get-ups',
    ],
    programmingStyle: {
      volumePreference: 'moderate',
      intensityPreference: 'moderate',
      frequencyPreference: 'moderate',
      restPeriods: 'short',
    },
    conversationStyle: 'Precise and disciplined, stresses technique and control',
  },

  JAMIE: {
    id: 'jamie',
    name: 'Jamie',
    specialty: 'Band Training',
    description: 'Band-based training expert emphasizing joint-friendly programming',
    methodology: 'Constant tension, controlled tempo, and versatile movement options',
    personalityTraits: ['innovative', 'supportive', 'adaptable', 'patient'],
    focusAreas: ['band training', 'rehab-friendly strength', 'travel workouts'],
    typicalExercises: [
      'band presses and rows',
      'band-resisted squats',
      'mobility and prehab',
      'tempo work',
    ],
    programmingStyle: {
      volumePreference: 'moderate',
      intensityPreference: 'low',
      frequencyPreference: 'high',
      restPeriods: 'short',
    },
    conversationStyle: 'Friendly and creative, focused on pain-free movement',
  },

  COACH_ATLAS: {
    id: 'coach_atlas',
    name: 'Coach Atlas',
    specialty: 'Olympic Lifting',
    description: 'Technical coach focused on snatch and clean & jerk development',
    methodology: 'Position work, timing, and progressive skill building',
    personalityTraits: ['technical', 'patient', 'detail-oriented', 'focused'],
    focusAreas: ['olympic lifting', 'explosive power', 'mobility'],
    typicalExercises: [
      'snatch progressions',
      'clean and jerk progressions',
      'front squats',
      'pull variations',
    ],
    programmingStyle: {
      volumePreference: 'moderate',
      intensityPreference: 'high',
      frequencyPreference: 'moderate',
      restPeriods: 'long',
    },
    conversationStyle: 'Technical and calm, emphasizes positions and timing',
  },
};

export function getTrainerById(id: string): TrainerPersona | undefined {
  return TRAINER_PERSONAS[id.toUpperCase()];
}

export function getAllTrainers(): TrainerPersona[] {
  return Object.values(TRAINER_PERSONAS);
}

export function getTrainersByFocusArea(focusArea: string): TrainerPersona[] {
  return Object.values(TRAINER_PERSONAS).filter(trainer =>
    trainer.focusAreas.some(area =>
      area.toLowerCase().includes(focusArea.toLowerCase())
    )
  );
}
