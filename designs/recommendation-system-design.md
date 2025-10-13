# Recommendation System Design & Implementation

> ⚠️ **UPDATE**: This document describes the current implementation. For the future AWS-only unified system that combines trending and recommendations, see [unified-content-discovery-system.md](./unified-content-discovery-system.md).

## Overview

A personalized recommendation system for forum threads using content-based filtering with implicit user interactions. The system features a 70/30 personalization-to-randomness ratio for discovery and is designed to evolve into hybrid collaborative filtering.

**Status**: ✅ Implemented (Current)  
**Implementation Date**: October 2025  
**Version**: 1.0  
**Backend**: AWS Lambda + DynamoDB (+ Node.js server - being phased out)

---

## Architecture

### Content-Based Filtering (Phase 1)

The recommendation engine uses content-based filtering to match user preferences with thread characteristics.

#### User Preference Profile

User preferences are built from implicit signals:

| Interaction Type | Score | Description |
|-----------------|-------|-------------|
| View | 1 | Thread viewed |
| Like | 5 | Thread or content liked |
| Save | 10 | Thread bookmarked |
| Share | 15 | Thread shared externally |
| Time spent | 2/min | Time engaged with thread |
| Question asked | 20 | User created question |
| Answer provided | 15 | User provided answer |

**Preference Calculation:**
- **Category Affinity**: Normalized score (0-100) per category based on interaction history
- **Favorite Creators**: Top 10 creators user interacts with most
- **Recency Decay**: Last 90 days of interactions considered
- **Total Engagement Score**: Sum of all interaction scores

#### Recommendation Algorithm

**Scoring Formula:**
```
thread_score = (category_match * 0.4) + 
               (creator_affinity * 0.3) + 
               (engagement_similarity * 0.2) + 
               (freshness_score * 0.1)
```

**70/30 Personalization-Exploration Split:**
- 70% (14 threads): Top scored threads based on user preferences
- 30% (6 threads): Random selection from trending/recent threads
- Final results shuffled to avoid predictable patterns

**Diversity Mechanisms:**
- **Category Diversity**: Max 40% of threads from same category
- **Creator Diversity**: Max 20% of threads from same creator
- **Deduplication**: Filter out threads viewed in last 7 days

**Cold Start Strategy:**
- New users with no interactions receive trending threads
- Gradual transition to personalized as engagement grows

---

## Database Schema

### SQLite (Node.js Server)

```sql
-- User Interactions
CREATE TABLE user_interactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  interaction_type TEXT NOT NULL CHECK (
    interaction_type IN ('view', 'like', 'save', 'share', 'question', 'answer', 'time_spent')
  ),
  score INTEGER NOT NULL,
  metadata TEXT, -- JSON: { timeSpentSeconds?: number }
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id),
  FOREIGN KEY (thread_id) REFERENCES threads (id)
);

CREATE INDEX idx_user_interactions_user ON user_interactions(user_id, created_at DESC);
CREATE INDEX idx_user_interactions_thread ON user_interactions(thread_id, created_at DESC);

-- User Preferences (Cached)
CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY,
  category_affinities TEXT NOT NULL DEFAULT '{}',
  favorite_creators TEXT DEFAULT '[]',
  total_engagement_score INTEGER DEFAULT 0,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id)
);

-- Recommendation Cache
CREATE TABLE recommendation_cache (
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
```

### DynamoDB (AWS Lambda)

```yaml
UserInteractionsTable:
  PK: id (String)
  Attributes:
    - user_id (String)
    - thread_id (String)
    - interaction_type (String)
    - score (Number)
    - metadata (Map)
    - created_at (String)
  GSI:
    - UserIdIndex: user_id (PK), created_at (SK)
    - ThreadIdIndex: thread_id (PK), created_at (SK)

UserPreferencesTable:
  PK: user_id (String)
  Attributes:
    - category_affinities (Map)
    - favorite_creators (List)
    - total_engagement_score (Number)
    - last_updated (Number)
    - ttl (Number) - 15 minute cache

RecommendationCacheTable:
  PK: id (String)
  Attributes:
    - user_id (String)
    - thread_id (String)
    - score (Number)
    - recommendation_type (String)
    - expires_at (Number) - TTL attribute
  GSI:
    - UserIdScoreIndex: user_id (PK), score (SK)
```

---

## API Endpoints

### Node.js Server

#### Get Recommended Threads
```http
GET /api/recommendations/threads?userId={userId}&limit={limit}&offset={offset}
```

