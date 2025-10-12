# Performance Optimization Design for PublicThread and ForumFeed

## Overview

This document provides a comprehensive performance optimization strategy to reduce load times and API requests in the PublicThread and ForumFeed components.

---

## Current Performance Issues

### PublicThread.tsx Bottlenecks

#### Issue 1: Loading All Comments Immediately
**Current Code** (lines 546-580):
```typescript
// Loads comments for EVERY answer, even if user won't view them
for (const answer of allAnswers) {
  const commentsResponse = await fetch(`${apiUrl}/answers/${answer.id}/comments`);
  if (commentsResponse.ok) {
    const commentsData = await commentsResponse.json();
    setComments(prev => ({ ...prev, [answer.id]: commentsData }));
  }
}
```

**Problem**:
- If thread has 10 answers, makes 10 API calls
- Most users won't open all comment panels
- Wastes bandwidth and time

**Impact**: ~2-3 seconds per 10 answers

---

#### Issue 2: Individual Interaction State Loading
**Current Code** (lines 526-543, 558-575):
```typescript
// Makes separate API call for EACH answer's likes
for (const answer of allAnswers) {
  const likesResponse = await metricsService.getLikes('answer', answer.id, userId);
  // ... 
}

// Then makes separate call for EACH comment's likes
for (const comment of commentsData) {
  const commentLikesResponse = await metricsService.getLikes('comment', comment.id, userId);
  // ...
}
```

**Problem**:
- If thread has 10 answers + 20 comments = 30 API calls
- Sequential loading (await in loop)
- Very slow for large threads

**Impact**: ~5-10 seconds for large threads

---

#### Issue 3: Duplicate User Fetching
**Current Code** (lines 593-607):
```typescript
// Loads comments AGAIN to collect user IDs (already loaded above!)
Object.values(answersData).flat().forEach(async (answer: any) => {
  const commentsResponse = await fetch(`${apiUrl}/answers/${answer.id}/comments`);
  // ...
});
```

**Problem**:
- Loads same comment data twice
- Inefficient user collection

**Impact**: Doubles comment loading time

---

### ForumFeed.tsx Bottlenecks

#### Issue 1: No Pagination
**Current Code**:
```typescript
// Loads ALL threads at once (could be 100+)
const response = await fetch(`${apiUrl}/threads?filter=${state.feedFilter}`);
```

**Problem**:
- Loads all threads regardless of visible area
- No infinite scroll
- Heavy initial load

**Impact**: ~2-5 seconds for 50+ threads

---

## Optimization Strategy

### Priority 1: Lazy Load Comments (Critical)

#### Design: Load Comments On-Demand

**When to Load**:
- Only when comment panel is opened for an answer
- Not during initial thread load

**Implementation**:

```typescript
// REMOVE from initial load (lines 546-580)
// DELETE THIS BLOCK

// ADD to comment panel open handler
const handleOpenComments = async (answerId: string) => {
  setCommentPanelOpen(answerId);
  
  // Check if comments already loaded
  if (!comments[answerId] || comments[answerId].length === 0) {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
      const commentsResponse = await fetch(`${apiUrl}/answers/${answerId}/comments`);
      
      if (commentsResponse.ok) {
        const commentsData = await commentsResponse.json();
        setComments(prev => ({ ...prev, [answerId]: commentsData }));
        
        // Load user interaction states for these comments
        if (state.currentUser?.id) {
          await loadCommentInteractionStates(commentsData, state.currentUser.id);
        }
      }
    } catch (error) {
      console.error('Failed to load comments:', error);
    }
  }
};
```

**Benefits**:
- ✅ Eliminates 10-20 API calls on initial load
- ✅ Loads only when needed
- ✅ Faster initial render (~2-3 seconds saved)

---

### Priority 2: Batch Interaction State Loading

#### Design: Single Batch API Call

**Current**: N individual calls
**Optimized**: 1 batch call per content type

