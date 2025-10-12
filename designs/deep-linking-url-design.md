# Deep Linking URL Design for Thread Navigation

## Overview

This document defines a comprehensive URL structure that enables deep linking to specific content within threads, including questions, answers, and comments. This allows users to navigate directly to specific content from notifications, shared links, or bookmarks.

## Problem Statement

Currently, clicking a notification redirects users to the home page instead of:
1. Opening the specific thread
2. Scrolling to the relevant question
3. Highlighting the specific answer
4. Showing the comment context

## URL Structure Design

### 1. Thread-Level URLs

#### Basic Thread View
```
/thread/:threadId
```
**Example**: `/thread/abc123`

**Behavior**:
- Opens the thread
- Shows all questions and answers
- Scrolls to top by default

---

### 2. Question-Level URLs

#### Specific Question
```
/thread/:threadId/question/:questionId
```
**Example**: `/thread/abc123/question/q456`

**Behavior**:
- Opens the thread
- Scrolls to the specific question
- Highlights the question with a subtle animation
- Shows all answers to that question

#### Question with Query Parameters
```
/thread/:threadId?questionId=:questionId
```
**Example**: `/thread/abc123?questionId=q456`

**Behavior**: Same as above (alternative syntax)

---

### 3. Answer-Level URLs

#### Specific Answer
```
/thread/:threadId/answer/:answerId
```
**Example**: `/thread/abc123/answer/a789`

**Behavior**:
- Opens the thread
- Finds the question that contains this answer
- Scrolls to the specific answer
- Highlights the answer with a subtle glow
- Auto-expands the answer if collapsed

#### Answer with Context
```
/thread/:threadId/question/:questionId/answer/:answerId
```
**Example**: `/thread/abc123/question/q456/answer/a789`

**Behavior**: Same as above with explicit question context

#### Answer with Query Parameters
```
/thread/:threadId?answerId=:answerId
```
**Example**: `/thread/abc123?answerId=a789`

**Behavior**: Same as answer-level URL (alternative syntax)

---

### 4. Comment-Level URLs

#### Specific Comment
```
/thread/:threadId/answer/:answerId/comment/:commentId
```
**Example**: `/thread/abc123/answer/a789/comment/c101`

**Behavior**:
- Opens the thread
- Scrolls to the answer containing the comment
- Auto-expands the comment section
- Scrolls to and highlights the specific comment
- Shows reply context if it's a nested reply

#### Comment with Query Parameters
```
/thread/:threadId?answerId=:answerId&commentId=:commentId
```
**Example**: `/thread/abc123?answerId=a789&commentId=c101`

**Behavior**: Same as above (alternative syntax)

---

## URL Parameters

### Highlight Parameter
```
?highlight=true
```
Adds a temporary highlight effect to the target element.

**Example**: `/thread/abc123/answer/a789?highlight=true`

### Scroll Behavior Parameter
```
?scroll=smooth|auto|instant
```
Controls how the page scrolls to the target element.

**Example**: `/thread/abc123/answer/a789?scroll=smooth`

### Action Parameter
```
?action=reply|edit|delete
```
Pre-selects an action on the target element.

**Example**: `/thread/abc123/answer/a789?action=reply`

### Notification Source Parameter
```
?from=notification|share|bookmark
```
Tracks the source of navigation for analytics.

**Example**: `/thread/abc123/answer/a789?from=notification`

---

## Implementation Strategy

### Phase 1: Basic Thread Navigation

#### Frontend Router Configuration

**File**: `src/App.tsx`

```typescript
<Routes>
  {/* Basic thread view */}
  <Route path="/" element={<AppContent />} />
  
  {/* Thread-level routes */}
  <Route path="/thread/:threadId" element={<AppContent />} />
  
  {/* Question-level routes */}
  <Route path="/thread/:threadId/question/:questionId" element={<AppContent />} />
  
  {/* Answer-level routes */}
  <Route path="/thread/:threadId/answer/:answerId" element={<AppContent />} />
  
  {/* Comment-level routes */}
  <Route path="/thread/:threadId/answer/:answerId/comment/:commentId" element={<AppContent />} />
  
  {/* Fallback */}
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
```