**Response:**
```json
{
  "threads": [...],
  "hasMore": boolean,
  "recommendationType": "personalized" | "cold_start" | "exploration"
}
```

#### Track Interaction
```http
POST /api/interactions
Content-Type: application/json

{
  "userId": "user-123",
  "threadId": "thread-456",
  "interactionType": "view" | "like" | "save" | "share" | "question" | "answer" | "time_spent",
  "metadata": {
    "timeSpentSeconds": 120
  }
}
```

**Response:**
```json
{
  "success": true
}
```

#### Get User Preferences
```http
GET /api/users/{userId}/preferences
```

**Response:**
```json
{
  "userId": "user-123",
  "categoryAffinities": {
    "tech": 80,
    "science": 60
  },
  "favoriteCreators": ["creator-1", "creator-2"],
  "totalEngagementScore": 500,
  "lastUpdated": "2025-10-13T10:00:00Z"
}
```

### Integration with Existing Endpoint

The existing `/api/threads` endpoint now supports the `recommended` filter:

```http
GET /api/threads?filter=recommended&userId={userId}&limit=20&offset=0
```

This delegates internally to `/api/recommendations/threads` for personalized results.

---

## Frontend Integration

### Updated Types

```typescript
// Added to FeedFilter type
export type FeedFilter = 'recent' | 'trending' | 'recommended';

// New types for recommendations
export type InteractionType = 'view' | 'like' | 'save' | 'share' | 'question' | 'answer' | 'time_spent';

export interface UserInteraction {
  userId: string;
  threadId: string;
  interactionType: InteractionType;
  metadata?: {
    timeSpentSeconds?: number;
  };
}

export interface UserPreferences {
  userId: string;
  categoryAffinities: Record<string, number>;
  favoriteCreators: string[];
  totalEngagementScore: number;
  lastUpdated: Date;
}

export interface RecommendedThreadsResponse {
  threads: Thread[];
  hasMore: boolean;
  recommendationType: 'personalized' | 'cold_start' | 'exploration';
}
```

### Recommendation Service

New service file: `src/services/recommendations.ts`

Key functions:
- `trackThreadView(threadId, userId)` - Track view interaction
- `trackTimeSpent(threadId, userId, seconds)` - Track engagement time
- `trackInteraction(userId, threadId, type, metadata)` - Generic tracker
- `getRecommendedThreads(userId, limit, offset)` - Fetch recommendations
- `getUserPreferences(userId)` - Get user profile

### ForumFeed Component Updates

**Filter Button:**
```tsx
<button
  onClick={() => dispatch({ type: 'SET_FEED_FILTER', payload: 'recommended' })}
  className={`p-2 rounded-lg ${state.feedFilter === 'recommended' ? 'bg-green-100 text-green-700' : 'hover:bg-gray-100 text-gray-600'}`}
  title="For You"
>
  <SparklesIcon className="w-5 h-5" />
</button>
```

**Interaction Tracking:**
```tsx
const handleThreadClick = (threadId: string) => {
  // Track view for metrics
  handleViewThread(threadId);
  
  // Track view for recommendations
  if (state.currentUser?.id) {
    trackThreadView(threadId, state.currentUser.id);
  }
  
  navigate(`/thread/${threadId}`);
};
```

**Load Threads with UserId:**
```tsx
const userIdParam = state.currentUser?.id ? `&userId=${state.currentUser.id}` : '';
const response = await fetch(
  `${apiUrl}/threads?filter=${state.feedFilter}&limit=${PAGE_SIZE}&offset=${offset}${userIdParam}`
);
```

---

## Background Jobs

### Update User Preferences Job

**File**: `infrastructure/nodejs-server/background-jobs/update-preferences.js`

**Purpose**: Periodically recalculate user preferences based on recent interactions

**Schedule**: Every 5 minutes (recommended)

**Process**:
1. Identify users with interactions in last 7 days
2. Analyze last 90 days of interactions per user
3. Calculate category affinities (normalized 0-100)
4. Identify top 10 favorite creators
5. Update `user_preferences` table

**Setup Options**:

1. **Cron (Linux/Mac)**:
```bash
*/5 * * * * cd /path/to/ainigama/infrastructure/nodejs-server && node background-jobs/update-preferences.js
```

2. **PM2 (Production)**:
```javascript
{
  name: 'update-preferences',
  script: 'background-jobs/update-preferences.js',
  cron_restart: '*/5 * * * *',
  autorestart: false
}
```

