# 🚀 AI Workout Routine Generator - Solo Developer MVP Roadmap

## Overview
This roadmap is designed for a solo developer to build a proof of concept for an AI-powered workout routine generator with the help of AI pair programming.

## 🎯 Minimum Viable Proof of Concept (2-4 weeks)

### Core Features
1. **AI Workout Generation**: Generate basic workouts based on user input
2. **Chat Modifications**: Users can modify workouts through natural conversation
3. **Export Functionality**: Export workouts to simple formats (markdown/text/JSON)
4. **Web-First**: Focus on web app, mobile can wait

## 🛠️ Tech Stack

- **Frontend**: Next.js 14 (App Router)
- **Backend**: Next.js API routes (no separate backend needed)
- **Database**: Supabase (PostgreSQL + Auth + Realtime)
- **AI**: Vercel AI SDK (multi-provider support)
  - Primary: OpenAI GPT-4
  - Fallback: Anthropic Claude
  - Local Testing: Ollama
- **Hosting**: Vercel (zero DevOps)
- **Styling**: Tailwind CSS
- **Type Safety**: TypeScript

## 📅 Week 1-2 Sprint Plan

### Day 1-2: Project Setup & Authentication
```bash
# Initial setup commands
npx create-next-app@latest trainer-app --typescript --tailwind --app
cd trainer-app
npm install ai @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/ollama
npm install @supabase/supabase-js @supabase/auth-helpers-nextjs
```

**Tasks:**
- [ ] Create Supabase project
- [ ] Setup environment variables
  ```env
  NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
  NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
  OPENAI_API_KEY=your_openai_key
  ANTHROPIC_API_KEY=your_anthropic_key (optional)
  AI_PROVIDER=openai # or anthropic, ollama
  ```
- [ ] Implement basic auth flow (email/password)
- [ ] Create simple user profile page

### Day 3-5: AI Integration with Vercel AI SDK
**Tasks:**
- [ ] Configure AI provider registry
  ```typescript
  // lib/ai/provider.ts
  import { openai } from '@ai-sdk/openai';
  import { anthropic } from '@ai-sdk/anthropic';
  import { ollama } from '@ai-sdk/ollama';
  ```
- [ ] Create "Max" trainer persona (hypertrophy specialist)
- [ ] Implement workout generation endpoint
- [ ] Add streaming support for real-time generation
- [ ] Create basic workout data structure
- [ ] Add provider fallback logic

### Day 6-8: Core Chat Feature
**Tasks:**
- [ ] Build chat UI component with Vercel AI SDK's `useChat` hook
- [ ] Implement conversation persistence in Supabase
- [ ] Add workout modification logic
- [ ] Create context-aware prompt engineering
- [ ] Handle chat history and memory
- [ ] Add loading states and error handling

### Day 9-10: Export & Polish
**Tasks:**
- [ ] Implement export functionality
  - [ ] Markdown format
  - [ ] JSON format
  - [ ] Plain text format
- [ ] Add copy-to-clipboard feature
- [ ] Optional: Provider switching UI
- [ ] Basic responsive design
- [ ] Deploy to Vercel
- [ ] Test with different AI providers

## 📊 Database Schema (Supabase)

```sql
-- Minimal schema for MVP
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  email TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE workouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  workout_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  workout_id UUID REFERENCES workouts(id) ON DELETE CASCADE,
  messages JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## ✅ Proof of Concept Success Criteria

- [ ] User can sign up and log in
- [ ] User can input fitness goals and constraints
- [ ] AI generates appropriate workout plan
- [ ] Chat interface works with streaming responses
- [ ] User can request modifications (e.g., "I don't have dumbbells")
- [ ] Workout updates based on conversation
- [ ] Export feature produces usable workout plans
- [ ] Works with at least 2 AI providers
- [ ] Deployed and accessible via Vercel URL

## 🚀 Next Steps After PoC Success

If the concept proves viable with positive user feedback:

1. **Expand Trainer Personas** (Week 3)
   - Add "Coach Stone" (strength fundamentals)
   - Add "Kelly" (mobility & movement)

2. **Improve UX/UI** (Week 4)
   - Better mobile responsiveness
   - Workout visualization
   - Exercise illustrations/videos

3. **Add Workout Tracking** (Week 5-6)
   - Basic session logging
   - Progress tracking
   - Simple analytics

4. **Beta Testing** (Week 7-8)
   - Recruit 10-20 beta users
   - Gather feedback
   - Iterate based on user input

## 💡 Key Advantages of This Approach

1. **Speed**: Can build and iterate quickly as solo developer
2. **Cost Control**: Test with local models during development
3. **Flexibility**: Easy to switch AI providers based on cost/quality
4. **No DevOps**: Vercel handles all deployment complexity
5. **Type Safety**: TypeScript prevents common errors
6. **Real-time UX**: Streaming responses feel more interactive

## 🎯 Development Philosophy

- **Ship Fast**: Get working prototype in 2 weeks
- **User Feedback**: Let users guide feature development
- **AI First**: Lean on AI for complex logic, focus on UX
- **Provider Agnostic**: Avoid vendor lock-in from day one
- **Progressive Enhancement**: Start simple, add complexity based on validation

## 📝 Daily Development Checklist

- [ ] Morning: Review yesterday's progress
- [ ] Code for 2-3 hour blocks with breaks
- [ ] Test with multiple AI providers
- [ ] Commit changes frequently
- [ ] Evening: Plan next day's tasks
- [ ] Use AI assistant for pair programming throughout

---

**Remember**: The goal is to validate the core concept quickly. Don't over-engineer. Get user feedback early and often!