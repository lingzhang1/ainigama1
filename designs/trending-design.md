# Trending/Popularity Algorithm Design v2.0

> ⚠️ **UPDATE**: This document describes the current trending implementation. For the future AWS-only unified system that combines trending and recommendations with shared infrastructure, see [unified-content-discovery-system.md](./unified-content-discovery-system.md).

**Last Updated**: October 2025  
**Status**: ✅ Implemented (Current)  
**Backend**: AWS Lambda + DynamoDB (+ Node.js server - being phased out)

## Overview

This document outlines the updated trending algorithm that ranks threads based on comprehensive engagement metrics. The algorithm leverages the new metrics system to provide a more accurate and nuanced popularity score, designed to power the "Trending" section showing TopN trending threads to users.

## Quick Reference

**Trending Score Formula:**
```
Trending Score = (Engagement Score + Content Score) × Time Decay × Velocity
```

**Engagement Score:**
```
= (answer_saves × 5.0)
+ (answer_shares × 4.0)
+ (answer_likes × 3.0)
+ (comment_likes × 2.0)
+ (thread_views × 0.1)
```

**Content Score:**
```
= (questions × 1.5) + (answers × 2.0) + (comments × 1.0)
```

**Time Decay:**
```
= e^(-0.08 × hours_since_last_activity)
```

**Performance Options:**
- **Ultra-Fast (5-10ms)**: Cache metrics in threads table, query directly ✅ Recommended
- **On-Demand (100-500ms)**: Calculate with JOINs on-the-fly (MVP/small datasets)

**Key Points:**
- Saves are most valuable (5.0x weight) - users bookmark truly valuable content
- Shares indicate viral potential (4.0x weight)
- Views have minimal weight (0.1x) to prevent inflation
- Fresh content naturally rises via time decay
- Momentum threads get velocity bonus

**Metric Weights Summary:**

| Metric Type | Metric | Weight | Source | Why This Weight? |
|------------|--------|--------|--------|-----------------|
| **Engagement** | Answer Saves | 5.0 | Aggregated from saves table | Strongest intent signal |
| **Engagement** | Answer Shares | 4.0 | Aggregated from shares table | Viral amplification |
| **Engagement** | Answer Likes | 3.0 | Aggregated from likes table | Quality appreciation |
| **Engagement** | Comment Likes | 2.0 | Aggregated from likes table | Discussion engagement |
| **Engagement** | Thread Views | 0.1 | Aggregated from views table | Passive interest (inflatable) |
| **Content** | Questions | 1.5 | Direct from threads table | Activity indicator |
| **Content** | Answers | 2.0 | Direct from threads table | Core value |
| **Content** | Comments | 1.0 | Direct from threads table | Discussion depth |

## Actual Metrics System

Our application currently tracks these metrics:

**Thread-level metrics:**
- **Thread Views**: Number of times a thread has been viewed

**Content counts:**
- **Question Count**: Number of questions in the thread
- **Answer Count**: Number of answers in the thread
- **Comment Count**: Number of comments on answers

**Answer-level engagement (aggregated to thread):**
- **Answer Likes**: Total likes on all answers in the thread
- **Answer Saves**: Total saves on all answers in the thread
- **Answer Shares**: Total shares of all answers in the thread

**Comment-level engagement (aggregated to thread):**
- **Comment Likes**: Total likes on all comments in the thread

**Note**: We currently don't track likes/saves/shares on threads or questions directly—only on answers and comments.

## Algorithm Design Philosophy

### Core Principles
1. **Engagement Diversity**: Multiple types of engagement signals (passive → active)
2. **Recency Bias**: Recent activity weighs more than historical activity
3. **Quality over Quantity**: Meaningful interactions (saves, shares) outweigh passive ones (views)
4. **Velocity Bonus**: Threads gaining momentum quickly rank higher
5. **Time Decay**: Older threads naturally lose prominence
6. **Anti-Gaming**: Prevent manipulation through rate limiting and suspicious pattern detection

## Trending Score Formula

### Main Formula
```
Trending Score = (Engagement Score + Content Score) × Time Decay × Velocity Multiplier × Quality Bonus
```

### 1. Engagement Score (Primary Signal)

This is the weighted sum of all available engagement metrics on the thread:

```javascript
Engagement Score = 
  (answer_saves_total × 5.0) +     // Highest value - intentional bookmark
  (answer_shares_total × 4.0) +    // Viral signal - amplification
  (answer_likes_total × 3.0) +     // Quality answers drive thread value
  (comment_likes_total × 2.0) +    // Active discussion indicator
  (thread_views × 0.1)             // Passive interest
```

**Rationale**:
- **Answer Saves (5.0)**: Highest weight - users bookmark answers they find truly valuable
- **Answer Shares (4.0)**: Strong viral signal - users promote answers to others
- **Answer Likes (3.0)**: Quality answers are the core value of threads
- **Comment Likes (2.0)**: Active community discussion and engagement
- **Thread Views (0.1)**: Passive metric - low weight to avoid view inflation

