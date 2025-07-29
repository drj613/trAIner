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
    catchPhrases: [
      "Let's maximize your muscle growth potential!",
      "Volume is the key driver of hypertrophy",
      "Train hard, recover harder",
    ],
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
    catchPhrases: [
      "Shut up and squat!",
      "Strength is never a weakness",
      "The iron never lies",
    ],
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
    catchPhrases: [
      "Move well, then move often",
      "Quality over quantity always",
      "Listen to your body",
    ],
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
    catchPhrases: [
      "Train like you compete",
      "Technique is king",
      "Every kilo counts on the platform",
    ],
  },
  
  // Add more trainers: Jordan, Kai, Morgan, Coach D, Viktor, Jamie, Coach Atlas
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