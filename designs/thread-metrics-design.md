# Thread Metrics Design: Views, Hearts, Saves, and Shares

## Overview

This document outlines the design for adding four new metrics to threads: **Views**, **Hearts** (likes), **Saves** (bookmarks), and **Shares**. These metrics will enhance user engagement and provide better insights into thread popularity and user interaction patterns.

## Current System Analysis

### Existing Metrics
- **Questions**: Count of questions in a thread
- **Answers**: Count of answers to questions  
- **Comments**: Count of comments on answers
- **Interaction Count**: Sum of questions + answers (displayed in UI)

### Current Database Schema
```sql
-- Threads table
CREATE TABLE public.threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  creator_id UUID REFERENCES auth.users(id) NOT NULL,
  category TEXT,
  is_public BOOLEAN DEFAULT true,
  question_count INTEGER DEFAULT 0,
  answer_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Questions table
CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID REFERENCES public.threads(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Answers table  
CREATE TABLE public.answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  is_ai BOOLEAN DEFAULT false,
  is_pinned BOOLEAN DEFAULT false,
  interaction_count INTEGER DEFAULT 0, -- Comments count
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comments table
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  answer_id UUID REFERENCES public.answers(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  parent_id UUID REFERENCES public.comments(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Current API Endpoints
- `GET /api/threads` - Get all public threads with metrics
- `GET /api/threads/{threadId}` - Get specific thread with questions
- `GET /api/threads/{threadId}/answers` - Get all answers for thread
- `POST /api/threads/{threadId}/questions` - Add question to thread
- `POST /api/questions/{questionId}/answers` - Add answer to question
- `GET /api/answers/{answerId}/comments` - Get comments for answer
- `POST /api/answers/{answerId}/comments` - Add comment to answer

## New Metrics Design

### 1. Views (Thread Views)

**Purpose**: Track how many times a thread has been opened/viewed.

**Database Schema**:
```sql
-- Add view_count to threads table
ALTER TABLE public.threads ADD COLUMN view_count INTEGER DEFAULT 0;

-- Optional: Track individual views for analytics
CREATE TABLE public.thread_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID REFERENCES public.threads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id), -- NULL for anonymous views
  ip_address INET, -- For anonymous tracking
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for performance
CREATE INDEX idx_thread_views_thread_id ON public.thread_views(thread_id);
CREATE INDEX idx_thread_views_user_id ON public.thread_views(user_id);
```

**API Endpoints**:
```javascript
// Increment view count when thread is opened
POST /api/threads/{threadId}/views
{
  "userId": "optional-user-id", // NULL for anonymous
  "ipAddress": "optional-ip"
}

Response:
{
  "success": true,
  "viewCount": 123
}

// Get view analytics (optional, for admin/creator)
GET /api/threads/{threadId}/views
Response:
{
  "totalViews": 123,
  "uniqueUsers": 45,
  "recentViews": [
    {
      "userId": "user-id",
      "timestamp": "2024-01-01T12:00:00Z"
    }
  ]
}
```

### 2. Likes (Likes/Reactions)

**Purpose**: Allow users to heart/like questions, answers, and comments.

**Database Schema**:
```sql
-- Likes table for all content types
CREATE TABLE public.likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('question', 'answer', 'comment')),
  content_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, content_type, content_id)
);

-- Add heart_count to relevant tables
ALTER TABLE public.questions ADD COLUMN heart_count INTEGER DEFAULT 0;
ALTER TABLE public.answers ADD COLUMN heart_count INTEGER DEFAULT 0;
ALTER TABLE public.comments ADD COLUMN heart_count INTEGER DEFAULT 0;

-- Indexes
CREATE INDEX idx_likes_content ON public.likes(content_type, content_id);
CREATE INDEX idx_likes_user_id ON public.likes(user_id);
```

**API Endpoints**:
```javascript
// Heart/unheart content
POST /api/likes/{contentType}/{contentId}
{
  "userId": "user-id",
  "action": "heart" // or "unheart"
}

Response:
{
  "success": true,
  "action": "hearted", // or "unhearted"
  "heartCount": 15,
  "isLiked": true // or false
}