**Why these weights?**
- Saves represent the strongest intent (user wants to reference later)
- Shares amplify reach and indicate content worth promoting
- Likes show appreciation and quality
- Views are important but easily inflated, so kept minimal

### 2. Content Score (Secondary Signal)

Measures the actual content volume in the thread:

```javascript
Content Score = 
  (question_count × 1.5) +        // More questions = more activity
  (answer_count × 2.0) +          // Answers are core value
  (comment_count × 1.0)           // Discussion depth
```

**Why separate from engagement?**  
Content volume indicates thread depth, while engagement indicates quality. Both matter.

### 3. Time Decay Function

Prevents old threads from dominating trending indefinitely:

```javascript
Time Decay = Math.exp(-λ × hours_since_last_activity)
```

Where:
- **λ (lambda) = 0.08** - Decay constant (tunable)
- **hours_since_last_activity** = Time since last like/save/share/comment/answer/question

**Decay Examples**:
- 1 hour ago: ~92% weight
- 6 hours ago: ~62% weight
- 24 hours ago: ~14% weight
- 48 hours ago: ~2% weight

This ensures fresh content surfaces naturally.

### 4. Velocity Multiplier

Rewards threads that are "heating up" with recent activity:

```javascript
recent_engagement_24h = (likes + saves + shares + comments + answers) in last 24 hours
total_engagement = (likes + saves + shares + comments + answers) all time

velocity_ratio = recent_engagement_24h / Math.max(total_engagement, 1)
Velocity Multiplier = 1 + (velocity_ratio × 0.8)
```

**Range**: 1.0 to 1.8
- New active thread with all recent engagement: ~1.8x boost
- Old thread with little recent activity: 1.0x (no boost)

### 5. Quality Bonus (Optional Enhancements)

Additional multipliers based on content quality signals:

```javascript
Quality Bonus = 
  (has_ai_answer ? 1.2 : 1.0) ×           // AI-answered = complex/interesting
  (creator_is_verified ? 1.15 : 1.0) ×    // Trusted creator boost
  (avg_answer_length > 300 ? 1.1 : 1.0)   // Substantive answers
```

## Complete Implementation

### JavaScript/TypeScript Implementation

```typescript
interface ThreadMetrics {
  // Thread-level metrics
  thread_views: number;
  
  // Content counts
  question_count: number;
  answer_count: number;
  comment_count: number;
  
  // Answer engagement (aggregated from all answers in thread)
  answer_likes_total: number;
  answer_saves_total: number;
  answer_shares_total: number;
  
  // Comment engagement (aggregated from all comments in thread)
  comment_likes_total: number;
  
  // Timing
  updated_at: Date;
  created_at: Date;
  
  // Velocity tracking
  recent_engagement_24h: number;  // Engagements in last 24 hours
}

interface TrendingConfig {
  decayRate: number;          // Lambda (λ) for time decay
  velocityWeight: number;     // How much to reward velocity
  topN: number;               // Number of trending threads to return
  minEngagement: number;      // Minimum engagement to be eligible
}

const DEFAULT_CONFIG: TrendingConfig = {
  decayRate: 0.08,
  velocityWeight: 0.8,
  topN: 10,
  minEngagement: 3  // At least 3 total engagements (beyond views)
};

function calculateTrendingScore(
  metrics: ThreadMetrics, 
  config: TrendingConfig = DEFAULT_CONFIG
): number {
  // 1. Engagement Score
  const engagementScore = 
    (metrics.answer_saves_total * 5.0) +
    (metrics.answer_shares_total * 4.0) +
    (metrics.answer_likes_total * 3.0) +
    (metrics.comment_likes_total * 2.0) +
    (metrics.thread_views * 0.1);
  
  // 2. Content Score
  const contentScore = 
    (metrics.question_count * 1.5) +
    (metrics.answer_count * 2.0) +
    (metrics.comment_count * 1.0);
  
  // 3. Time Decay
  const now = Date.now();
  const lastActivity = new Date(metrics.updated_at).getTime();
  const hoursSinceActivity = (now - lastActivity) / (1000 * 60 * 60);
  const timeDecay = Math.exp(-config.decayRate * hoursSinceActivity);
  
  // 4. Velocity Multiplier
  const totalEngagement = 
    metrics.answer_likes_total + metrics.answer_saves_total + 
    metrics.answer_shares_total + metrics.comment_likes_total +
    metrics.answer_count + metrics.comment_count;
  
  const velocityRatio = metrics.recent_engagement_24h / Math.max(totalEngagement, 1);
  const velocityMultiplier = 1 + (velocityRatio * config.velocityWeight);
  
  // 5. Combined Score
  const baseScore = engagementScore + contentScore;
  const trendingScore = baseScore * timeDecay * velocityMultiplier;
  
  return trendingScore;
}

// Get TopN trending threads
async function getTopNTrendingThreads(n: number = 10): Promise<Thread[]> {
  // Fetch all eligible public threads with metrics
  const threads = await fetchThreadsWithMetrics();
  
  // Calculate scores
  const scored = threads.map(thread => ({
    thread,
    score: calculateTrendingScore(thread.metrics)
  }));
  
  // Sort by score descending and take top N
  const topN = scored
    .filter(item => item.score > DEFAULT_CONFIG.minEngagement)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(item => item.thread);
  
  return topN;
}
```

