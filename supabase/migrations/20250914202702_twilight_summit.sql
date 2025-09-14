-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT,
  handle TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Private conversations
CREATE TABLE public.private_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages (for private conversations)
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES public.private_conversations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  sender TEXT NOT NULL CHECK (sender IN ('user', 'ai')),
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Public threads
CREATE TABLE public.threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  creator_id UUID REFERENCES auth.users(id) NOT NULL,
  category TEXT,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Questions within threads
CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID REFERENCES public.threads(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Answers to questions
CREATE TABLE public.answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  is_ai BOOLEAN DEFAULT false,
  is_pinned BOOLEAN DEFAULT false,
  interaction_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comments on answers
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  answer_id UUID REFERENCES public.answers(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  parent_id UUID REFERENCES public.comments(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Profiles
CREATE POLICY "Users can read all profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Private conversations
CREATE POLICY "Users can manage own conversations" ON public.private_conversations 
  FOR ALL USING (auth.uid() = user_id);

-- Messages
CREATE POLICY "Users can manage own conversation messages" ON public.messages 
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.private_conversations 
      WHERE id = conversation_id AND user_id = auth.uid()
    )
  );

-- Public threads
CREATE POLICY "Anyone can read public threads" ON public.threads FOR SELECT USING (is_public = true);
CREATE POLICY "Users can create threads" ON public.threads FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Users can update own threads" ON public.threads FOR UPDATE USING (auth.uid() = creator_id);

-- Questions
CREATE POLICY "Anyone can read questions in public threads" ON public.questions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.threads WHERE id = thread_id AND is_public = true)
);
CREATE POLICY "Thread creators can manage questions" ON public.questions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.threads WHERE id = thread_id AND creator_id = auth.uid())
);

-- Answers
CREATE POLICY "Anyone can read answers to public questions" ON public.answers FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.questions q 
    JOIN public.threads t ON q.thread_id = t.id 
    WHERE q.id = question_id AND t.is_public = true
  )
);
CREATE POLICY "Users can create answers" ON public.answers FOR INSERT WITH CHECK (
  auth.uid() = user_id OR user_id IS NULL
);
CREATE POLICY "Users can update own answers" ON public.answers FOR UPDATE USING (auth.uid() = user_id);

-- Comments
CREATE POLICY "Anyone can read comments on public answers" ON public.comments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.answers a
    JOIN public.questions q ON a.question_id = q.id
    JOIN public.threads t ON q.thread_id = t.id
    WHERE a.id = answer_id AND t.is_public = true
  )
);
CREATE POLICY "Users can create comments" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own comments" ON public.comments FOR UPDATE USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_conversations_user_id ON public.private_conversations(user_id);
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_threads_created_at ON public.threads(created_at DESC);
CREATE INDEX idx_questions_thread_id ON public.questions(thread_id);
CREATE INDEX idx_answers_question_id ON public.answers(question_id);
CREATE INDEX idx_comments_answer_id ON public.comments(answer_id);

-- Functions for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.private_conversations 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_threads_updated_at BEFORE UPDATE ON public.threads 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();