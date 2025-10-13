-- Add Recommendation System Tables
-- Migration: add_recommendation_system
-- This migration adds tables for tracking user interactions and building personalized recommendations

-- User interaction events for recommendation engine
CREATE TABLE IF NOT EXISTS user_interactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  interaction_type TEXT NOT NULL CHECK (
    interaction_type IN ('view', 'like', 'save', 'share', 'question', 'answer', 'time_spent')
  ),
  score INTEGER NOT NULL,
  metadata TEXT, -- JSON string for additional data like time_spent_seconds
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id),
  FOREIGN KEY (thread_id) REFERENCES threads (id)
);

CREATE INDEX idx_user_interactions_user ON user_interactions(user_id, created_at DESC);
CREATE INDEX idx_user_interactions_thread ON user_interactions(thread_id, created_at DESC);
CREATE INDEX idx_user_interactions_type ON user_interactions(interaction_type, created_at DESC);

-- User preference profiles (cached)
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  category_affinities TEXT NOT NULL DEFAULT '{}', -- JSON: {"tech": 45, "science": 30, ...}
  favorite_creators TEXT DEFAULT '[]', -- JSON: ["creator1", "creator2"]
  total_engagement_score INTEGER DEFAULT 0,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id)
);

-- Thread recommendation cache
CREATE TABLE IF NOT EXISTS recommendation_cache (
  user_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  score REAL NOT NULL,
  recommendation_type TEXT NOT NULL CHECK (
    recommendation_type IN ('personalized', 'exploration', 'trending', 'cold_start')
  ),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, thread_id),
  FOREIGN KEY (user_id) REFERENCES users (id),
  FOREIGN KEY (thread_id) REFERENCES threads (id)
);

CREATE INDEX idx_recommendation_cache_user ON recommendation_cache(user_id, score DESC, expires_at);
CREATE INDEX idx_recommendation_cache_expires ON recommendation_cache(expires_at);