### SQL Implementation (for server-side calculation)

This optimized query efficiently aggregates metrics and calculates trending scores in a single database call.

```sql
-- OPTIMIZED: Calculate trending scores directly in SQL
-- This approach minimizes joins and is efficient for large datasets

WITH thread_metrics AS (
  SELECT 
    t.id,
    t.title,
    t.creator_id,
    t.updated_at,
    t.created_at,
    
    -- Thread-level views (direct count from views table)
    COALESCE(thread_views.count, 0) as thread_views,
    
    -- Content counts (from threads table - should be denormalized)
    t.question_count,
    t.answer_count,
    t.comment_count,
    
    -- Answer engagement (aggregated from all answers in thread)
    COALESCE(answer_likes.total, 0) as answer_likes_total,
    COALESCE(answer_saves.total, 0) as answer_saves_total,
    COALESCE(answer_shares.total, 0) as answer_shares_total,
    
    -- Comment likes (aggregated from all comments in thread)
    COALESCE(comment_likes.total, 0) as comment_likes_total,
    
    -- Recent activity (last 24 hours) - counts all engagement types
    COALESCE(recent_activity.count, 0) as recent_engagement_24h
    
  FROM threads t
  
  -- Thread views
  LEFT JOIN (
    SELECT content_id, COUNT(*) as count 
    FROM views 
    WHERE content_type = 'thread' 
    GROUP BY content_id
  ) thread_views ON thread_views.content_id = t.id
  
  -- Answer likes (optimized: join through questions to get thread_id)
  LEFT JOIN (
    SELECT q.thread_id, COUNT(l.id) as total
    FROM likes l
    JOIN answers a ON l.content_id = a.id AND l.content_type = 'answer'
    JOIN questions q ON q.id = a.question_id
    GROUP BY q.thread_id
  ) answer_likes ON answer_likes.thread_id = t.id
  
  -- Answer saves
  LEFT JOIN (
    SELECT q.thread_id, COUNT(s.id) as total
    FROM saves s
    JOIN answers a ON s.content_id = a.id AND s.content_type = 'answer'
    JOIN questions q ON q.id = a.question_id
    GROUP BY q.thread_id
  ) answer_saves ON answer_saves.thread_id = t.id
  
  -- Answer shares
  LEFT JOIN (
    SELECT q.thread_id, COUNT(sh.id) as total
    FROM shares sh
    JOIN answers a ON sh.content_id = a.id AND sh.content_type = 'answer'
    JOIN questions q ON q.id = a.question_id
    GROUP BY q.thread_id
  ) answer_shares ON answer_shares.thread_id = t.id
  
  -- Comment likes
  LEFT JOIN (
    SELECT q.thread_id, COUNT(l.id) as total
    FROM likes l
    JOIN comments c ON l.content_id = c.id AND l.content_type = 'comment'
    JOIN answers a ON a.id = c.answer_id
    JOIN questions q ON q.id = a.question_id
    GROUP BY q.thread_id
  ) comment_likes ON comment_likes.thread_id = t.id
  
  -- Recent activity (last 24 hours) - UNION ALL for performance
  LEFT JOIN (
    SELECT thread_id, COUNT(*) as count
    FROM (
      -- Recent answer likes
      SELECT q.thread_id, l.created_at
      FROM likes l
      JOIN answers a ON l.content_id = a.id AND l.content_type = 'answer'
      JOIN questions q ON q.id = a.question_id
      WHERE l.created_at > datetime('now', '-24 hours')
      
      UNION ALL
      
      -- Recent answer saves
      SELECT q.thread_id, s.created_at
      FROM saves s
      JOIN answers a ON s.content_id = a.id AND s.content_type = 'answer'
      JOIN questions q ON q.id = a.question_id
      WHERE s.created_at > datetime('now', '-24 hours')
      
      UNION ALL
      
      -- Recent answer shares
      SELECT q.thread_id, sh.created_at
      FROM shares sh
      JOIN answers a ON sh.content_id = a.id AND sh.content_type = 'answer'
      JOIN questions q ON q.id = a.question_id
      WHERE sh.created_at > datetime('now', '-24 hours')
      
      UNION ALL
      
      -- Recent comment likes
      SELECT q.thread_id, l.created_at
      FROM likes l
      JOIN comments c ON l.content_id = c.id AND l.content_type = 'comment'
      JOIN answers a ON a.id = c.answer_id
      JOIN questions q ON q.id = a.question_id
      WHERE l.created_at > datetime('now', '-24 hours')
      
      UNION ALL
      
      -- Recent comments (new comments are activity)
      SELECT q.thread_id, c.created_at
      FROM comments c
      JOIN answers a ON c.answer_id = a.id
      JOIN questions q ON a.question_id = q.id
      WHERE c.created_at > datetime('now', '-24 hours')
      
      UNION ALL
      
      -- Recent answers (new answers are activity)
      SELECT q.thread_id, a.created_at
      FROM answers a
      JOIN questions q ON a.question_id = q.id
      WHERE a.created_at > datetime('now', '-24 hours')
    ) recent
    GROUP BY thread_id
  ) recent_activity ON recent_activity.thread_id = t.id
  
  WHERE t.is_public = 1
),

scored_threads AS (
  SELECT 
    *,
    -- Engagement Score
    (
      (answer_saves_total * 5.0) +
      (answer_shares_total * 4.0) +
      (answer_likes_total * 3.0) +
      (comment_likes_total * 2.0) +
      (thread_views * 0.1)
    ) as engagement_score,
    
    -- Content Score
    (
      (question_count * 1.5) +
      (answer_count * 2.0) +
      (comment_count * 1.0)
    ) as content_score,
    
    -- Time Decay (λ = 0.08) - SQLite version
    EXP(-0.08 * (julianday('now') - julianday(updated_at)) * 24) as time_decay,
    
    -- Velocity Multiplier
    (
      1.0 + (
        CAST(recent_engagement_24h AS REAL) / 
        NULLIF(
          CAST(
            answer_likes_total + answer_saves_total + answer_shares_total + 
            comment_likes_total + answer_count + comment_count 
          AS REAL), 
          0.0
        ) * 0.8
      )
    ) as velocity_multiplier
    
  FROM thread_metrics
)

SELECT 
  id,
  title,
  creator_id,
  updated_at,
  thread_views,
  question_count,
  answer_count,
  comment_count,
  answer_likes_total,
  answer_saves_total,
  answer_shares_total,
  comment_likes_total,
  engagement_score,
  content_score,
  time_decay,
  velocity_multiplier,
  -- Final Trending Score
  ROUND((engagement_score + content_score) * time_decay * velocity_multiplier, 4) as trending_score
FROM scored_threads
WHERE (engagement_score + content_score) >= 3  -- Minimum engagement threshold
ORDER BY trending_score DESC
LIMIT 10;  -- Top 10 trending threads
```