3. **AWS EventBridge** (serverless.yml):
```yaml
updatePreferencesJob:
  handler: src/handlers/recommendations.updatePreferencesJob
  events:
    - schedule:
        rate: rate(5 minutes)
```

**Performance**:
- ~50-100ms per user
- Scales linearly with active users
- Minimal memory usage (<100MB)

---

## Performance Optimizations

### Caching Strategy

1. **User Preferences**: 15-minute TTL
   - Cached in `user_preferences` table
   - Auto-expires via TTL in DynamoDB
   - Updated asynchronously on interactions

2. **Recommendation Results**: 15-minute cache (optional, not yet implemented)
   - Can be stored in `recommendation_cache` table
   - Reduces computation for frequently accessed recommendations

### Database Indexing

**Critical Indexes**:
```sql
-- User interactions lookup
CREATE INDEX idx_user_interactions_user ON user_interactions(user_id, created_at DESC);

-- Thread interactions lookup  
CREATE INDEX idx_user_interactions_thread ON user_interactions(thread_id, created_at DESC);

-- Interaction type filtering
CREATE INDEX idx_user_interactions_type ON user_interactions(interaction_type, created_at DESC);

-- Recommendation cache lookup
CREATE INDEX idx_recommendation_cache_user ON recommendation_cache(user_id, score DESC, expires_at);
```

### Query Optimization

1. **Pagination**: Load 100 threads, score them, then paginate results
2. **Recent Filter**: Only fetch threads user hasn't viewed in 7 days
3. **Batch Operations**: Update preferences async, don't block responses
4. **GSI Usage**: DynamoDB queries use Global Secondary Indexes for efficiency

---

## Testing

### Unit Tests

**File**: `src/services/__tests__/recommendations.test.ts`

**Coverage**:
- ✅ Interaction score weights
- ✅ Thread scoring algorithm
- ✅ Category affinity calculation
- ✅ Creator affinity weighting
- ✅ Freshness scoring
- ✅ Engagement similarity
- ✅ 70/30 split logic
- ✅ Diversity filters (category & creator limits)
- ✅ Recently viewed deduplication

**Run Tests**:
```bash
npm test -- recommendations.test.ts
```

### Integration Testing

**Manual Testing Steps**:

1. **New User (Cold Start)**:
   - Login as new user
   - Click recommendation icon
   - Verify trending/recent threads shown
   - Check `recommendationType: 'cold_start'` in response

2. **Build Preferences**:
   - Interact with threads (view, like, save)
   - Wait 5 minutes for background job
   - Check `/api/users/{userId}/preferences`
   - Verify category affinities calculated

3. **Personalized Recommendations**:
   - Click recommendation icon after interactions
   - Verify personalized threads shown
   - Check `recommendationType: 'personalized'`
   - Verify 70/30 split (mix of high-scored + random)

4. **Diversity**:
   - Verify max 40% threads from same category
   - Verify max 20% threads from same creator
   - Verify recently viewed threads filtered out

---

## Monitoring & Metrics

### Key Metrics to Track

1. **Engagement Metrics**:
   - Click-through rate (CTR) on recommended threads
   - Average session time with recommendations
   - User retention (7-day, 30-day)

2. **System Metrics**:
   - Recommendation API response time (target: <500ms p95)
   - Preference update job duration
   - Cache hit rate (target: >80%)

3. **Quality Metrics**:
   - Category diversity score
   - Creator diversity score
   - Recommendation freshness

### Success Criteria

- ✅ Recommendation API < 500ms response time
- ✅ 70/30 split maintained
- ✅ Category diversity: no category > 40%
- ✅ Creator diversity: no creator > 20%
- ✅ Cold start users receive results
- ⏳ CTR improvement (to be measured)
- ⏳ Session time increase (to be measured)

---

## Migration & Deployment

### Step 1: Database Migration

**SQLite (Local/Node.js)**:
```bash
cd infrastructure/nodejs-server
sqlite3 ainigama.db < migrations/add_recommendation_system.sql
```

**DynamoDB (AWS)**:
```bash
cd infrastructure/aws
serverless deploy
```

This creates:
- UserInteractionsTable
- UserPreferencesTable  
- RecommendationCacheTable

### Step 2: Deploy Backend

**Node.js Server**:
```bash
cd infrastructure/nodejs-server
npm install
pm2 restart ainigama-server
```

**AWS Lambda**:
```bash
cd infrastructure/aws
npm install
serverless deploy
```

### Step 3: Deploy Frontend

