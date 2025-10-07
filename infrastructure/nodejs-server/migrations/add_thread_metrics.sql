-- Add thread metrics columns to Node.js SQLite database
-- This should be run after deploying the Supabase migration

-- Add metric columns to threads table
ALTER TABLE threads ADD COLUMN view_count INTEGER DEFAULT 0;
ALTER TABLE threads ADD COLUMN like_count INTEGER DEFAULT 0;
ALTER TABLE threads ADD COLUMN save_count INTEGER DEFAULT 0;
ALTER TABLE threads ADD COLUMN share_count INTEGER DEFAULT 0;

-- Add metric columns to questions table
ALTER TABLE questions ADD COLUMN like_count INTEGER DEFAULT 0;
ALTER TABLE questions ADD COLUMN save_count INTEGER DEFAULT 0;
ALTER TABLE questions ADD COLUMN share_count INTEGER DEFAULT 0;

-- Add metric columns to answers table
ALTER TABLE answers ADD COLUMN like_count INTEGER DEFAULT 0;
ALTER TABLE answers ADD COLUMN save_count INTEGER DEFAULT 0;
ALTER TABLE answers ADD COLUMN share_count INTEGER DEFAULT 0;
ALTER TABLE answers ADD COLUMN comment_count INTEGER DEFAULT 0;

-- Add metric columns to comments table
ALTER TABLE comments ADD COLUMN like_count INTEGER DEFAULT 0;
ALTER TABLE comments ADD COLUMN save_count INTEGER DEFAULT 0;
ALTER TABLE comments ADD COLUMN share_count INTEGER DEFAULT 0;

-- Create thread views table
CREATE TABLE IF NOT EXISTS thread_views (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  user_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (thread_id) REFERENCES threads (id),
  FOREIGN KEY (user_id) REFERENCES users (id)
);

-- Create likes table
CREATE TABLE IF NOT EXISTS likes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('thread', 'question', 'answer', 'comment')),
  content_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, content_type, content_id),
  FOREIGN KEY (user_id) REFERENCES users (id)
);

-- Create saves table
CREATE TABLE IF NOT EXISTS saves (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('thread', 'question', 'answer', 'comment')),
  content_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, content_type, content_id),
  FOREIGN KEY (user_id) REFERENCES users (id)
);

-- Create shares table
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  content_type TEXT NOT NULL CHECK (content_type IN ('thread', 'question', 'answer', 'comment')),
  content_id TEXT NOT NULL,
  share_method TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_thread_views_thread_id ON thread_views(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_views_user_id ON thread_views(user_id);
CREATE INDEX IF NOT EXISTS idx_likes_content ON likes(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id);
CREATE INDEX IF NOT EXISTS idx_saves_content ON saves(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_saves_user_id ON saves(user_id);
CREATE INDEX IF NOT EXISTS idx_shares_content ON shares(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_shares_user_id ON shares(user_id);