**Performance Notes:**
- Uses `UNION ALL` instead of `UNION` (no deduplication overhead)
- Indexes on `content_type` + `content_id` in likes/saves/shares tables critical
- Indexes on foreign keys (answer_id, question_id, thread_id) essential
- Consider caching results for 5 minutes to avoid repeated calculations

## Database Schema Requirements

To support this algorithm efficiently, ensure these tables/columns exist:

```sql
-- Core tables (assumed to exist)
-- threads: id, title, creator_id, is_public, question_count, answer_count, comment_count, created_at, updated_at
-- questions: id, thread_id, content, created_at
-- answers: id, question_id, content, created_at
-- comments: id, answer_id, content, created_at

-- Metrics tables (should already exist based on metrics.ts)
CREATE TABLE IF NOT EXISTS likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  content_type TEXT NOT NULL,  -- 'answer', 'comment' (only these two types)
  content_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, content_type, content_id)
);

CREATE TABLE IF NOT EXISTS saves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  content_type TEXT NOT NULL,  -- 'answer' (only answers can be saved currently)
  content_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, content_type, content_id)
);

CREATE TABLE IF NOT EXISTS shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,  -- Optional for anonymous shares
  content_type TEXT NOT NULL,  -- 'answer' (only answers can be shared currently)
  content_id TEXT NOT NULL,
  share_method TEXT,  -- 'copy_link', 'twitter', 'facebook', etc.
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,  -- Optional for anonymous views
  content_type TEXT NOT NULL,  -- 'thread' (only threads have views currently)
  content_id TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- CRITICAL INDEXES FOR PERFORMANCE
-- These indexes are essential for the trending query to be fast

-- Likes indexes
CREATE INDEX IF NOT EXISTS idx_likes_answer_content ON likes(content_type, content_id) WHERE content_type = 'answer';
CREATE INDEX IF NOT EXISTS idx_likes_comment_content ON likes(content_type, content_id) WHERE content_type = 'comment';
CREATE INDEX IF NOT EXISTS idx_likes_created ON likes(created_at);

-- Saves indexes
CREATE INDEX IF NOT EXISTS idx_saves_answer_content ON saves(content_type, content_id) WHERE content_type = 'answer';
CREATE INDEX IF NOT EXISTS idx_saves_created ON saves(created_at);

-- Shares indexes
CREATE INDEX IF NOT EXISTS idx_shares_answer_content ON shares(content_type, content_id) WHERE content_type = 'answer';
CREATE INDEX IF NOT EXISTS idx_shares_created ON shares(created_at);

-- Views indexes
CREATE INDEX IF NOT EXISTS idx_views_thread_content ON views(content_type, content_id) WHERE content_type = 'thread';
CREATE INDEX IF NOT EXISTS idx_views_created ON views(created_at);

-- Core table indexes (if not already present)
CREATE INDEX IF NOT EXISTS idx_answers_question_id ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_comments_answer_id ON comments(answer_id);
CREATE INDEX IF NOT EXISTS idx_questions_thread_id ON questions(thread_id);
CREATE INDEX IF NOT EXISTS idx_threads_public_updated ON threads(is_public, updated_at DESC);

-- PERFORMANCE OPTIMIZATION: Denormalized columns in threads table
-- These columns cache aggregated metrics to avoid expensive JOINs
ALTER TABLE threads ADD COLUMN trending_score REAL DEFAULT 0;
ALTER TABLE threads ADD COLUMN last_trending_update DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Optional: Cache metrics directly in threads table for ultra-fast loading
ALTER TABLE threads ADD COLUMN cached_answer_likes INTEGER DEFAULT 0;
ALTER TABLE threads ADD COLUMN cached_answer_saves INTEGER DEFAULT 0;
ALTER TABLE threads ADD COLUMN cached_answer_shares INTEGER DEFAULT 0;
ALTER TABLE threads ADD COLUMN cached_comment_likes INTEGER DEFAULT 0;
ALTER TABLE threads ADD COLUMN cached_thread_views INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_threads_trending ON threads(trending_score DESC) WHERE is_public = 1;
```

