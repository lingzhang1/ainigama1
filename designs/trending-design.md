# Trending/Popularity Algorithm Design v2.0
**Last Updated**: October 2025  
**Status**: Updated to incorporate new metrics system (likes, saves, views, shares)

## Overview

This document outlines the updated trending algorithm that ranks threads based on comprehensive engagement metrics. The algorithm leverages the new metrics system to provide a more accurate and nuanced popularity score, designed to power the "Trending" section showing TopN trending threads to users.

## New Metrics System Integration

Our application now tracks four key engagement metrics across all content types (threads, questions, answers, comments):

1. **Likes**: Direct positive feedback on content
2. **Saves**: Users bookmarking content for later reference
3. **Views**: Content impressions and reach
4. **Shares**: Viral spread and content amplification

These metrics provide a richer signal than the previous content-count-only approach.

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

This is the weighted sum of all engagement metrics on the thread:

```javascript
Engagement Score = 
  (thread_likes × 3.0) +          // Strong positive signal
  (thread_saves × 5.0) +          // Highest value - intentional bookmark
  (thread_shares × 4.0) +         // Viral signal - amplification
  (thread_views × 0.1) +          // Passive interest
  (question_likes × 2.0) +        // Quality questions
  (answer_likes × 2.5) +          // Quality answers
  (comment_likes × 1.5)           // Community engagement
```

**Rationale**:
- **Saves (5.0)**: Highest weight - users bookmark content they find truly valuable
- **Shares (4.0)**: Strong viral signal - users promote content to others
- **Thread Likes (3.0)**: Direct positive feedback on overall thread quality
- **Answer Likes (2.5)**: Quality answers drive thread value
- **Question Likes (2.0)**: Well-posed questions attract engagement
- **Comment Likes (1.5)**: Active discussion indicator
- **Views (0.1)**: Passive metric - low weight to avoid view inflation

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
  thread_likes: number;
  thread_saves: number;
  thread_shares: number;
  thread_views: number;
  
  // Content counts
  question_count: number;
  answer_count: number;
  comment_count: number;
  
  // Nested engagement (sum of all likes on questions/answers/comments in thread)
  question_likes_total: number;
  answer_likes_total: number;
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
  minEngagement: 5  // At least 5 total engagements
};

