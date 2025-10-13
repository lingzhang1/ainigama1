<!-- d5686257-bd43-4f1f-b301-3c3f6a973f25 3ce7d861-4491-4d9c-a52b-113fcdc62741 -->
# Recommendation System Design & Implementation

## Overview

Implement a personalized recommendation system that suggests threads to users based on their implicit interactions (views, likes, saves, shares, time spent). The system uses content-based filtering initially with 70% personalization and 30% randomness for discovery, designed to evolve into hybrid collaborative filtering.

## Architecture Design

### Phase 1: Content-Based Filtering (Initial Implementation)

#### User Preference Profile

Track implicit signals to build user preference profiles:

- **Engagement Scores**: Weighted scoring system
  - View: 1 point
  - Like: 5 points
  - Save: 10 points
  - Share: 15 points
  - Time spent (per minute): 2 points
  - Created question: 20 points
  - Created answer: 15 points

- **Category Affinity**: Track user's preferred categories based on interaction frequency
- **Recency Decay**: Apply time-based decay (exponential) to give more weight to recent interactions

#### Recommendation Algorithm

**Content-Based Scoring Formula:**

```
score = (category_match_weight * 0.4) + 
        (creator_affinity * 0.3) + 
        (engagement_similarity * 0.2) + 
        (freshness_score * 0.1)
```

**70/30 Split Implementation:**

- Top 70% of recommendations: Personalized based on user profile
- Bottom 30%: Random selection from trending/recent threads (exploration)

**Diversity Mechanism:**