## Performance-Optimized Implementation Strategy

For maximum performance when loading the trending page, we recommend a **two-tier approach**:

### Tier 1: Ultra-Fast (Recommended for Production)

**Cache aggregated metrics in the threads table** and query directly from there.

```sql
-- ULTRA-FAST: Query pre-calculated trending scores
-- This query takes ~5-10ms even with thousands of threads
SELECT 
  id,
  title,
  creator_id,
  updated_at,
  question_count,
  answer_count,
  comment_count,
  cached_answer_likes,
  cached_answer_saves,
  cached_answer_shares,
  cached_comment_likes,
  cached_thread_views,
  trending_score
FROM threads
WHERE is_public = 1
  AND trending_score > 0  -- Only threads with some engagement
ORDER BY trending_score DESC
LIMIT 10;
```

**Background Job** to update cached metrics (run every 5-10 minutes):

```javascript
// Update cached metrics for all threads
async function updateThreadMetricsCache() {
  const startTime = Date.now();
  
  // Update all threads in one go
  await db.run(`
    UPDATE threads
    SET 
      cached_answer_likes = (
        SELECT COUNT(l.id)
        FROM likes l
        JOIN answers a ON l.content_id = a.id AND l.content_type = 'answer'
        JOIN questions q ON a.question_id = q.id
        WHERE q.thread_id = threads.id
      ),
      cached_answer_saves = (
        SELECT COUNT(s.id)
        FROM saves s
        JOIN answers a ON s.content_id = a.id AND s.content_type = 'answer'
        JOIN questions q ON a.question_id = q.id
        WHERE q.thread_id = threads.id
      ),
      cached_answer_shares = (
        SELECT COUNT(sh.id)
        FROM shares sh
        JOIN answers a ON sh.content_id = a.id AND sh.content_type = 'answer'
        JOIN questions q ON a.question_id = q.id
        WHERE q.thread_id = threads.id
      ),
      cached_comment_likes = (
        SELECT COUNT(l.id)
        FROM likes l
        JOIN comments c ON l.content_id = c.id AND l.content_type = 'comment'
        JOIN answers a ON c.answer_id = a.id
        JOIN questions q ON a.question_id = q.id
        WHERE q.thread_id = threads.id
      ),
      cached_thread_views = (
        SELECT COUNT(v.id)
        FROM views v
        WHERE v.content_id = threads.id AND v.content_type = 'thread'
      )
    WHERE is_public = 1;
  `);
  
  // Calculate trending scores
  await db.run(`
    UPDATE threads
    SET trending_score = ROUND(
      (
        -- Engagement Score
        (cached_answer_saves * 5.0) +
        (cached_answer_shares * 4.0) +
        (cached_answer_likes * 3.0) +
        (cached_comment_likes * 2.0) +
        (cached_thread_views * 0.1) +
        -- Content Score
        (question_count * 1.5) +
        (answer_count * 2.0) +
        (comment_count * 1.0)
      ) *
      -- Time Decay
      EXP(-0.08 * (julianday('now') - julianday(updated_at)) * 24) *
      -- Velocity (simplified - could be enhanced)
      1.0,
      4
    ),
    last_trending_update = CURRENT_TIMESTAMP
    WHERE is_public = 1;
  `);
  
  const elapsed = Date.now() - startTime;
  console.log(`Updated trending scores in ${elapsed}ms`);
}

// Run every 5 minutes
setInterval(updateThreadMetricsCache, 5 * 60 * 1000);
```

**Incremental Updates** when engagement happens:

```javascript
// When user likes/saves/shares an answer or likes a comment
async function onEngagementAction(contentType, contentId, action) {
  // Get the thread_id
  let threadId;
  
  if (contentType === 'answer') {
    const answer = await db.get('SELECT question_id FROM answers WHERE id = ?', contentId);
    const question = await db.get('SELECT thread_id FROM questions WHERE id = ?', answer.question_id);
    threadId = question.thread_id;
  } else if (contentType === 'comment') {
    const comment = await db.get('SELECT answer_id FROM comments WHERE id = ?', contentId);
    const answer = await db.get('SELECT question_id FROM answers WHERE id = ?', comment.answer_id);
    const question = await db.get('SELECT thread_id FROM questions WHERE id = ?', answer.question_id);
    threadId = question.thread_id;
  }
  
  // Increment/decrement the cached counter
  const columnMap = {
    'answer_like': 'cached_answer_likes',
    'answer_save': 'cached_answer_saves',
    'answer_share': 'cached_answer_shares',
    'comment_like': 'cached_comment_likes'
  };
  
  const column = columnMap[`${contentType}_${action.replace('un', '')}`];
  const delta = action.startsWith('un') ? -1 : 1;
  
  await db.run(`
    UPDATE threads
    SET ${column} = ${column} + ?
    WHERE id = ?
  `, [delta, threadId]);
  
  // Recalculate trending score for this thread only
  await recalculateTrendingScore(threadId);
}

async function recalculateTrendingScore(threadId) {
  await db.run(`
    UPDATE threads
    SET trending_score = ROUND(
      (
        (cached_answer_saves * 5.0) +
        (cached_answer_shares * 4.0) +
        (cached_answer_likes * 3.0) +
        (cached_comment_likes * 2.0) +
        (cached_thread_views * 0.1) +
        (question_count * 1.5) +
        (answer_count * 2.0) +
        (comment_count * 1.0)
      ) *
      EXP(-0.08 * (julianday('now') - julianday(updated_at)) * 24) *
      1.0,
      4
    ),
    last_trending_update = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [threadId]);
}
```

**Pros:**
- ⚡ **Extremely fast** (~5-10ms query time)
- 📊 Scales to millions of threads
- 🎯 Simple query, easy to debug
- 🔄 Real-time updates possible with incremental approach

**Cons:**
- 💾 Requires extra storage for cached columns
- 🔧 Needs background job or incremental update logic
- 🕒 Slight delay (5 min max) if using only background job

### Tier 2: On-Demand Calculation (For smaller datasets or initial MVP)

Use the complex SQL query with JOINs to calculate on-the-fly. This approach is fine for:
- Development/testing
- < 1000 threads
- When you want to avoid background jobs initially

See the "SQL Implementation" section above for the full query.

**Pros:**
- 🎯 Always accurate, no stale data
- 🛠️ No background jobs needed
- 📦 Simpler initial setup

**Cons:**
- 🐌 Slower (~100-500ms for large datasets)
- 📈 Query time increases with data size
- 🔥 Higher database load

### Recommended Hybrid Approach

1. **Start with Tier 2** (on-demand) for MVP
2. **Monitor query performance** (add timing logs)
3. **Migrate to Tier 1** (cached) when:
   - Query time exceeds 100ms
   - You have > 500 threads
   - Trending page becomes popular

## API Endpoint Design

### GET /api/threads/trending?topN=10

Returns the top N trending threads.

```javascript
// Node.js/Express endpoint
app.get('/api/threads/trending', async (req, res) => {
  try {
    const topN = parseInt(req.query.topN) || 10;
    const maxN = 50; // Limit to prevent abuse
    const limit = Math.min(topN, maxN);
    
    // Option 1: Calculate on-the-fly (simpler, but slower)
    const threads = await calculateTrendingThreads(limit);
    
    // Option 2: Use cached scores (faster, requires background job)
    // const threads = await getCachedTrendingThreads(limit);
    
    res.json({
      success: true,
      data: {
        threads,
        calculatedAt: new Date().toISOString(),
        algorithm: 'v2.0'
      }
    });
  } catch (error) {
    console.error('Error fetching trending threads:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trending threads'
    });
  }
});

// Calculate trending threads on-demand
async function calculateTrendingThreads(limit = 10) {
  // Use the SQL query from above
  const query = `/* Insert SQL query from above */`;
  const threads = await db.query(query, [limit]);
  return threads;
}
```

### Frontend Integration

```typescript
// src/services/trending.ts
import { Thread } from '../types';

class TrendingService {
  private apiUrl: string;
  private cacheKey = 'trending_threads_cache';
  private cacheDuration = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
  }

  /**
   * Fetch top N trending threads
   */
  async getTrendingThreads(topN: number = 10, useCache: boolean = true): Promise<Thread[]> {
    // Check cache first
    if (useCache) {
      const cached = this.getCachedThreads();
      if (cached) {
        return cached;
      }
    }

    try {
      const response = await fetch(`${this.apiUrl}/threads/trending?topN=${topN}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch trending threads: ${response.statusText}`);
      }

      const result = await response.json();
      const threads = result.data.threads;

      // Cache the results
      this.cacheThreads(threads);

      return threads;
    } catch (error) {
      console.error('Error fetching trending threads:', error);
      throw error;
    }
  }

  /**
   * Get cached trending threads if still valid
   */
  private getCachedThreads(): Thread[] | null {
    try {
      const cached = localStorage.getItem(this.cacheKey);
      if (!cached) return null;

      const { threads, timestamp } = JSON.parse(cached);
      const age = Date.now() - timestamp;

      if (age < this.cacheDuration) {
        return threads;
      }

      // Cache expired
      localStorage.removeItem(this.cacheKey);
      return null;
    } catch (error) {
      console.error('Error reading cache:', error);
      return null;
    }
  }

  /**
   * Cache trending threads
   */
  private cacheThreads(threads: Thread[]): void {
    try {
      const data = {
        threads,
        timestamp: Date.now()
      };
      localStorage.setItem(this.cacheKey, JSON.stringify(data));
    } catch (error) {
      console.error('Error caching threads:', error);
    }
  }

  /**
   * Clear the cache (call when user performs an action that might affect trending)
   */
  clearCache(): void {
    localStorage.removeItem(this.cacheKey);
  }
}