// Get likes for specific content
GET /api/likes/{contentType}/{contentId}
Response:
{
  "heartCount": 15,
  "isLiked": false, // based on current user
  "recentLikes": [
    {
      "userId": "user-id",
      "userName": "John Doe",
      "userAvatar": "/avatar.jpg",
      "timestamp": "2024-01-01T12:00:00Z"
    }
  ]
}

// Get user's likes
GET /api/users/{userId}/likes
Response:
{
  "likes": [
    {
      "contentType": "answer",
      "contentId": "answer-id",
      "content": "Answer preview...",
      "timestamp": "2024-01-01T12:00:00Z"
    }
  ]
}
```

### 3. Saves (Bookmarks)

**Purpose**: Allow users to save/bookmark threads, questions, answers, and comments for later reference.

**Database Schema**:
```sql
-- Saves table for all content types
CREATE TABLE public.saves (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('thread', 'question', 'answer', 'comment')),
  content_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, content_type, content_id)
);

-- Add save_count to relevant tables
ALTER TABLE public.threads ADD COLUMN save_count INTEGER DEFAULT 0;
ALTER TABLE public.questions ADD COLUMN save_count INTEGER DEFAULT 0;
ALTER TABLE public.answers ADD COLUMN save_count INTEGER DEFAULT 0;
ALTER TABLE public.comments ADD COLUMN save_count INTEGER DEFAULT 0;

-- Indexes
CREATE INDEX idx_saves_content ON public.saves(content_type, content_id);
CREATE INDEX idx_saves_user_id ON public.saves(user_id);
```

**API Endpoints**:
```javascript
// Save/unsave content
POST /api/saves/{contentType}/{contentId}
{
  "userId": "user-id",
  "action": "save" // or "unsave"
}

Response:
{
  "success": true,
  "action": "saved", // or "unsaved"
  "saveCount": 8,
  "isSaved": true // or false
}

// Get user's saved content
GET /api/users/{userId}/saves
Response:
{
  "saves": [
    {
      "contentType": "thread",
      "contentId": "thread-id",
      "content": {
        "title": "Thread Title",
        "preview": "Thread preview...",
        "creator": "John Doe"
      },
      "timestamp": "2024-01-01T12:00:00Z"
    }
  ]
}

// Get saves for specific content
GET /api/saves/{contentType}/{contentId}
Response:
{
  "saveCount": 8,
  "isSaved": false, // based on current user
  "recentSaves": [
    {
      "userId": "user-id",
      "userName": "John Doe",
      "userAvatar": "/avatar.jpg",
      "timestamp": "2024-01-01T12:00:00Z"
    }
  ]
}
```

### 4. Shares

**Purpose**: Track how many times content has been shared externally.

**Database Schema**:
```sql
-- Shares table for all content types
CREATE TABLE public.shares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id), -- NULL for anonymous shares
  content_type TEXT NOT NULL CHECK (content_type IN ('thread', 'question', 'answer', 'comment')),
  content_id UUID NOT NULL,
  share_method TEXT, -- 'copy_link', 'social_media', 'embed', etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add share_count to relevant tables
ALTER TABLE public.threads ADD COLUMN share_count INTEGER DEFAULT 0;
ALTER TABLE public.questions ADD COLUMN share_count INTEGER DEFAULT 0;
ALTER TABLE public.answers ADD COLUMN share_count INTEGER DEFAULT 0;
ALTER TABLE public.comments ADD COLUMN share_count INTEGER DEFAULT 0;

-- Indexes
CREATE INDEX idx_shares_content ON public.shares(content_type, content_id);
CREATE INDEX idx_shares_user_id ON public.shares(user_id);
```

**API Endpoints**:
```javascript
// Track share
POST /api/shares/{contentType}/{contentId}
{
  "userId": "optional-user-id", // NULL for anonymous
  "shareMethod": "copy_link" // or "social_media", "embed", etc.
}

Response:
{
  "success": true,
  "shareCount": 25,
  "shareUrl": "https://app.com/thread/123"
}

