/**
 * Simple Environment Configuration for MVP
 */

export const isDev = process.env.NODE_ENV === 'development';
export const isProd = process.env.NODE_ENV === 'production';

export const config = {
  // App
  appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',

  // Local SQLite storage path (optional; defaults in sqlite.ts)
  sqlite: {
    path: process.env.SQLITE_DB_PATH || './data/trainer.sqlite',
  },

  // AI Services (optional for MVP)
  ai: {
    openaiKey: process.env.OPENAI_API_KEY,
    anthropicKey: process.env.ANTHROPIC_API_KEY,
  },
  
  // Simple feature flags
  features: {
    enableDebugLogging: isDev,
  }
};