**New Backend Endpoint**:

```javascript
// infrastructure/aws/src/handlers/metrics.js

// GET /user/{userId}/interactions?threadId={threadId}
exports.getUserInteractionsForThread = async (event) => {
  const { userId } = event.pathParameters;
  const { threadId } = event.queryStringParameters;
  
  // Get all likes for user in this thread
  const likesResult = await dbOperations.query(
    tables.likes,
    'user_id = :userId',
    { ':userId': userId },
    'UserIdIndex'
  );
  
  // Get all saves for user in this thread
  const savesResult = await dbOperations.query(
    tables.saves,
    'user_id = :userId',
    { ':userId': userId },
    'UserIdIndex'
  );
  
  // Filter to only items in this thread and structure by content type
  const threadLikes = likesResult.Items.filter(/* belongs to thread */);
  const threadSaves = savesResult.Items.filter(/* belongs to thread */);
  
  return {
    likes: {
      threads: threadLikes.filter(l => l.content_type === 'thread'),
      answers: threadLikes.filter(l => l.content_type === 'answer'),
      comments: threadLikes.filter(l => l.content_type === 'comment')
    },
    saves: {
      threads: threadSaves.filter(s => s.content_type === 'thread'),
      answers: threadSaves.filter(s => s.content_type === 'answer'),
      comments: threadSaves.filter(s => s.content_type === 'comment')
    }
  };
};
```

**Frontend Usage**:

```typescript
// Single API call instead of N calls
const interactions = await fetch(`${apiUrl}/users/${userId}/interactions?threadId=${threadId}`);
const data = await interactions.json();

// Build interaction state map
const interactionMap = {};
data.likes.answers.forEach(like => {
  interactionMap[`answer_${like.content_id}`] = {
    ...interactionMap[`answer_${like.content_id}`],
    isLiked: true
  };
});
data.saves.answers.forEach(save => {
  interactionMap[`answer_${save.content_id}`] = {
    ...interactionMap[`answer_${save.content_id}`],
    isSaved: true
  };
});

setContentInteractions(interactionMap);
```

**Benefits**:
- ✅ 30 API calls → 1 API call
- ✅ ~5-10 seconds saved
- ✅ Parallel loading possible

---

### Priority 3: Parallel Loading

#### Design: Load Everything in Parallel

**Current** (Sequential):
```typescript
// Thread details
const threadResponse = await fetch(...);

// Then answers (waits for thread)
const answersResponse = await fetch(...);

// Then comments for each answer (waits for answers)
for (const answer of allAnswers) {
  await fetch(...); // Sequential!
}
```

**Optimized** (Parallel):
```typescript
// Load thread, answers, and user interactions in parallel
const [threadResponse, answersResponse, interactionsResponse] = await Promise.all([
  fetch(`${apiUrl}/threads/${currentThreadId}`),
  fetch(`${apiUrl}/threads/${currentThreadId}/answers`),
  state.currentUser?.id 
    ? fetch(`${apiUrl}/users/${state.currentUser.id}/interactions?threadId=${currentThreadId}`)
    : Promise.resolve(null)
]);

const [threadData, answersData, interactionsData] = await Promise.all([
  threadResponse.json(),
  answersResponse.json(),
  interactionsResponse?.json()
]);
```

**Benefits**:
- ✅ ~3-5 seconds saved
- ✅ Faster perceived performance
- ✅ Better use of network bandwidth

---

### Priority 4: Optimize Deep Link Loading

#### Design: Targeted Loading for Deep Links

**Strategy**: If navigating to specific answer, only load that question's data initially

**Implementation**:

```typescript
useEffect(() => {
  const loadThread = async () => {
    if (!currentThreadId) return;
    
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
    
    // Determine if this is a deep link
    const isDeepLink = !!(answerId || questionId || commentId);
    
    if (isDeepLink && answerId) {
      // FAST PATH: Load minimal data for deep link
      console.log('🚀 Fast path: Deep link to answer, loading minimal data');
      
      // Load thread metadata + specific answer + its question in parallel
      const [threadRes, answerRes] = await Promise.all([
        fetch(`${apiUrl}/threads/${currentThreadId}`),
        fetch(`${apiUrl}/answers/${answerId}`) // New endpoint
      ]);
      
      const threadData = await threadRes.json();
      const answerData = await answerRes.json();
      
      setThread(threadData);
      
      // Set just this answer
      setAnswers({ [answerData.questionId]: [answerData] });
      
      // Load remaining answers in background (after navigation)
      setTimeout(() => loadRemainingAnswers(), 1000);
      
    } else {
      // NORMAL PATH: Load everything
      console.log('📚 Normal path: Loading full thread');
      // ... existing load logic
    }
  };
}, [currentThreadId, answerId]);
```

**Benefits**:
- ✅ Deep links load in <1 second
- ✅ User sees target content immediately
- ✅ Rest loads in background

---

### Priority 5: Cache Thread Data

#### Design: In-Memory Cache with Expiry

**Implementation**:

```typescript
// src/utils/threadCache.ts

interface CachedThread {
  data: any;
  timestamp: number;
  expiresIn: number; // milliseconds
}

class ThreadCache {
  private cache: Map<string, CachedThread> = new Map();
  private defaultExpiry = 5 * 60 * 1000; // 5 minutes

  get(threadId: string): any | null {
    const cached = this.cache.get(threadId);
    
    if (!cached) return null;
    
    // Check if expired
    if (Date.now() - cached.timestamp > cached.expiresIn) {
      this.cache.delete(threadId);
      return null;
    }
    
    console.log('✅ Using cached thread data for:', threadId);
    return cached.data;
  }

  set(threadId: string, data: any, expiresIn: number = this.defaultExpiry) {
    this.cache.set(threadId, {
      data,
      timestamp: Date.now(),
      expiresIn
    });
  }

  invalidate(threadId: string) {
    this.cache.delete(threadId);
  }

  clear() {
    this.cache.clear();
  }
}

export const threadCache = new ThreadCache();
```

**Usage in PublicThread**:

```typescript
useEffect(() => {
  const loadThread = async () => {
    // Check cache first
    const cached = threadCache.get(currentThreadId);
    if (cached) {
      setThread(cached.thread);
      setAnswers(cached.answers);
      setIsLoading(false);
      return;
    }
    
    // Load from API if not cached
    const data = await fetchThreadData(currentThreadId);
    
    // Cache for future use
    threadCache.set(currentThreadId, data);
    
    setThread(data.thread);
    setAnswers(data.answers);
  };
}, [currentThreadId]);
```

**Benefits**:
- ✅ Instant load for revisited threads
- ✅ Reduces server load
- ✅ Better UX for back/forward navigation

---

### Priority 6: Prefetch on Hover (ForumFeed)

#### Design: Load Thread Data on Hover

**Implementation**:

```typescript
// ForumFeed.tsx

const [prefetchedThreads, setPrefetchedThreads] = useState<Set<string>>(new Set());

const handleThreadHover = async (threadId: string) => {
  // Only prefetch once
  if (prefetchedThreads.has(threadId)) return;
  
  setPrefetchedThreads(prev => new Set(prev).add(threadId));
  
  // Prefetch thread data in background
  try {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
    const [threadRes, answersRes] = await Promise.all([
      fetch(`${apiUrl}/threads/${threadId}`),
      fetch(`${apiUrl}/threads/${threadId}/answers`)
    ]);
    
    const [threadData, answersData] = await Promise.all([
      threadRes.json(),
      answersRes.json()
    ]);
    
    // Store in cache
    threadCache.set(threadId, { thread: threadData, answers: answersData });
    console.log('✅ Prefetched thread:', threadId);
  } catch (error) {
    console.error('Prefetch failed:', error);
  }
};

// In thread card render
<Card
  onMouseEnter={() => handleThreadHover(thread.id)}
  onClick={() => handleThreadClick(thread.id)}
>
```

