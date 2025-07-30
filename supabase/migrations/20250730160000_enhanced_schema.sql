-- Migration: 002_enhanced_schema
-- Description: Enhanced database schema with additional tables and optimizations
-- Created: 2025-07-30

-- Create trainer_preferences table
CREATE TABLE IF NOT EXISTS trainer_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  trainer_persona TEXT NOT NULL,
  preference_score INTEGER CHECK (preference_score >= 1 AND preference_score <= 10) DEFAULT 5,
  interaction_count INTEGER DEFAULT 0,
  last_interaction TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, trainer_persona)
);

-- Create exercise_categories table for better organization
CREATE TABLE IF NOT EXISTS exercise_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  parent_category_id UUID REFERENCES exercise_categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create workout_templates table for pre-defined workout structures
CREATE TABLE IF NOT EXISTS workout_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  trainer_persona TEXT NOT NULL,
  template_data JSONB NOT NULL DEFAULT '{}',
  difficulty INTEGER CHECK (difficulty >= 1 AND difficulty <= 5) NOT NULL,
  duration_minutes INTEGER CHECK (duration_minutes > 0),
  focus_areas TEXT[] DEFAULT '{}',
  equipment_required TEXT[] DEFAULT '{}',
  is_public BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create exercise_substitutions table for alternative exercises
CREATE TABLE IF NOT EXISTS exercise_substitutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  primary_exercise_id UUID REFERENCES exercises(id) ON DELETE CASCADE NOT NULL,
  substitute_exercise_id UUID REFERENCES exercises(id) ON DELETE CASCADE NOT NULL,
  substitution_reason TEXT,
  compatibility_score INTEGER CHECK (compatibility_score >= 1 AND compatibility_score <= 10) DEFAULT 8,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(primary_exercise_id, substitute_exercise_id)
);

-- Create user_measurements table for tracking progress
CREATE TABLE IF NOT EXISTS user_measurements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  measurement_type TEXT NOT NULL CHECK (measurement_type IN ('weight', 'body_fat', 'muscle_mass', 'waist', 'chest', 'arms', 'thighs', 'custom')),
  value DECIMAL(8,2) NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('lbs', 'kg', 'inches', 'cm', 'percent')),
  notes TEXT,
  measured_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create workout_exercise_logs table for detailed exercise tracking
CREATE TABLE IF NOT EXISTS workout_exercise_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workout_session_id UUID REFERENCES workout_sessions(id) ON DELETE CASCADE NOT NULL,
  exercise_id UUID REFERENCES exercises(id) ON DELETE CASCADE NOT NULL,
  sets_completed INTEGER DEFAULT 0,
  reps_completed INTEGER[] DEFAULT '{}',
  weights_used DECIMAL(6,2)[] DEFAULT '{}',
  rest_seconds INTEGER[] DEFAULT '{}',
  difficulty_rating INTEGER CHECK (difficulty_rating >= 1 AND difficulty_rating <= 5),
  form_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_goals table for detailed goal tracking
CREATE TABLE IF NOT EXISTS user_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  goal_type TEXT NOT NULL CHECK (goal_type IN ('strength', 'endurance', 'weight_loss', 'weight_gain', 'muscle_building', 'flexibility', 'custom')),
  title TEXT NOT NULL,
  description TEXT,
  target_value DECIMAL(8,2),
  target_unit TEXT,
  current_value DECIMAL(8,2) DEFAULT 0,
  target_date DATE,
  priority INTEGER CHECK (priority >= 1 AND priority <= 5) DEFAULT 3,
  status TEXT CHECK (status IN ('active', 'completed', 'paused', 'cancelled')) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing triggers for new tables (only if the function exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE TRIGGER update_trainer_preferences_updated_at BEFORE UPDATE ON trainer_preferences
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    CREATE TRIGGER update_exercise_categories_updated_at BEFORE UPDATE ON exercise_categories
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    CREATE TRIGGER update_workout_templates_updated_at BEFORE UPDATE ON workout_templates
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    CREATE TRIGGER update_exercise_substitutions_updated_at BEFORE UPDATE ON exercise_substitutions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    CREATE TRIGGER update_workout_exercise_logs_updated_at BEFORE UPDATE ON workout_exercise_logs
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    CREATE TRIGGER update_user_goals_updated_at BEFORE UPDATE ON user_goals
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Enable RLS for new tables
ALTER TABLE trainer_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_exercise_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_templates ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for trainer_preferences
CREATE POLICY "Users can view own trainer preferences" ON trainer_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trainer preferences" ON trainer_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trainer preferences" ON trainer_preferences
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own trainer preferences" ON trainer_preferences
  FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for user_measurements
CREATE POLICY "Users can view own measurements" ON user_measurements
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own measurements" ON user_measurements
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own measurements" ON user_measurements
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own measurements" ON user_measurements
  FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for workout_exercise_logs (tied to workout sessions)
CREATE POLICY "Users can view own workout exercise logs" ON workout_exercise_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workout_sessions ws 
      WHERE ws.id = workout_exercise_logs.workout_session_id 
      AND ws.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own workout exercise logs" ON workout_exercise_logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM workout_sessions ws 
      WHERE ws.id = workout_exercise_logs.workout_session_id 
      AND ws.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own workout exercise logs" ON workout_exercise_logs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM workout_sessions ws 
      WHERE ws.id = workout_exercise_logs.workout_session_id 
      AND ws.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own workout exercise logs" ON workout_exercise_logs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM workout_sessions ws 
      WHERE ws.id = workout_exercise_logs.workout_session_id 
      AND ws.user_id = auth.uid()
    )
  );

