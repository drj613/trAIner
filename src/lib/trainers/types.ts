export interface TrainerPersona {
  id: string;
  name: string;
  avatar?: string;
  specialty: string;
  description: string;
  methodology: string;
  personalityTraits: string[];
  focusAreas: string[];
  typicalExercises: string[];
  programmingStyle: {
    volumePreference: 'low' | 'moderate' | 'high';
    intensityPreference: 'low' | 'moderate' | 'high';
    frequencyPreference: 'low' | 'moderate' | 'high';
    restPeriods: 'short' | 'moderate' | 'long';
  };
  conversationStyle: string;
  catchPhrases?: string[];
}