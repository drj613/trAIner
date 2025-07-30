export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  trainerPersona?: string;
  metadata?: Record<string, unknown>;
}

export interface ChatSession {
  id: string;
  userId: string;
  messages: Message[];
  trainerPersona: string;
  workoutContext?: string;
  createdAt: Date;
  updatedAt: Date;
}