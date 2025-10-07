# Likes API Fix: Thread Support

## Issue
The likes API was returning a 400 Bad Request error when trying to like threads:
```
POST /likes/thread/0c8453fa-4b8e-40c7-97a6-e995fb178cb1
```

**Error**: `Invalid content type. Must be question, answer, or comment`

## Root Cause
The backend API handler only supported liking `question`, `answer`, and `comment` content types, but the frontend was trying to like `thread` content. This was a mismatch between the frontend implementation and backend API design.

## Solution
Updated the backend to support liking threads by making the following changes:

### 1. Backend API Handler Updates
**File**: `infrastructure/aws/src/handlers/metrics.js`

- **Updated content type validation**: Added `'thread'` to allowed content types
- **Updated content existence check**: Added thread table lookup
- **Updated error messages**: Reflect new supported content types

**Changes**:
```javascript
// Before
if (!['question', 'answer', 'comment'].includes(contentType)) {
  return addCorsHeaders({
    statusCode: 400,
    body: JSON.stringify({ error: 'Invalid content type. Must be question, answer, or comment' })
  });
}

// After  
if (!['thread', 'question', 'answer', 'comment'].includes(contentType)) {
  return addCorsHeaders({
    statusCode: 400,
    body: JSON.stringify({ error: 'Invalid content type. Must be thread, question, answer, or comment' })
  });
}
```

### 2. Database Schema Updates
**Files**: 
- `supabase/migrations/20250115000000_add_thread_metrics.sql`
- `infrastructure/nodejs-server/migrations/add_thread_metrics.sql`

- **Updated likes table constraint**: Added `'thread'` to allowed content types

**Changes**:
```sql
-- Before
content_type TEXT NOT NULL CHECK (content_type IN ('question', 'answer', 'comment')),

-- After
content_type TEXT NOT NULL CHECK (content_type IN ('thread', 'question', 'answer', 'comment')),
```

### 3. Frontend Service Updates
**File**: `src/services/metrics.ts`

- **Updated TypeScript types**: Added `'thread'` to content type unions
- **Updated function signatures**: Support thread likes in all relevant functions

**Changes**:
```typescript
// Before
async toggleLike(
  contentType: 'question' | 'answer' | 'comment',
  contentId: string,
  userId: string,
  action: 'like' | 'unlike'
): Promise<LikeResponse>

// After
async toggleLike(
  contentType: 'thread' | 'question' | 'answer' | 'comment',
  contentId: string,
  userId: string,
  action: 'like' | 'unlike'
): Promise<LikeResponse>
```

## Testing
After these changes, the following API calls should work:

```bash
# Like a thread
POST /likes/thread/0c8453fa-4b8e-40c7-97a6-e995fb178cb1
{
  "userId": "user-id",
  "action": "like"
}

# Unlike a thread  
POST /likes/thread/0c8453fa-4b8e-40c7-97a6-e995fb178cb1
{
  "userId": "user-id", 
  "action": "unlike"
}

# Get thread likes
GET /likes/thread/0c8453fa-4b8e-40c7-97a6-e995fb178cb1?userId=user-id
```

## Deployment Steps
1. **Deploy backend changes**: Update the Lambda functions with the new metrics handler
2. **Run database migrations**: Apply the updated schema changes
3. **Deploy frontend changes**: Update the metrics service TypeScript types
4. **Test the API**: Verify thread likes work correctly

## Impact
- ✅ Thread likes now work correctly
- ✅ Maintains backward compatibility with existing question/answer/comment likes
- ✅ Consistent API behavior across all content types
- ✅ Type-safe frontend integration

The fix ensures that users can now like threads from the frontend without encountering 400 errors, providing a complete and consistent metrics experience across all content types.