- Apply anti-saturation filter (limit same category to 40% of results)
- Time-window deduplication (don't show recently viewed threads)
- Creator diversity (limit same creator to 20% of results)

#### Performance Optimizations

- **Caching**: Cache user preference profiles (15-minute TTL)
- **Pre-computation**: Calculate category affinities and engagement scores in background
- **Batch Processing**: Update user profiles asynchronously
- **Indexing**: Add database indexes on user_id, content_type, created_at

### Phase 2: Hybrid Collaborative Filtering (Future Enhancement)

#### Item-Based Collaborative Filtering

- "Users who liked this also liked..." pattern
- Similarity matrix between threads based on co-engagement
- Update similarity scores periodically (daily batch job)

#### Cold Start Strategy

- New users: Show trending + random popular threads
- New threads: Boost visibility for 24 hours (seeding period)
- Gradual transition from exploration to exploitation as data grows

## Database Schema

### New Tables

#### Node.js/SQLite Schema

```sql
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

-- User preference profiles (cached)
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  category_affinities TEXT NOT NULL, -- JSON: {"tech": 45, "science": 30, ...}
  favorite_creators TEXT, -- JSON: ["creator1", "creator2"]
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
```

#### AWS DynamoDB Schema

```
Table: UserInteractions
- PK: user_id (String)
- SK: timestamp#thread_id (String) - for sorting by time
- GSI1PK: thread_id (String)
- GSI1SK: timestamp (Number)
- interaction_type (String)
- score (Number)
- metadata (Map)

Table: UserPreferences
- PK: user_id (String)
- category_affinities (Map)
- favorite_creators (List)
- total_engagement_score (Number)
- last_updated (Number)
- TTL: 900 seconds (15 minutes)

Table: RecommendationCache
- PK: user_id (String)
- SK: score#thread_id (String) - for sorting by score
- recommendation_type (String)
- thread_data (Map) - denormalized thread info
- expires_at (Number) - TTL attribute
```

## API Design

### Backend Endpoints

#### Node.js Server (`infrastructure/nodejs-server/server.js`)

```javascript
// Get recommended threads for user
GET /api/threads?filter=recommended&userId={userId}&limit={limit}&offset={offset}

Response:
{
  threads: [...],
  hasMore: boolean,
  recommendationType: "personalized" | "cold_start"
}

// Track user interaction (for recommendation engine)
POST /api/interactions
Body: {
  userId: string,
  threadId: string,
  interactionType: 'view' | 'like' | 'save' | 'share' | 'question' | 'answer' | 'time_spent',
  metadata?: { timeSpentSeconds?: number }
}

// Get user preference profile (for debugging/analytics)
GET /api/users/{userId}/preferences
Response: {
  categoryAffinities: { [category: string]: number },
  favoriteCreators: string[],
  totalEngagementScore: number
}
```

#### AWS Lambda Handlers (`infrastructure/aws/src/handlers/`)

- `recommendations.js` - New handler for recommendation logic
  - `getRecommendedThreads()` - Main recommendation endpoint
  - `trackInteraction()` - Track user interactions
  - `getUserPreferences()` - Fetch cached user preferences

## Frontend Integration

### TypeScript Changes

**`src/types/index.ts`**

- Add `'recommended'` to `FeedFilter` type
- Add interaction tracking types:
```typescript
export type InteractionType = 'view' | 'like' | 'save' | 'share' | 'question' | 'answer' | 'time_spent';

export interface UserInteraction {
  userId: string;
  threadId: string;
  interactionType: InteractionType;
  metadata?: {
    timeSpentSeconds?: number;
  };
}
```


**`src/components/ForumFeed/ForumFeed.tsx`**

- Update line 264: Change filter from `'recent'` to `'recommended'`
- Add interaction tracking when:
  - Thread is clicked (view)
  - Thread is visible for >5 seconds (time_spent)
  - User likes, saves, or shares thread (already tracked by metrics)

**`src/services/recommendations.ts`** (new file)

- `trackThreadView(threadId, userId)` - Track view interaction
- `trackTimeSpent(threadId, userId, seconds)` - Track engagement time
- `getRecommendedThreads(userId, limit, offset)` - Fetch recommendations

### UI/UX Considerations

- Show "✨ For You" label when recommendations are personalized
- Show "🔥 Popular" label when showing exploration/trending threads
- Add empty state: "Interact with threads to see personalized recommendations"
- Loading skeleton during recommendation computation

## Implementation Priority

### Must-Have (Phase 1)

1. Database schema for user_interactions and user_preferences
2. Basic content-based recommendation algorithm
3. Track view, like, save, share interactions
4. 70/30 personalized/random split
5. Frontend: Update FeedFilter to support 'recommended'
6. Backend: Implement recommendation endpoints (both Node.js and AWS)

### Nice-to-Have (Future)

1. Time-spent tracking with visibility API
2. Item-based collaborative filtering
3. A/B testing framework for algorithm tuning
4. Real-time recommendation updates via WebSocket
5. Admin dashboard for recommendation analytics

## Performance Targets

- Recommendation API response time: <500ms (p95)
- Cache hit rate: >80% for user preferences
- Background profile update frequency: Every 5 minutes
- Recommendation refresh: Every 15 minutes or on explicit user action

## Testing Strategy

1. Unit tests for scoring algorithms
2. Integration tests for API endpoints
3. Load testing for 10k concurrent users
4. A/B testing: Compare CTR between recent/trending vs recommended feeds

## Migration Plan

1. Deploy database schema changes (backwards compatible)
2. Start collecting interaction data (passive tracking)
3. Build recommendation engine (compute in background)
4. Enable recommendation tab for beta users
5. Gradual rollout to all users
6. Monitor metrics: CTR, engagement time, user retention

## Key Files to Modify

**Database:**

- `infrastructure/nodejs-server/migrations/add_recommendation_system.sql` (new)
- `infrastructure/aws/serverless.yml` (add DynamoDB tables)

**Backend:**

- `infrastructure/nodejs-server/server.js` (add endpoints)
- `infrastructure/aws/src/handlers/recommendations.js` (new)
- `infrastructure/aws/src/handlers/threads.js` (integrate recommendations)

**Frontend:**

- `src/types/index.ts` (add types)
- `src/components/ForumFeed/ForumFeed.tsx` (update filter logic)
- `src/services/recommendations.ts` (new)
- `src/context/AppContext.tsx` (no changes needed, already supports filter)

## Success Metrics

- **Engagement**: +25% increase in average session time
- **Discovery**: Users view 30% more diverse thread categories
- **Retention**: +15% improvement in 7-day user retention
- **CTR**: Recommendation feed CTR 2x higher than recent feed

### To-dos

- [x] Create database migration files for user_interactions, user_preferences, and recommendation_cache tables for both SQLite and DynamoDB
- [x] Update TypeScript types to add 'recommended' to FeedFilter and create interaction tracking types
- [x] Create recommendation service with content-based filtering algorithm, 70/30 split logic, and scoring formula
- [x] Implement recommendation endpoints in Node.js server (get recommended threads, track interactions, get user preferences)
- [x] Create AWS Lambda recommendations handler with DynamoDB integration
- [x] Update ForumFeed.tsx to support recommended filter and add interaction tracking hooks
- [x] Implement background job to periodically update user preference profiles and recommendation cache
- [x] Add unit tests for recommendation algorithm and integration tests for API endpoints