export const trendingService = new TrendingService();
```

## Performance Optimization

### 1. Caching Strategy

**Multi-layer caching**:
- **Client-side**: 5-minute localStorage cache
- **Server-side**: Redis cache with 5-minute TTL
- **Database**: Materialized view or cached column

```javascript
// Server-side Redis caching
const TRENDING_CACHE_KEY = 'trending:top10';
const CACHE_TTL = 300; // 5 minutes

async function getCachedTrendingThreads(limit = 10) {
  // Try Redis cache first
  const cached = await redis.get(TRENDING_CACHE_KEY);
  if (cached) {
    return JSON.parse(cached);
  }

  // Calculate fresh
  const threads = await calculateTrendingThreads(limit);

  // Cache for next time
  await redis.setex(TRENDING_CACHE_KEY, CACHE_TTL, JSON.stringify(threads));

  return threads;
}
```

### 2. Background Job for Score Updates

Instead of calculating on every request, use a background job to update scores:

```javascript
// Background job (runs every 5 minutes)
async function updateAllTrendingScores() {
  console.log('Updating trending scores...');
  
  // Update trending_score column for all threads
  await db.query(`
    UPDATE threads
    SET trending_score = (
      SELECT /* trending score calculation */
      FROM thread_metrics
      WHERE thread_metrics.id = threads.id
    ),
    last_trending_update = CURRENT_TIMESTAMP
    WHERE is_public = 1
  `);
  
  console.log('Trending scores updated');
}

// Schedule with cron or setInterval
setInterval(updateAllTrendingScores, 5 * 60 * 1000); // Every 5 minutes
```

### 3. Incremental Updates

For real-time feeling, update scores incrementally when new engagement happens:

```javascript
// When a like/save/share occurs
async function onEngagementEvent(threadId, eventType) {
  // Invalidate cache for this thread
  await redis.del(`thread:${threadId}:score`);
  await redis.del(TRENDING_CACHE_KEY);
  
  // Optionally: recalculate just this thread's score
  await updateThreadTrendingScore(threadId);
  
  // Broadcast via WebSocket if needed
  broadcastTrendingUpdate();
}
```

## Tuning and A/B Testing

The algorithm has several tunable parameters:

```typescript
interface AlgorithmParameters {
  // Engagement weights (actual metrics available)
  answerSaveWeight: number;      // Default: 5.0
  answerShareWeight: number;     // Default: 4.0
  answerLikeWeight: number;      // Default: 3.0
  commentLikeWeight: number;     // Default: 2.0
  threadViewWeight: number;      // Default: 0.1
  
  // Content weights
  questionContentWeight: number; // Default: 1.5
  answerContentWeight: number;   // Default: 2.0
  commentContentWeight: number;  // Default: 1.0
  
  // Decay and velocity
  decayRate: number;             // Default: 0.08
  velocityWeight: number;        // Default: 0.8
  
  // Thresholds
  minEngagement: number;         // Default: 3
}

// Experiment with different parameter sets
const ALGORITHM_VARIANTS = {
  balanced: {
    answerSaveWeight: 5.0,
    answerShareWeight: 4.0,
    answerLikeWeight: 3.0,
    commentLikeWeight: 2.0,
    viewWeight: 0.1,
    decayRate: 0.08,
    velocityWeight: 0.8
  },
  viral_focused: {
    answerSaveWeight: 4.0,
    answerShareWeight: 6.0,    // Emphasize shares
    answerLikeWeight: 3.0,
    commentLikeWeight: 2.0,
    viewWeight: 0.1,
    decayRate: 0.12,           // Faster decay
    velocityWeight: 1.0        // Higher velocity bonus
  },
  quality_focused: {
    answerSaveWeight: 6.0,     // Emphasize saves
    answerShareWeight: 3.0,
    answerLikeWeight: 4.0,     // Also value likes more
    commentLikeWeight: 2.5,
    viewWeight: 0.05,          // De-emphasize views
    decayRate: 0.05,           // Slower decay
    velocityWeight: 0.5        // Lower velocity bonus
  },
  discussion_focused: {
    answerSaveWeight: 4.0,
    answerShareWeight: 3.0,
    answerLikeWeight: 2.5,
    commentLikeWeight: 4.0,    // Emphasize comments
    viewWeight: 0.1,
    decayRate: 0.08,
    velocityWeight: 0.8
  }
};
```

## Monitoring and Metrics

Track these metrics to evaluate algorithm performance:

### Algorithm Health
- **Calculation time**: Time to compute trending scores
- **Cache hit rate**: % of requests served from cache
- **Score distribution**: Histogram of trending scores
- **Freshness**: Average age of threads in trending

### User Engagement
- **Click-through rate**: % of users clicking on trending threads
- **Engagement rate**: Actions taken on trending threads vs. other threads
- **Diversity**: Number of unique threads appearing in trending over time
- **Dwell time**: Time spent on trending threads

### Business Metrics
- **User retention**: Impact on daily/weekly active users
- **Content quality**: Spam rate in trending
- **Fairness**: Distribution of creators in trending

## Anti-Gaming Measures

### 1. Rate Limiting
```javascript
// Limit engagement actions per user per thread
const RATE_LIMITS = {
  likes_per_hour: 20,
  saves_per_hour: 10,
  shares_per_hour: 5
};