#### URL Parsing Hook

**File**: `src/hooks/useThreadNavigation.ts`

```typescript
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

interface ThreadNavigationParams {
  threadId?: string;
  questionId?: string;
  answerId?: string;
  commentId?: string;
  highlight?: boolean;
  scrollBehavior?: 'smooth' | 'auto' | 'instant';
  from?: string;
}

export const useThreadNavigation = () => {
  const params = useParams<{
    threadId?: string;
    questionId?: string;
    answerId?: string;
    commentId?: string;
  }>();
  
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Parse all navigation parameters
  const navigationParams: ThreadNavigationParams = {
    threadId: params.threadId,
    questionId: params.questionId || searchParams.get('questionId') || undefined,
    answerId: params.answerId || searchParams.get('answerId') || undefined,
    commentId: params.commentId || searchParams.get('commentId') || undefined,
    highlight: searchParams.get('highlight') === 'true',
    scrollBehavior: (searchParams.get('scroll') as any) || 'smooth',
    from: searchParams.get('from') || undefined
  };

  return {
    ...navigationParams,
    navigate
  };
};
```

### Phase 2: Scroll and Highlight Implementation

#### Scroll to Element Utility

**File**: `src/utils/scrollToElement.ts`

```typescript
interface ScrollOptions {
  elementId: string;
  behavior?: ScrollBehavior;
  offset?: number;
  highlight?: boolean;
  highlightDuration?: number;
}

export const scrollToElement = ({
  elementId,
  behavior = 'smooth',
  offset = 80, // Account for fixed header
  highlight = false,
  highlightDuration = 2000
}: ScrollOptions) => {
  // Wait for DOM to be ready
  const attemptScroll = (attempts = 0) => {
    const element = document.getElementById(elementId);
    
    if (element) {
      // Calculate scroll position with offset
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      // Scroll to element
      window.scrollTo({
        top: offsetPosition,
        behavior: behavior
      });

      // Add highlight effect
      if (highlight) {
        element.classList.add('highlight-pulse');
        setTimeout(() => {
          element.classList.remove('highlight-pulse');
        }, highlightDuration);
      }

      return true;
    } else if (attempts < 10) {
      // Retry if element not found (might still be loading)
      setTimeout(() => attemptScroll(attempts + 1), 200);
      return false;
    }
    
    console.warn('Element not found:', elementId);
    return false;
  };

  // Initial attempt after short delay
  setTimeout(() => attemptScroll(), 100);
};
```

#### Highlight CSS

**File**: `src/index.css` or component styles

```css
/* Highlight animation for deep-linked content */
@keyframes highlight-pulse {
  0% {
    background-color: rgba(59, 130, 246, 0);
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
  }
  50% {
    background-color: rgba(59, 130, 246, 0.1);
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2);
  }
  100% {
    background-color: rgba(59, 130, 246, 0);
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
  }
}

.highlight-pulse {
  animation: highlight-pulse 2s ease-in-out;
  border-radius: 8px;
}

/* Alternative: Border highlight */
@keyframes border-highlight {
  0%, 100% {
    border-left: 4px solid transparent;
  }
  50% {
    border-left: 4px solid #3b82f6;
  }
}

.border-highlight {
  animation: border-highlight 2s ease-in-out;
}
```

### Phase 3: Component Integration

#### PublicThread Component Updates

**File**: `src/components/PublicThread/PublicThread.tsx`