**Benefits**:
- ✅ Thread loads instantly when clicked
- ✅ No perceived delay
- ✅ Better UX

---

### Priority 7: Pagination for ForumFeed

#### Design: Infinite Scroll with Page Size

**Implementation**:

```typescript
// ForumFeed.tsx

const [threads, setThreads] = useState<Thread[]>([]);
const [hasMore, setHasMore] = useState(true);
const [page, setPage] = useState(0);
const PAGE_SIZE = 10;

const loadThreads = async (pageNum: number = 0, append: boolean = false) => {
  try {
    setIsLoading(true);
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
    
    const response = await fetch(
      `${apiUrl}/threads?filter=${state.feedFilter}&limit=${PAGE_SIZE}&offset=${pageNum * PAGE_SIZE}`
    );
    
    if (response.ok) {
      const { threads: loadedThreads, hasMore: more } = await response.json();
      
      if (append) {
        setThreads(prev => [...prev, ...loadedThreads]);
      } else {
        setThreads(loadedThreads);
      }
      
      setHasMore(more);
      setPage(pageNum);
    }
  } finally {
    setIsLoading(false);
  }
};

// Infinite scroll handler
const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
  const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
  
  if (scrollHeight - scrollTop <= clientHeight * 1.5 && hasMore && !isLoading) {
    loadThreads(page + 1, true);
  }
};

// In render
<div className="overflow-y-auto" onScroll={handleScroll}>
  {threads.map(thread => ...)}
</div>
```

**Backend Update Required**:

```javascript
// infrastructure/aws/src/handlers/threads.js (getThreads function)

const { limit = '20', offset = '0' } = event.queryStringParameters || {};
const limitNum = parseInt(limit);
const offsetNum = parseInt(offset);

// Apply pagination
const paginatedThreads = sortedItems.slice(offsetNum, offsetNum + limitNum);
const hasMore = sortedItems.length > offsetNum + limitNum;

return {
  threads: paginatedThreads,
  hasMore: hasMore,
  total: sortedItems.length
};
```

**Benefits**:
- ✅ Initial load: 50 threads → 10 threads
- ✅ ~70% faster initial render
- ✅ Smooth infinite scroll

---

### Priority 8: Optimize User Data Loading

#### Design: Batch User Fetch API

**New Backend Endpoint**:

```javascript
// GET /users/batch?ids=id1,id2,id3

exports.getBatchUsers = async (event) => {
  const { ids } = event.queryStringParameters;
  const userIds = ids.split(',');
  
  // Batch get from DynamoDB
  const users = await Promise.all(
    userIds.map(id => dbOperations.get(tables.users, { id }))
  );
  
  return {
    users: users.map(r => r.Item).filter(Boolean)
  };
};
```

**Frontend Usage**:

```typescript
// Instead of individual fetches
const userPromises = userIds.map(id => fetchUserInfo(id));
await Promise.all(userPromises);

// Use batch fetch
const idsString = Array.from(userIds).join(',');
const response = await fetch(`${apiUrl}/users/batch?ids=${idsString}`);
const { users: batchUsers } = await response.json();
```

**Benefits**:
- ✅ 20 API calls → 1 API call
- ✅ Lower latency
- ✅ Faster user data loading

---

### Priority 9: Remove Duplicate User Fetching

#### Fix: Collect User IDs from Loaded Data

**Replace lines 593-607**:

```typescript
// BEFORE: Loads comments again
Object.values(answersData).flat().forEach(async (answer: any) => {
  const commentsResponse = await fetch(...); // DUPLICATE!
});

// AFTER: Use already loaded data
const userIds = new Set<string>();

// Collect from answers
Object.values(answersData).flat().forEach((answer: any) => {
  if (answer.userId && !answer.isAI) {
    userIds.add(answer.userId);
  }
});

// Collect from already loaded comments (if any)
Object.values(comments).flat().forEach((comment: any) => {
  if (comment.userId) {
    userIds.add(comment.userId);
  }
});

// Batch fetch users
if (userIds.size > 0) {
  const idsString = Array.from(userIds).join(',');
  const usersResponse = await fetch(`${apiUrl}/users/batch?ids=${idsString}`);
  const { users: batchUsers } = await usersResponse.json();
  
  const userMap = {};
  batchUsers.forEach(user => { userMap[user.id] = user; });
  setUsers(userMap);
}
```

**Benefits**:
- ✅ Eliminates duplicate comment loading
- ✅ ~2-3 seconds saved
- ✅ Cleaner code

---

### Priority 10: Deep Link Fast Path

#### Design: Minimal Loading for Deep Links

**Strategy**: 
- Detect deep link parameters
- Load ONLY required data
- Load rest in background

**Implementation**:

```typescript
useEffect(() => {
  const loadThread = async () => {
    setIsLoading(true);
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
    
    // PHASE 1: Critical data (always needed)
    const threadResponse = await fetch(`${apiUrl}/threads/${currentThreadId}`);
    const threadData = await threadResponse.json();
    setThread(threadData);
    
    // PHASE 2: Content data (depends on deep link)
    if (answerId) {
      // Deep link to answer - load minimal data first
      const targetAnswerResponse = await fetch(`${apiUrl}/answers/${answerId}/details`); // New endpoint
      const targetAnswerData = await targetAnswerResponse.json();
      
      // Set minimal data to enable scroll
      setAnswers({ [targetAnswerData.questionId]: [targetAnswerData] });
      setIsLoading(false); // Enable scroll NOW
      
      // PHASE 3: Background loading (after scroll)
      loadRemainingThreadData(currentThreadId, targetAnswerData.questionId);
      
    } else {
      // Normal loading
      const answersResponse = await fetch(`${apiUrl}/threads/${currentThreadId}/answers`);
      const answersData = await answersResponse.json();
      setAnswers(answersData);
      setIsLoading(false);
      
      // Load interactions in background
      loadInteractionStates();
    }
  };
}, [currentThreadId, answerId]);
```

**Benefits**:
- ✅ Deep link scroll happens in <1 second
- ✅ User sees content immediately
- ✅ Background loading doesn't block UX

---

## Optimized Loading Sequence

### Scenario A: Normal Thread View

```
1. Load thread metadata (0.3s)
   ↓
2. Load answers in parallel with interactions (0.5s)
   ↓
3. Render thread (total: 0.8s)
   ↓
4. Comments load on-demand when user clicks
```

**Before**: ~8-12 seconds
**After**: ~0.8 seconds
**Improvement**: 10x faster

---

### Scenario B: Deep Link to Answer

```
1. Load thread metadata (0.3s)
   ↓
2. Load target answer ONLY (0.2s)
   ↓
3. Render + scroll to answer (total: 0.5s)
   ↓
4. Load remaining answers in background (1-2s)
   ↓
5. Load interactions in background (0.5s)
```

**Before**: ~8-12 seconds before scroll
**After**: ~0.5 seconds before scroll
**Improvement**: 16x faster for deep links

---

## Implementation Plan

### Phase 1: Quick Wins (Immediate Impact)

#### 1.1: Remove Comment Loading from Initial Load
**File**: `PublicThread.tsx` lines 546-580
**Action**: DELETE entire block
**Time**: 5 minutes
**Impact**: ~3 seconds faster

#### 1.2: Make Remaining Loads Parallel
**File**: `PublicThread.tsx` lines 490-544
**Action**: Wrap in `Promise.all()`
**Time**: 10 minutes
**Impact**: ~2 seconds faster