```bash
npm install
npm run build
# Deploy dist/ folder to hosting
```

### Step 4: Start Background Jobs

**Option A: PM2**
```bash
pm2 start ecosystem.config.js
pm2 save
```

**Option B: Cron**
```bash
crontab -e
# Add: */5 * * * * cd /path && node background-jobs/update-preferences.js
```

**Option C: AWS EventBridge**
- Automatically deployed with serverless.yml

### Step 5: Monitor

1. Check logs for errors
2. Verify recommendations API works
3. Test with real users
4. Monitor performance metrics

---

## Future Enhancements (Phase 2)

### Collaborative Filtering

**Item-Based CF**:
- Build similarity matrix between threads
- "Users who liked this also liked..."
- Update matrix daily via batch job

**Implementation**:
```sql
CREATE TABLE thread_similarity (
  thread_a_id TEXT NOT NULL,
  thread_b_id TEXT NOT NULL,
  similarity_score REAL NOT NULL,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (thread_a_id, thread_b_id)
);
```

### Advanced Features

1. **Real-time Updates**: WebSocket notifications for new recommendations
2. **A/B Testing**: Framework for testing algorithm variants
3. **Explicit Feedback**: Allow users to dismiss/hide recommendations
4. **Category Preferences**: Let users set explicit category preferences
5. **Time-based Patterns**: Consider when user is most active
6. **Social Signals**: Factor in friend/follower activity
7. **Multi-armed Bandit**: Optimize exploration/exploitation ratio dynamically

### Analytics Dashboard

**Metrics to Display**:
- Total recommendations served
- Average CTR by recommendation type
- Category distribution in recommendations
- User preference evolution over time
- A/B test results

---

## Troubleshooting

### Issue: No Recommendations Shown

**Possible Causes**:
1. User not authenticated (userId missing)
2. No public threads available
3. API endpoint error

**Debug**:
```bash
# Check API response
curl 'http://localhost:3002/api/recommendations/threads?userId=USER_ID&limit=20'

# Check database
sqlite3 ainigama.db "SELECT COUNT(*) FROM threads WHERE is_public = 1;"
```

### Issue: Always Cold Start

**Possible Causes**:
1. User has no interactions
2. Preference update job not running
3. Preferences table empty

**Debug**:
```bash
# Check interactions
sqlite3 ainigama.db "SELECT COUNT(*) FROM user_interactions WHERE user_id = 'USER_ID';"

# Check preferences
sqlite3 ainigama.db "SELECT * FROM user_preferences WHERE user_id = 'USER_ID';"

# Manually run update job
node background-jobs/update-preferences.js
```

### Issue: Poor Recommendations

**Possible Causes**:
1. Limited interaction data
2. No category diversity in threads
3. Algorithm weights need tuning

**Solutions**:
1. Encourage more user interactions
2. Add more diverse thread content
3. Adjust scoring formula weights in code

---

## References

### Design Documents
- `/designs/recommendation-system-design.md` (this file)
- `/designs/thread-metrics-design.md`
- `/designs/performance-optimization-design.md`

### Implementation Files

**Frontend**:
- `/src/types/index.ts` - Type definitions
- `/src/services/recommendations.ts` - Service layer
- `/src/components/ForumFeed/ForumFeed.tsx` - UI integration
- `/src/services/__tests__/recommendations.test.ts` - Unit tests

**Backend (Node.js)**:
- `/infrastructure/nodejs-server/server.js` - API endpoints (lines 1401-1755)
- `/infrastructure/nodejs-server/migrations/add_recommendation_system.sql` - DB schema
- `/infrastructure/nodejs-server/background-jobs/update-preferences.js` - Batch job
- `/infrastructure/nodejs-server/background-jobs/README.md` - Job documentation

**Backend (AWS)**:
- `/infrastructure/aws/serverless.yml` - Lambda config & DynamoDB tables
- `/infrastructure/aws/src/handlers/recommendations.js` - Lambda functions
- `/infrastructure/aws/src/utils/db.js` - Database utilities

### External Resources
- [Collaborative Filtering - Wikipedia](https://en.wikipedia.org/wiki/Collaborative_filtering)
- [Content-Based Filtering](https://en.wikipedia.org/wiki/Recommender_system#Content-based_filtering)
- [RecBole Framework](https://github.com/RUCAIBox/RecBole)
- [AWS DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)

---

**Document Version**: 1.0  
**Last Updated**: October 13, 2025  
**Author**: AI Implementation Team  
**Status**: ✅ Complete