```typescript
import { useThreadNavigation } from '../../hooks/useThreadNavigation';
import { scrollToElement } from '../../utils/scrollToElement';

export const PublicThread: React.FC<PublicThreadProps> = ({ onLogout }) => {
  const { threadId, questionId, answerId, commentId, highlight, scrollBehavior } = useThreadNavigation();
  const [thread, setThread] = useState<Thread | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load thread data
  useEffect(() => {
    if (threadId) {
      loadThread(threadId);
    }
  }, [threadId]);

  // Handle deep linking after thread is loaded
  useEffect(() => {
    if (!isLoaded || !thread) return;

    // Navigate to specific content
    if (commentId && answerId) {
      // Navigate to comment
      scrollToElement({
        elementId: `comment-${commentId}`,
        behavior: scrollBehavior,
        highlight: highlight,
        offset: 100
      });
    } else if (answerId) {
      // Navigate to answer
      scrollToElement({
        elementId: `answer-${answerId}`,
        behavior: scrollBehavior,
        highlight: highlight,
        offset: 100
      });
    } else if (questionId) {
      // Navigate to question
      scrollToElement({
        elementId: `question-${questionId}`,
        behavior: scrollBehavior,
        highlight: highlight,
        offset: 100
      });
    }
  }, [isLoaded, thread, questionId, answerId, commentId, highlight, scrollBehavior]);

  // ... rest of component
};
```

#### Add IDs to Elements

**File**: Answer, Question, Comment components

```typescript
// QuestionSection.tsx
<div id={`question-${question.id}`} className="question-container">
  {/* Question content */}
</div>

// AnswerDisplay.tsx
<div id={`answer-${answer.id}`} className="answer-container">
  {/* Answer content */}
</div>

// CommentPanel.tsx
<div id={`comment-${comment.id}`} className="comment-container">
  {/* Comment content */}
</div>
```

### Phase 4: Notification Click Handler

#### Update NotificationCenter Component

**File**: `src/components/Notifications/NotificationCenter.tsx`

```typescript
const handleNotificationClick = (notification: Notification) => {
  onClose(); // Close notification center
  
  // Build URL based on notification type
  let url = `/thread/${notification.threadId}`;
  
  switch (notification.contentType) {
    case 'comment':
      // Navigate to comment
      if (notification.relatedContentId) {
        url = `/thread/${notification.threadId}/answer/${notification.relatedContentId}/comment/${notification.contentId}?highlight=true&from=notification`;
      }
      break;
      
    case 'answer':
      // Navigate to answer
      url = `/thread/${notification.threadId}/answer/${notification.contentId}?highlight=true&from=notification`;
      break;
      
    case 'thread':
      // Navigate to thread
      url = `/thread/${notification.threadId}?highlight=true&from=notification`;
      break;
      
    default:
      // Fallback to thread
      url = `/thread/${notification.threadId}`;
  }
  
  onNavigate(notification, url);
};
```

#### Update App.tsx Navigation Handler

**File**: `src/App.tsx`

```typescript
const handleNotificationClick = (notification: Notification, url: string) => {
  // Navigate using the URL
  navigate(url);
  
  // Update view mode
  dispatch({ type: 'SET_VIEW_MODE', payload: 'public-thread' });
  dispatch({ type: 'SET_THREAD_ID', payload: notification.threadId });
};
```

---

## URL Examples for Each Notification Type

### 1. New Answer Notification
**Notification Type**: `new_answer`
**Target**: Answer on a question

**URL**: `/thread/abc123/answer/a789?highlight=true&from=notification`

**Behavior**:
- Opens thread abc123
- Scrolls to answer a789
- Highlights the answer
- User sees their question and the new answer

---

### 2. Answer Liked Notification
**Notification Type**: `answer_liked`
**Target**: The liked answer

**URL**: `/thread/abc123/answer/a789?highlight=true&from=notification`

**Behavior**:
- Opens thread abc123
- Scrolls to answer a789 (the liked answer)
- Highlights the answer
- User sees who liked their answer

---

### 3. Answer Commented Notification
**Notification Type**: `answer_commented`
**Target**: The comment on the answer