#### 1.3: Remove Duplicate User Fetch
**File**: `PublicThread.tsx` lines 593-607
**Action**: Use already loaded comment data
**Time**: 10 minutes
**Impact**: ~2 seconds faster

**Total Phase 1 Impact**: ~7 seconds faster, 30 minutes work

---

### Phase 2: Backend Optimizations (Medium Impact)

#### 2.1: Create Batch Interactions Endpoint
**File**: `infrastructure/aws/src/handlers/metrics.js`
**Action**: Add `getUserInteractionsForThread` endpoint
**Time**: 1 hour
**Impact**: ~5 seconds faster

#### 2.2: Add Pagination to getThreads
**File**: `infrastructure/aws/src/handlers/threads.js`
**Action**: Add limit/offset query parameters
**Time**: 30 minutes
**Impact**: ~2 seconds faster initial load

#### 2.3: Create Get Single Answer Endpoint
**File**: `infrastructure/aws/src/handlers/api.js`
**Action**: Add `getAnswer` endpoint
**Time**: 30 minutes
**Impact**: Enables fast path for deep links

**Total Phase 2 Impact**: ~7 seconds faster, 2 hours work

---

### Phase 3: Advanced Optimizations (High Impact)

#### 3.1: Implement Thread Cache
**File**: `src/utils/threadCache.ts` (new)
**Time**: 45 minutes
**Impact**: Instant load for cached threads

#### 3.2: Add Prefetch on Hover
**File**: `ForumFeed.tsx`
**Time**: 30 minutes
**Impact**: Instant navigation experience

#### 3.3: Deep Link Fast Path
**File**: `PublicThread.tsx`
**Time**: 1 hour
**Impact**: <1 second deep link navigation

**Total Phase 3 Impact**: Near-instant experience, 2.5 hours work

---

## Expected Performance Metrics

### PublicThread Load Time

| Scenario | Before | After Phase 1 | After Phase 2 | After Phase 3 |
|----------|--------|---------------|---------------|---------------|
| Normal thread (10 answers) | 8-12s | 5-8s | 3-5s | 1-2s |
| Deep link to answer | 8-12s | 5-8s | 3-5s | <1s |
| Cached thread | 8-12s | 5-8s | 3-5s | <0.1s |
| Large thread (50 answers) | 20-30s | 10-15s | 5-8s | 2-3s |

### ForumFeed Load Time

| Scenario | Before | After Phase 2 | After Phase 3 |
|----------|--------|---------------|---------------|
| Initial load (50 threads) | 3-5s | 1-2s | 0.5-1s |
| Scroll for more | N/A | 0.5s | 0.5s |
| With prefetch | 3-5s | 1-2s | <0.1s (cached) |

### API Request Count

| Operation | Before | After |
|-----------|--------|-------|
| Load thread | 30-50 requests | 3-5 requests |
| Deep link | 30-50 requests | 2-3 requests |
| Open comments | Loaded already | 1 request |
| Forum feed | 1 request (all threads) | 1 request (page) |

---

## Code Structure

### New Files to Create

1. `/src/utils/threadCache.ts` - Thread caching utility
2. `/src/hooks/usePrefetch.ts` - Prefetching hook
3. `/src/services/batchApi.ts` - Batch API operations

### New Backend Endpoints

1. `GET /users/batch?ids=id1,id2,id3` - Batch user fetch
2. `GET /users/{userId}/interactions?threadId={id}` - Batch interactions
3. `GET /answers/{answerId}/details` - Single answer with metadata
4. `GET /threads?limit=10&offset=0` - Paginated threads

### Files to Modify

1. `/src/components/PublicThread/PublicThread.tsx` - Main optimizations
2. `/src/components/ForumFeed/ForumFeed.tsx` - Pagination + prefetch
3. `/infrastructure/aws/src/handlers/threads.js` - Pagination
4. `/infrastructure/aws/src/handlers/metrics.js` - Batch endpoint
5. `/infrastructure/aws/src/handlers/api.js` - New endpoints
6. `/infrastructure/aws/serverless.yml` - New endpoint routes