// Get share analytics
GET /api/shares/{contentType}/{contentId}
Response:
{
  "shareCount": 25,
  "shareMethods": {
    "copy_link": 15,
    "social_media": 8,
    "embed": 2
  },
  "recentShares": [
    {
      "userId": "user-id",
      "shareMethod": "copy_link",
      "timestamp": "2024-01-01T12:00:00Z"
    }
  ]
}
```

## Updated Thread Interface

### Database Schema Updates
```sql
-- Update threads table with new metrics
ALTER TABLE public.threads ADD COLUMN view_count INTEGER DEFAULT 0;
ALTER TABLE public.threads ADD COLUMN heart_count INTEGER DEFAULT 0;
ALTER TABLE public.threads ADD COLUMN save_count INTEGER DEFAULT 0;
ALTER TABLE public.threads ADD COLUMN share_count INTEGER DEFAULT 0;

-- Update questions table
ALTER TABLE public.questions ADD COLUMN heart_count INTEGER DEFAULT 0;
ALTER TABLE public.questions ADD COLUMN save_count INTEGER DEFAULT 0;
ALTER TABLE public.questions ADD COLUMN share_count INTEGER DEFAULT 0;

-- Update answers table
ALTER TABLE public.answers ADD COLUMN heart_count INTEGER DEFAULT 0;
ALTER TABLE public.answers ADD COLUMN save_count INTEGER DEFAULT 0;
ALTER TABLE public.answers ADD COLUMN share_count INTEGER DEFAULT 0;

-- Update comments table
ALTER TABLE public.comments ADD COLUMN heart_count INTEGER DEFAULT 0;
ALTER TABLE public.comments ADD COLUMN save_count INTEGER DEFAULT 0;
ALTER TABLE public.comments ADD COLUMN share_count INTEGER DEFAULT 0;
```

### TypeScript Interface Updates
```typescript
// Update Thread interface
export interface Thread {
  id: string;
  title: string;
  creator: User;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  questionCount: number;
  answerCount: number;
  interactionCount: number;
  // New metrics
  viewCount: number;
  heartCount: number;
  saveCount: number;
  shareCount: number;
  // User-specific states
  isLiked?: boolean;
  isSaved?: boolean;
  questions: Question[];
  category?: string;
}

// Update Question interface
export interface Question {
  id: string;
  content: string;
  timestamp: Date;
  userId: string;
  threadId: string;
  isSummary?: boolean;
  // New metrics
  heartCount: number;
  saveCount: number;
  shareCount: number;
  // User-specific states
  isLiked?: boolean;
  isSaved?: boolean;
}

// Update Answer interface
export interface Answer {
  id: string;
  content: string;
  timestamp: Date;
  userId: string;
  questionId: string;
  isPinned: boolean;
  isAI: boolean;
  interactionCount: number;
  thinking?: string;
  // New metrics
  heartCount: number;
  saveCount: number;
  shareCount: number;
  // User-specific states
  isLiked?: boolean;
  isSaved?: boolean;
}

// Update Comment interface
export interface Comment {
  id: string;
  content: string;
  timestamp: Date;
  userId: string;
  answerId: string;
  parentId?: string;
  replies?: Comment[];
  // New metrics
  heartCount: number;
  saveCount: number;
  shareCount: number;
  // User-specific states
  isLiked?: boolean;
  isSaved?: boolean;
}
```

## API Handler Implementation

### New Handler Files
Create `infrastructure/aws/src/handlers/metrics.js`:

```javascript
const crypto = require('crypto');
const { addCorsHeaders, handleOptionsRequest } = require('../utils/cors');
const { tables, dbOperations, parseRequestBody } = require('../utils/db');

// Views
exports.trackView = async (event) => {
  // Implementation for tracking thread views
};

// Hearts
exports.toggleHeart = async (event) => {
  // Implementation for hearting/unhearting content
};

exports.getHearts = async (event) => {
  // Implementation for getting hearts for content
};

// Saves
exports.toggleSave = async (event) => {
  // Implementation for saving/unsaving content
};

exports.getSaves = async (event) => {
  // Implementation for getting saves for content
};

// Shares
exports.trackShare = async (event) => {
  // Implementation for tracking shares
};
```

### Serverless Configuration Updates
Add to `infrastructure/aws/serverless.yml`:

```yaml
# Views
trackView:
  handler: src/handlers/metrics.trackView
  events:
    - http:
        path: /threads/{threadId}/views
        method: post
        cors: true