**URL**: `/thread/abc123/answer/a789/comment/c101?highlight=true&from=notification`

**Behavior**:
- Opens thread abc123
- Scrolls to answer a789
- Expands comment section
- Scrolls to comment c101
- Highlights the comment
- User sees the new comment on their answer

---

### 4. Answer Saved Notification
**Notification Type**: `answer_saved`
**Target**: The saved answer

**URL**: `/thread/abc123/answer/a789?highlight=true&from=notification`

**Behavior**:
- Opens thread abc123
- Scrolls to answer a789
- Highlights the answer
- User sees their saved answer

---

### 5. Thread Liked Notification
**Notification Type**: `thread_liked`
**Target**: The entire thread

**URL**: `/thread/abc123?highlight=true&from=notification`

**Behavior**:
- Opens thread abc123
- Shows thread from top
- Brief highlight effect on thread header
- User sees their liked thread

---

## Share URL Generation

### Share Button Implementation

```typescript
export const generateShareUrl = (
  contentType: 'thread' | 'question' | 'answer' | 'comment',
  contentId: string,
  threadId: string,
  relatedIds?: {
    questionId?: string;
    answerId?: string;
  }
): string => {
  const baseUrl = window.location.origin;
  
  switch (contentType) {
    case 'comment':
      return `${baseUrl}/thread/${threadId}/answer/${relatedIds?.answerId}/comment/${contentId}?from=share`;
      
    case 'answer':
      return `${baseUrl}/thread/${threadId}/answer/${contentId}?from=share`;
      
    case 'question':
      return `${baseUrl}/thread/${threadId}/question/${contentId}?from=share`;
      
    case 'thread':
    default:
      return `${baseUrl}/thread/${threadId}?from=share`;
  }
};
```

---

## SEO Considerations

### Open Graph Meta Tags

For social media sharing, dynamically generate meta tags based on URL:

```html
<!-- For Thread -->
<meta property="og:title" content="Thread Title - Ainigama" />
<meta property="og:description" content="Thread preview text..." />
<meta property="og:url" content="https://ainigama.com/thread/abc123" />

<!-- For Answer -->
<meta property="og:title" content="Answer by User - Thread Title" />
<meta property="og:description" content="Answer preview text..." />
<meta property="og:url" content="https://ainigama.com/thread/abc123/answer/a789" />

<!-- For Comment -->
<meta property="og:title" content="Comment by User - Thread Title" />
<meta property="og:description" content="Comment preview text..." />
<meta property="og:url" content="https://ainigama.com/thread/abc123/answer/a789/comment/c101" />
```

### Server-Side Rendering (Optional Enhancement)

For better SEO, implement SSR to render thread content on the server based on URL parameters.

---

## Analytics Tracking

### Track Deep Link Usage

```typescript
// Track when users arrive via deep links
useEffect(() => {
  const from = searchParams.get('from');
  const contentType = answerId ? 'answer' : questionId ? 'question' : 'thread';
  
  if (from) {
    analytics.track('deep_link_navigation', {
      source: from, // 'notification', 'share', 'bookmark'
      content_type: contentType,
      thread_id: threadId,
      question_id: questionId,
      answer_id: answerId,
      comment_id: commentId
    });
  }
}, []);
```

---

## Error Handling

### Content Not Found

When navigating to a deep link, handle cases where content doesn't exist:

```typescript
const handleDeepLink = async () => {
  try {
    // Try to load the thread
    const thread = await loadThread(threadId);
    
    // Verify content exists
    if (answerId) {
      const answerExists = findAnswerInThread(thread, answerId);
      if (!answerExists) {
        showNotification('This answer no longer exists', 'warning');
        // Fallback to thread view
        navigate(`/thread/${threadId}`);
        return;
      }
    }
    
    // Content exists, proceed with navigation
    scrollToElement({...});
  } catch (error) {
    showNotification('Content not found', 'error');
    navigate('/'); // Redirect to home
  }
};
```