---

## Monitoring & Metrics

### Performance Tracking

Add timing logs:

```typescript
const startTime = performance.now();

// ... load thread ...

const endTime = performance.now();
console.log(`⏱️ Thread loaded in ${(endTime - startTime).toFixed(0)}ms`);

// Track in analytics
analytics.track('thread_load_time', {
  threadId,
  duration: endTime - startTime,
  answerCount: answers.length,
  isDeepLink: !!answerId
});
```

### Key Metrics to Track

1. **Time to Interactive (TTI)**
   - When user can interact with thread
   - Target: <1 second

2. **Time to Content (TTC)**
   - When target content is visible
   - Target: <0.5 seconds for deep links

3. **API Request Count**
   - Number of requests per page load
   - Target: <5 requests

4. **Cache Hit Rate**
   - Percentage of cached loads
   - Target: >50%

---

## Risk Assessment

### Low Risk
- ✅ Remove duplicate loading
- ✅ Parallel loading
- ✅ Lazy load comments

### Medium Risk
- ⚠️ Caching (need cache invalidation strategy)
- ⚠️ Pagination (need to update backend)

### High Risk
- ⚠️ Deep link fast path (complex state management)
- ⚠️ Prefetching (bandwidth usage concerns)

---

## Rollout Strategy

### Week 1: Phase 1 (Quick Wins)
- Day 1-2: Remove comment pre-loading
- Day 3: Parallel loading
- Day 4: Remove duplicates
- Day 5: Testing

**Deployment**: Can deploy incrementally

### Week 2: Phase 2 (Backend)
- Day 1-2: Batch endpoints
- Day 3: Pagination
- Day 4: Testing
- Day 5: Deploy to AWS

**Deployment**: Requires backend deploy

### Week 3: Phase 3 (Advanced)
- Day 1-2: Caching system
- Day 3: Prefetching
- Day 4: Deep link fast path
- Day 5: Testing & monitoring

**Deployment**: Full system deploy

---

## Testing Strategy

### Performance Testing

```typescript
// Test helper
function measureLoadTime(testName: string, fn: () => Promise<void>) {
  return async () => {
    const start = performance.now();
    await fn();
    const end = performance.now();
    console.log(`${testName}: ${(end - start).toFixed(0)}ms`);
  };
}

// Test cases
await measureLoadTime('Normal thread load', () => loadThread('abc123'));
await measureLoadTime('Deep link load', () => loadThread('abc123', { answerId: 'xyz' }));
await measureLoadTime('Cached load', () => loadThread('abc123')); // Second time
```

### Load Testing

Use tools to simulate:
- 10 concurrent users
- 100 threads in feed
- Threads with 50+ answers

---

## Success Criteria

### Phase 1 Success
- [ ] Thread loads in <5 seconds
- [ ] <10 API requests per thread
- [ ] Comments load on demand

### Phase 2 Success
- [ ] Thread loads in <3 seconds
- [ ] <5 API requests per thread
- [ ] Pagination works smoothly

### Phase 3 Success
- [ ] Deep links load in <1 second
- [ ] Cached threads load in <0.1 seconds
- [ ] Prefetch provides instant navigation

---

## Conclusion

This optimization plan will reduce PublicThread load time from **8-12 seconds to <1 second** through:

1. ✅ Lazy loading (don't load what's not needed)
2. ✅ Parallel loading (load simultaneously)
3. ✅ Batch APIs (reduce request count)
4. ✅ Caching (instant re-loads)
5. ✅ Prefetching (load before user clicks)
6. ✅ Fast path for deep links (prioritize target content)

The phased approach allows incremental improvements with each phase delivering measurable performance gains.

**Recommended Start**: Begin with Phase 1 for immediate 7-second improvement with minimal risk.