# Hearts
toggleHeart:
  handler: src/handlers/metrics.toggleHeart
  events:
    - http:
        path: /hearts/{contentType}/{contentId}
        method: post
        cors: true

getHearts:
  handler: src/handlers/metrics.getHearts
  events:
    - http:
        path: /hearts/{contentType}/{contentId}
        method: get
        cors: true

# Saves
toggleSave:
  handler: src/handlers/metrics.toggleSave
  events:
    - http:
        path: /saves/{contentType}/{contentId}
        method: post
        cors: true

getSaves:
  handler: src/handlers/metrics.getSaves
  events:
    - http:
        path: /saves/{contentType}/{contentId}
        method: get
        cors: true

# Shares
trackShare:
  handler: src/handlers/metrics.trackShare
  events:
    - http:
        path: /shares/{contentType}/{contentId}
        method: post
        cors: true
```

## Frontend Integration

### Service Layer
Create `src/services/metrics.ts`:

```typescript
class MetricsService {
  async trackView(threadId: string, userId?: string): Promise<{ viewCount: number }> {
    // Implementation
  }

  async toggleHeart(contentType: string, contentId: string, userId: string): Promise<HeartResponse> {
    // Implementation
  }

  async toggleSave(contentType: string, contentId: string, userId: string): Promise<SaveResponse> {
    // Implementation
  }

  async trackShare(contentType: string, contentId: string, userId?: string): Promise<ShareResponse> {
    // Implementation
  }
}

export const metricsService = new MetricsService();
```

### UI Components
Create metric display components:

```typescript
// MetricButton component for hearts, saves, shares
interface MetricButtonProps {
  type: 'heart' | 'save' | 'share';
  count: number;
  isActive: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

// MetricDisplay component for showing counts
interface MetricDisplayProps {
  views?: number;
  hearts?: number;
  saves?: number;
  shares?: number;
  showLabels?: boolean;
}
```

## Implementation Phases

### Phase 1: Database Schema & Core APIs
1. Create database migrations for new tables and columns
2. Implement core API handlers for metrics
3. Update existing APIs to include new metric counts
4. Add serverless configuration

### Phase 2: Frontend Integration
1. Update TypeScript interfaces
2. Create metrics service layer
3. Implement metric UI components
4. Update existing components to display metrics

### Phase 3: Advanced Features
1. Add analytics endpoints for detailed metrics
2. Implement trending algorithms based on new metrics
3. Add user preferences for metric visibility
4. Implement caching for frequently accessed metrics

## Performance Considerations

### Database Indexes
- Index on `(content_type, content_id)` for metrics tables
- Index on `user_id` for user-specific queries
- Consider composite indexes for common query patterns

### Caching Strategy
- Cache metric counts in Redis for frequently accessed content
- Implement cache invalidation on metric updates
- Use eventual consistency for non-critical metric displays

### Rate Limiting
- Implement rate limiting for view tracking (prevent spam)
- Limit heart/save actions per user per content
- Implement cooldown periods for share tracking

## Security Considerations

### Data Privacy
- Hash or anonymize IP addresses for view tracking
- Implement proper user authentication for personalized metrics
- Follow GDPR/privacy regulations for user data

### Input Validation
- Validate content types and IDs
- Sanitize user inputs for share methods
- Implement proper authorization checks

## Analytics & Insights

### Trending Algorithm
```typescript
interface TrendingScore {
  threadId: string;
  score: number;
  breakdown: {
    views: number;
    hearts: number;
    saves: number;
    shares: number;
    comments: number;
    recency: number;
  };
}

// Weighted scoring for trending
const calculateTrendingScore = (metrics: ThreadMetrics): number => {
  const weights = {
    views: 1,
    hearts: 3,
    saves: 2,
    shares: 4,
    comments: 2,
    recency: 1
  };
  
  // Implementation
};
```

### User Engagement Metrics
- Track user's most hearted content types
- Identify power users based on hearts/saves given
- Analyze sharing patterns and viral content

This design provides a comprehensive foundation for implementing thread metrics that enhance user engagement while maintaining system performance and scalability.