async function checkRateLimit(userId, action, threadId) {
  const key = `ratelimit:${userId}:${action}`;
  const count = await redis.incr(key);
  
  if (count === 1) {
    await redis.expire(key, 3600); // 1 hour
  }
  
  if (count > RATE_LIMITS[`${action}_per_hour`]) {
    throw new Error('Rate limit exceeded');
  }
}
```

### 2. Suspicious Pattern Detection
```javascript
// Detect suspicious engagement patterns
async function detectSuspiciousActivity(threadId) {
  // Check for sudden spike in engagement from new accounts
  const recentEngagements = await getRecentEngagements(threadId, 1); // last 1 hour
  const newAccountEngagements = recentEngagements.filter(e => 
    isNewAccount(e.userId) && e.accountAge < 7 * 24 * 60 * 60 * 1000
  );
  
  if (newAccountEngagements.length > 10) {
    // Flag for review or apply penalty
    await applyTrendingPenalty(threadId, 0.5); // 50% score reduction
  }
}
```

### 3. Duplicate Content Detection
Reduce scores for threads with similar content to avoid spam:

```javascript
// Simple similarity check based on title
function calculateSimilarity(title1, title2) {
  // Use Levenshtein distance or more sophisticated NLP
  // Return value between 0 (completely different) and 1 (identical)
}

async function applyDuplicatePenalty(threads) {
  for (let i = 0; i < threads.length; i++) {
    for (let j = i + 1; j < threads.length; j++) {
      const similarity = calculateSimilarity(
        threads[i].title,
        threads[j].title
      );
      
      if (similarity > 0.8) {
        // Apply penalty to the newer thread
        threads[j].trending_score *= 0.7;
      }
    }
  }
}
```

## Migration Path

### Phase 1: Deploy Algorithm (Week 1)
1. Deploy new trending endpoint
2. Run in parallel with existing system
3. Monitor performance and scores
4. A/B test with small % of users

### Phase 2: Optimize (Week 2-3)
1. Implement caching layers
2. Add background score calculation job
3. Fine-tune parameters based on metrics
4. Add monitoring dashboards

### Phase 3: Full Rollout (Week 4)
1. Switch all users to new algorithm
2. Deprecate old trending logic
3. Enable real-time updates via WebSocket
4. Launch "What's Trending" feature

## Conclusion

This updated trending algorithm leverages your actual metrics system to provide an accurate and performant measure of thread popularity:

### Available Metrics Used
- ✅ **Answer Saves** (5.0 weight) - Highest value signal
- ✅ **Answer Shares** (4.0 weight) - Viral amplification
- ✅ **Answer Likes** (3.0 weight) - Quality indicator
- ✅ **Comment Likes** (2.0 weight) - Discussion engagement
- ✅ **Thread Views** (0.1 weight) - Passive interest
- ✅ **Content Counts** (questions, answers, comments) - Thread depth

### Key Features
- **Quality Over Quantity**: Saves and shares weighted much higher than views
- **Time Decay**: Recent activity prioritized via exponential decay
- **Velocity Bonus**: Trending threads get extra boost
- **Anti-Gaming**: Rate limiting and suspicious pattern detection

### Performance Characteristics

**Tier 1 (Cached) - Recommended:**
- ⚡ Query time: ~5-10ms
- 📊 Scales to millions of threads
- 🔄 Incremental updates available
- 💾 Requires: cached columns + background job

**Tier 2 (On-Demand):**
- 🐌 Query time: ~100-500ms
- 📈 Good for < 1000 threads
- 🎯 No caching needed
- 🛠️ Simpler initial setup

### Recommended Implementation Path

1. **Start simple**: Use Tier 2 (on-demand calculation) for MVP
2. **Monitor performance**: Add query timing logs
3. **Optimize when needed**: Migrate to Tier 1 (cached) when query time > 100ms or you have > 500 threads

The TopN design efficiently surfaces the most relevant trending content while remaining performant and resistant to manipulation.