-- Create RLS policies for user_goals
CREATE POLICY "Users can view own goals" ON user_goals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own goals" ON user_goals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own goals" ON user_goals
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own goals" ON user_goals
  FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for workout_templates
CREATE POLICY "Users can view public and own workout templates" ON workout_templates
  FOR SELECT USING (is_public = true OR created_by = auth.uid());

CREATE POLICY "Users can insert own workout templates" ON workout_templates
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own workout templates" ON workout_templates
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own workout templates" ON workout_templates
  FOR DELETE USING (auth.uid() = created_by);

-- Public read access for categories and substitutions
ALTER TABLE exercise_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view exercise categories" ON exercise_categories FOR SELECT USING (true);

ALTER TABLE exercise_substitutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view exercise substitutions" ON exercise_substitutions FOR SELECT USING (true);

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_workouts_user_id ON workouts(user_id);
CREATE INDEX IF NOT EXISTS idx_workouts_trainer_persona ON workouts(trainer_persona);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_id ON workout_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_workout_id ON workout_sessions(workout_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_trainer_persona ON chat_history(trainer_persona);
CREATE INDEX IF NOT EXISTS idx_exercises_difficulty_level ON exercises(difficulty_level);
CREATE INDEX IF NOT EXISTS idx_exercises_muscle_groups_primary ON exercises USING GIN(muscle_groups_primary);
CREATE INDEX IF NOT EXISTS idx_exercises_equipment_required ON exercises USING GIN(equipment_required);
CREATE INDEX IF NOT EXISTS idx_trainer_preferences_user_id ON trainer_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_trainer_preferences_trainer_persona ON trainer_preferences(trainer_persona);
CREATE INDEX IF NOT EXISTS idx_user_measurements_user_id ON user_measurements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_measurements_type_measured_at ON user_measurements(measurement_type, measured_at);
CREATE INDEX IF NOT EXISTS idx_workout_exercise_logs_session_id ON workout_exercise_logs(workout_session_id);
CREATE INDEX IF NOT EXISTS idx_workout_exercise_logs_exercise_id ON workout_exercise_logs(exercise_id);
CREATE INDEX IF NOT EXISTS idx_user_goals_user_id ON user_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_user_goals_status ON user_goals(status);
CREATE INDEX IF NOT EXISTS idx_workout_templates_trainer_persona ON workout_templates(trainer_persona);
CREATE INDEX IF NOT EXISTS idx_workout_templates_difficulty ON workout_templates(difficulty);
CREATE INDEX IF NOT EXISTS idx_exercise_substitutions_primary ON exercise_substitutions(primary_exercise_id);
CREATE INDEX IF NOT EXISTS idx_exercise_substitutions_substitute ON exercise_substitutions(substitute_exercise_id);

-- Add helpful functions for common queries
CREATE OR REPLACE FUNCTION get_user_profile(user_uuid UUID)
RETURNS TABLE(profile_data JSONB) AS $$
BEGIN
  RETURN QUERY
  SELECT to_jsonb(p.*) 
  FROM profiles p 
  WHERE p.user_id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_recent_workouts(user_uuid UUID, limit_count INTEGER DEFAULT 10)
RETURNS TABLE(workout_data JSONB) AS $$
BEGIN
  RETURN QUERY
  SELECT to_jsonb(w.*) 
  FROM workouts w 
  WHERE w.user_id = user_uuid 
  ORDER BY w.created_at DESC 
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_trainer_chat_history(user_uuid UUID, trainer_name TEXT)
RETURNS TABLE(chat_data JSONB) AS $$
BEGIN
  RETURN QUERY
  SELECT to_jsonb(ch.*) 
  FROM chat_history ch 
  WHERE ch.user_id = user_uuid AND ch.trainer_persona = trainer_name
  ORDER BY ch.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;