---

## URL Shortening (Future Enhancement)

For sharing, implement URL shortening:

**Original**: 
```
https://ainigama.com/thread/abc123/answer/a789/comment/c101?highlight=true&from=share
```

**Shortened**: 
```
https://ainigma.ai/c/xYz
```

This can be implemented using:
1. Hash-based URL shortener service
2. Database mapping of short codes to full URLs
3. Redirect service at the short domain

---

## Implementation Checklist

### Phase 1: Basic URL Structure ✅
- [ ] Update React Router with new routes
- [ ] Create `useThreadNavigation` hook
- [ ] Add route parameter parsing
- [ ] Test basic thread navigation

### Phase 2: Scroll & Highlight ✅
- [ ] Implement `scrollToElement` utility
- [ ] Add CSS highlight animations
- [ ] Add element IDs to components
- [ ] Test scroll behavior

### Phase 3: Component Integration ✅
- [ ] Update PublicThread component
- [ ] Update QuestionSection with IDs
- [ ] Update AnswerDisplay with IDs
- [ ] Update CommentPanel with IDs
- [ ] Add deep link handling logic

### Phase 4: Notification Integration ✅
- [ ] Update notification click handler
- [ ] Generate correct URLs based on notification type
- [ ] Test all notification types
- [ ] Verify highlight effects

### Phase 5: Share Functionality ✅
- [ ] Implement share URL generation
- [ ] Add copy link functionality
- [ ] Add social media share buttons
- [ ] Test sharing flow

### Phase 6: Error Handling & Analytics ✅
- [ ] Add content existence checks
- [ ] Implement fallback navigation
- [ ] Add analytics tracking
- [ ] Handle edge cases

---

## Testing Scenarios

### Scenario 1: New Answer Notification
1. User A creates question in thread
2. User B answers the question
3. User A receives notification
4. User A clicks notification
5. **Expected**: Opens thread, scrolls to answer, highlights it

### Scenario 2: Shared Answer Link
1. User A shares answer link
2. User B clicks the link
3. **Expected**: Opens thread, scrolls to answer, highlights it
4. **Expected**: Page loads even if User B is not logged in

### Scenario 3: Deep Link to Deleted Content
1. User has notification for an answer
2. Answer gets deleted
3. User clicks notification
4. **Expected**: Shows error message, redirects to thread or home

### Scenario 4: Nested Comment Link
1. User has notification for reply to their comment
2. User clicks notification
3. **Expected**: Opens thread, scrolls to answer, expands comments, highlights specific comment

---

## Performance Considerations

### 1. Lazy Loading
- Don't load entire thread initially if deep linking to specific content
- Load minimal data required to navigate
- Lazy load surrounding content after navigation

### 2. Caching
- Cache thread data to avoid redundant API calls
- Use URL as cache key
- Invalidate cache when content changes

### 3. Pre-fetching
- Pre-fetch thread data when hovering over notification
- Use React Suspense for loading states
- Show skeleton screens during navigation

---

## Mobile Considerations

### Deep Linking on Mobile Web
- Use same URL structure
- Ensure scroll offset accounts for mobile header height
- Test with mobile browser address bar showing/hiding

### Native App Deep Linking (Future)
If building native apps, configure deep link handlers:

**iOS Universal Links**:
```
https://ainigama.com/thread/* -> Open in app
```

**Android App Links**:
```
https://ainigama.com/thread/* -> Open in app
```

---

## Conclusion

This URL structure provides:
1. ✅ **User-friendly**: Clear, readable URLs
2. ✅ **SEO-friendly**: Crawlable, indexable content
3. ✅ **Shareable**: Easy to copy and share
4. ✅ **Flexible**: Query parameters for additional options
5. ✅ **Scalable**: Supports future content types
6. ✅ **Accessible**: Works with and without authentication

The phased implementation approach ensures steady progress with testable milestones at each stage.

