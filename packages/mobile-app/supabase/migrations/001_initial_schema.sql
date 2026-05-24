-- Ayto SportIQ: Initial Schema
-- Run this migration first

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  sports TEXT[] DEFAULT ARRAY['badminton'],
  unit_preference TEXT DEFAULT 'kmh' CHECK (unit_preference IN ('kmh', 'mph')),
  total_sessions INTEGER DEFAULT 0,
  total_hours REAL DEFAULT 0,
  best_speed_kmh REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sport TEXT NOT NULL DEFAULT 'badminton',
  duration_seconds INTEGER NOT NULL,
  total_frames INTEGER,
  model_version TEXT,
  avg_speed_kmh REAL,
  max_speed_kmh REAL,
  strokes_count INTEGER DEFAULT 0,
  dominant_stroke TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_created_at ON sessions(created_at DESC);

CREATE TABLE session_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  avg_speed_kmh REAL,
  max_speed_kmh REAL,
  shuttle_detection_rate REAL,
  stroke_distribution JSONB,
  dominant_stroke TEXT,
  court_coverage_score REAL,
  consistency_score REAL,
  speed_timeline JSONB
);

CREATE TABLE stroke_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  frame_start INTEGER,
  frame_peak INTEGER,
  frame_end INTEGER,
  stroke_type TEXT NOT NULL,
  confidence REAL,
  speed_kmh REAL,
  elbow_angle REAL,
  wrist_velocity REAL,
  court_x REAL,
  court_y REAL,
  angle_at_contact REAL
);
CREATE INDEX idx_stroke_events_session_id ON stroke_events(session_id);

CREATE TABLE pro_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name TEXT NOT NULL,
  sport TEXT NOT NULL DEFAULT 'badminton',
  smash_speed_kmh REAL,
  avg_elbow_angle REAL,
  avg_wrist_velocity REAL,
  footwork_score REAL,
  serve_speed_kmh REAL,
  drop_accuracy REAL,
  consistency_score REAL,
  country TEXT,
  dominant_hand TEXT DEFAULT 'right'
);

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE stroke_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_benchmarks ENABLE ROW LEVEL SECURITY;

-- Profiles: user can only read/write their own row
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Sessions: user can only CRUD their own sessions
CREATE POLICY "Users can read own sessions" ON sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON sessions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sessions" ON sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Session metrics: accessible only through session ownership
CREATE POLICY "Users can read own session metrics" ON session_metrics
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM sessions WHERE sessions.id = session_metrics.session_id AND sessions.user_id = auth.uid())
  );
CREATE POLICY "Users can insert own session metrics" ON session_metrics
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM sessions WHERE sessions.id = session_metrics.session_id AND sessions.user_id = auth.uid())
  );

-- Stroke events: accessible only through session ownership
CREATE POLICY "Users can read own stroke events" ON stroke_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM sessions WHERE sessions.id = stroke_events.session_id AND sessions.user_id = auth.uid())
  );
CREATE POLICY "Users can insert own stroke events" ON stroke_events
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM sessions WHERE sessions.id = stroke_events.session_id AND sessions.user_id = auth.uid())
  );

-- Pro benchmarks: read-only for all authenticated users
CREATE POLICY "Authenticated users can read pro benchmarks" ON pro_benchmarks
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================
-- SEED DATA: Pro Benchmarks
-- ============================================================

INSERT INTO pro_benchmarks (player_name, sport, smash_speed_kmh, avg_elbow_angle, avg_wrist_velocity, footwork_score, serve_speed_kmh, drop_accuracy, consistency_score, country)
VALUES
  ('Viktor Axelsen', 'badminton', 419, 165, 12.4, 92, 198, 88, 94, 'Denmark'),
  ('Srikanth Kidambi', 'badminton', 372, 158, 10.8, 85, 182, 82, 87, 'India'),
  ('Pusarla V. Sindhu', 'badminton', 356, 160, 11.2, 88, 175, 86, 90, 'India'),
  ('Kento Momota', 'badminton', 343, 155, 10.5, 90, 170, 92, 91, 'Japan'),
  ('Carolina Marin', 'badminton', 348, 157, 10.9, 86, 168, 84, 89, 'Spain');