function calculateTrendingScore(
  metrics: ThreadMetrics, 
  config: TrendingConfig = DEFAULT_CONFIG
): number {
  // 1. Engagement Score
  const engagementScore = 
    (metrics.thread_likes * 3.0) +
    (metrics.thread_saves * 5.0) +
    (metrics.thread_shares * 4.0) +
    (metrics.thread_views * 0.1) +
    (metrics.question_likes_total * 2.0) +
    (metrics.answer_likes_total * 2.5) +
    (metrics.comment_likes_total * 1.5);
  
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
    metrics.thread_likes + metrics.thread_saves + metrics.thread_shares +
    metrics.question_count + metrics.answer_count + metrics.comment_count +
    metrics.question_likes_total + metrics.answer_likes_total + metrics.comment_likes_total;
  
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

```sql
-- Calculate trending scores directly in SQL
-- This approach is more efficient for large datasets

WITH thread_metrics AS (
  SELECT 
    t.id,
    t.title,
    t.creator_id,
    t.updated_at,
    t.created_at,
    
    -- Thread-level engagement
    COALESCE(thread_likes.count, 0) as thread_likes,
    COALESCE(thread_saves.count, 0) as thread_saves,
    COALESCE(thread_shares.count, 0) as thread_shares,
    COALESCE(thread_views.count, 0) as thread_views,
    
    -- Content counts
    t.question_count,
    t.answer_count,
    t.comment_count,
    
    -- Nested engagement (sum of likes on questions/answers/comments)
    COALESCE(question_likes.total, 0) as question_likes_total,
    COALESCE(answer_likes.total, 0) as answer_likes_total,
    COALESCE(comment_likes.total, 0) as comment_likes_total,
    
    -- Recent activity (last 24 hours)
    COALESCE(recent_activity.count, 0) as recent_engagement_24h
    
  FROM threads t
  
  -- Thread-level likes
  LEFT JOIN (
    SELECT content_id, COUNT(*) as count 
    FROM likes 
    WHERE content_type = 'thread' 
    GROUP BY content_id
  ) thread_likes ON thread_likes.content_id = t.id
  
  -- Thread-level saves
  LEFT JOIN (
    SELECT content_id, COUNT(*) as count 
    FROM saves 
    WHERE content_type = 'thread' 
    GROUP BY content_id
  ) thread_saves ON thread_saves.content_id = t.id
  
  -- Thread-level shares
  LEFT JOIN (
    SELECT content_id, COUNT(*) as count 
    FROM shares 
    WHERE content_type = 'thread' 
    GROUP BY content_id
  ) thread_shares ON thread_shares.content_id = t.id
  
  -- Thread-level views
  LEFT JOIN (
    SELECT content_id, COUNT(*) as count 
    FROM views 
    WHERE content_type = 'thread' 
    GROUP BY content_id
  ) thread_views ON thread_views.content_id = t.id
  
  -- Question likes (sum of all likes on questions in this thread)
  LEFT JOIN (
    SELECT q.thread_id, COUNT(l.id) as total
      FROM questions q 
    LEFT JOIN likes l ON l.content_id = q.id AND l.content_type = 'question'
    GROUP BY q.thread_id
  ) question_likes ON question_likes.thread_id = t.id
  
  -- Answer likes
  LEFT JOIN (
    SELECT q.thread_id, COUNT(l.id) as total
      FROM answers a 
    JOIN questions q ON q.id = a.question_id
    LEFT JOIN likes l ON l.content_id = a.id AND l.content_type = 'answer'
    GROUP BY q.thread_id
  ) answer_likes ON answer_likes.thread_id = t.id
  
  -- Comment likes
  LEFT JOIN (
    SELECT q.thread_id, COUNT(l.id) as total
      FROM comments c 
    JOIN answers a ON a.id = c.answer_id
    JOIN questions q ON q.id = a.question_id
    LEFT JOIN likes l ON l.content_id = c.id AND l.content_type = 'comment'
    GROUP BY q.thread_id
  ) comment_likes ON comment_likes.thread_id = t.id
  
  -- Recent activity (last 24 hours)
  LEFT JOIN (
    SELECT q.thread_id, COUNT(*) as count
    FROM (
      -- Recent likes
      SELECT q.thread_id FROM likes l
      JOIN questions q ON l.content_id = q.id
      WHERE l.created_at > NOW() - INTERVAL '24 hours'
      UNION ALL
      -- Recent saves
      SELECT q.thread_id FROM saves s
      JOIN questions q ON s.content_id = q.id
      WHERE s.created_at > NOW() - INTERVAL '24 hours'
      UNION ALL
      -- Recent shares
      SELECT q.thread_id FROM shares sh
      JOIN questions q ON sh.content_id = q.id
      WHERE sh.created_at > NOW() - INTERVAL '24 hours'
      UNION ALL
      -- Recent comments
      SELECT q.thread_id FROM comments c
      JOIN answers a ON c.answer_id = a.id 
      JOIN questions q ON a.question_id = q.id 
      WHERE c.created_at > NOW() - INTERVAL '24 hours'
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
      (thread_likes * 3.0) +
      (thread_saves * 5.0) +
      (thread_shares * 4.0) +
      (thread_views * 0.1) +
      (question_likes_total * 2.0) +
      (answer_likes_total * 2.5) +
      (comment_likes_total * 1.5)
    ) as engagement_score,
    
    -- Content Score
    (
      (question_count * 1.5) +
    (answer_count * 2.0) +
      (comment_count * 1.0)
    ) as content_score,
    
    -- Time Decay (λ = 0.08)
    EXP(-0.08 * EXTRACT(EPOCH FROM (NOW() - updated_at)) / 3600) as time_decay,
    
    -- Velocity Multiplier
    (
      1 + (
        recent_engagement_24h::float / 
        NULLIF(
          thread_likes + thread_saves + thread_shares + 
          question_count + answer_count + comment_count +
          question_likes_total + answer_likes_total + comment_likes_total, 
          0
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
  engagement_score,
  content_score,
  time_decay,
  velocity_multiplier,
  -- Final Trending Score
  (engagement_score + content_score) * time_decay * velocity_multiplier as trending_score
FROM scored_threads
WHERE (engagement_score + content_score) >= 5  -- Minimum engagement threshold
ORDER BY trending_score DESC
LIMIT 10;  -- Top 10 trending threads
```

## Database Schema Requirements

To support this algorithm efficiently, ensure these tables/columns exist:

```sql
-- Metrics tables (should already exist based on metrics.ts)
CREATE TABLE IF NOT EXISTS likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  content_type TEXT NOT NULL,  -- 'thread', 'question', 'answer', 'comment'
  content_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, content_type, content_id)
);

CREATE TABLE IF NOT EXISTS saves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  content_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, content_type, content_id)
);

CREATE TABLE IF NOT EXISTS shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,  -- Optional for anonymous shares
  content_type TEXT NOT NULL,
  content_id TEXT NOT NULL,
  share_method TEXT,  -- 'copy_link', 'twitter', 'facebook', etc.
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,  -- Optional for anonymous views
  content_type TEXT NOT NULL,
  content_id TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_likes_content ON likes(content_type, content_id);
CREATE INDEX idx_likes_created ON likes(created_at);
CREATE INDEX idx_saves_content ON saves(content_type, content_id);
CREATE INDEX idx_shares_content ON shares(content_type, content_id);
CREATE INDEX idx_views_content ON views(content_type, content_id);

-- Materialized view or cached column for trending scores (optional but recommended)
ALTER TABLE threads ADD COLUMN trending_score REAL DEFAULT 0;
ALTER TABLE threads ADD COLUMN last_trending_update DATETIME DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX idx_threads_trending ON threads(trending_score DESC) WHERE is_public = 1;
```

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
  // Engagement weights
  threadLikeWeight: number;      // Default: 3.0
  threadSaveWeight: number;      // Default: 5.0
  threadShareWeight: number;     // Default: 4.0
  threadViewWeight: number;      // Default: 0.1
  questionLikeWeight: number;    // Default: 2.0
  answerLikeWeight: number;      // Default: 2.5
  commentLikeWeight: number;     // Default: 1.5
  
  // Content weights
  questionContentWeight: number; // Default: 1.5
  answerContentWeight: number;   // Default: 2.0
  commentContentWeight: number;  // Default: 1.0
  
  // Decay and velocity
  decayRate: number;             // Default: 0.08
  velocityWeight: number;        // Default: 0.8
  
  // Thresholds
  minEngagement: number;         // Default: 5
}

// Experiment with different parameter sets
const ALGORITHM_VARIANTS = {
  balanced: {
    threadSaveWeight: 5.0,
    threadShareWeight: 4.0,
    decayRate: 0.08,
    velocityWeight: 0.8
  },
  viral_focused: {
    threadSaveWeight: 4.0,
    threadShareWeight: 6.0,    // Emphasize shares
    decayRate: 0.12,           // Faster decay
    velocityWeight: 1.0        // Higher velocity bonus
  },
  quality_focused: {
    threadSaveWeight: 6.0,     // Emphasize saves
    threadShareWeight: 3.0,
    decayRate: 0.05,           // Slower decay
    velocityWeight: 0.5        // Lower velocity bonus
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

This updated trending algorithm leverages the comprehensive metrics system (likes, saves, views, shares) to provide a more accurate and nuanced measure of thread popularity. The algorithm:

- **Prioritizes quality engagement** (saves, shares) over passive metrics (views)
- **Rewards momentum** through velocity multipliers
- **Maintains freshness** via time decay
- **Prevents gaming** through rate limiting and pattern detection
- **Scales efficiently** via multi-layer caching

The TopN design makes it easy to surface the most relevant trending content to users while remaining performant and resistant to manipulation.