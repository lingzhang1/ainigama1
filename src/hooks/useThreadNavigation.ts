import { useParams, useSearchParams, useNavigate } from 'react-router-dom';

export interface ThreadNavigationParams {
  threadId?: string;
  questionId?: string;
  answerId?: string;
  commentId?: string;
  highlight?: boolean;
  scrollBehavior?: 'smooth' | 'auto' | 'instant';
  from?: string;
}

/**
 * Hook for handling thread navigation with deep linking support
 * Parses URL parameters and query strings for thread, question, answer, and comment IDs
 */
export const useThreadNavigation = (): ThreadNavigationParams & { navigate: ReturnType<typeof useNavigate> } => {
  const params = useParams<{
    threadId?: string;
    questionId?: string;
    answerId?: string;
    commentId?: string;
  }>();
  
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Parse all navigation parameters from both route params and query strings
  const navigationParams: ThreadNavigationParams = {
    // Thread ID from route params
    threadId: params.threadId,
    
    // Question ID - check route params first, then query string
    questionId: params.questionId || searchParams.get('questionId') || undefined,
    
    // Answer ID - check route params first, then query string
    answerId: params.answerId || searchParams.get('answerId') || undefined,
    
    // Comment ID - check route params first, then query string
    commentId: params.commentId || searchParams.get('commentId') || undefined,
    
    // Highlight flag from query string
    highlight: searchParams.get('highlight') === 'true',
    
    // Scroll behavior from query string
    scrollBehavior: (searchParams.get('scroll') as 'smooth' | 'auto' | 'instant') || 'smooth',
    
    // Source tracking (notification, share, bookmark, etc.)
    from: searchParams.get('from') || undefined
  };

  return {
    ...navigationParams,
    navigate
  };
};

/**
 * Generate a thread navigation URL with optional deep linking parameters
 */
export const generateThreadUrl = (params: {
  threadId: string;
  questionId?: string;
  answerId?: string;
  commentId?: string;
  highlight?: boolean;
  from?: string;
  scrollBehavior?: 'smooth' | 'auto' | 'instant';
}): string => {
  const { threadId, questionId, answerId, commentId, highlight, from, scrollBehavior } = params;
  
  // Build base path
  let path = `/thread/${threadId}`;
  
  // Add path segments for deep linking
  if (commentId && answerId) {
    // Comment in an answer
    path += `/answer/${answerId}/comment/${commentId}`;
  } else if (answerId) {
    // Specific answer
    path += `/answer/${answerId}`;
  } else if (questionId) {
    // Specific question
    path += `/question/${questionId}`;
  }
  
  // Build query parameters
  const queryParams = new URLSearchParams();
  
  if (highlight) {
    queryParams.append('highlight', 'true');
  }
  
  if (from) {
    queryParams.append('from', from);
  }
  
  if (scrollBehavior && scrollBehavior !== 'smooth') {
    queryParams.append('scroll', scrollBehavior);
  }
  
  // Append query string if any parameters exist
  const queryString = queryParams.toString();
  if (queryString) {
    path += `?${queryString}`;
  }
  
  return path;
};

/**
 * Generate a shareable URL for content
 */
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
      if (!relatedIds?.answerId) {
        console.error('Answer ID required for comment share URL');
        return `${baseUrl}/thread/${threadId}`;
      }
      return `${baseUrl}${generateThreadUrl({
        threadId,
        answerId: relatedIds.answerId,
        commentId: contentId,
        from: 'share'
      })}`;
      
    case 'answer':
      return `${baseUrl}${generateThreadUrl({
        threadId,
        answerId: contentId,
        from: 'share'
      })}`;
      
    case 'question':
      return `${baseUrl}${generateThreadUrl({
        threadId,
        questionId: contentId,
        from: 'share'
      })}`;
      
    case 'thread':
    default:
      return `${baseUrl}${generateThreadUrl({
        threadId,
        from: 'share'
      })}`;
  }
};

