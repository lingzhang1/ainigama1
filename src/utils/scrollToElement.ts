/**
 * Utility for scrolling to and highlighting specific elements in the DOM
 * Used for deep linking to questions, answers, and comments
 */

export interface ScrollToElementOptions {
  elementId: string;
  behavior?: ScrollBehavior;
  offset?: number;
  highlight?: boolean;
  highlightDuration?: number;
  maxAttempts?: number;
  retryDelay?: number;
}

/**
 * Scroll to a specific element with optional highlighting
 * Retries if element is not immediately available (useful for dynamic content)
 */
export const scrollToElement = ({
  elementId,
  behavior = 'smooth',
  offset = 80, // Account for fixed header
  highlight = false,
  highlightDuration = 2000,
  maxAttempts = 15,
  retryDelay = 200
}: ScrollToElementOptions): Promise<boolean> => {
  return new Promise((resolve) => {
    let attempts = 0;

    const attemptScroll = () => {
      attempts++;
      const element = document.getElementById(elementId);
      
      if (element) {
        console.log(`✅ Found element "${elementId}", scrolling (attempt ${attempts})`);
        
        // Calculate scroll position with offset
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - offset;

        // Scroll to element
        window.scrollTo({
          top: offsetPosition,
          behavior: behavior
        });

        // Add highlight effect if requested
        if (highlight) {
          // Remove any existing highlight first
          document.querySelectorAll('.highlight-pulse, .border-highlight').forEach(el => {
            el.classList.remove('highlight-pulse', 'border-highlight');
          });

          // Add highlight class
          element.classList.add('highlight-pulse');
          
          // Remove highlight after duration
          setTimeout(() => {
            element.classList.remove('highlight-pulse');
          }, highlightDuration);
        }

        resolve(true);
        return;
      }
      
      // Element not found, retry if attempts remaining
      if (attempts < maxAttempts) {
        console.log(`⏳ Element "${elementId}" not found yet, retrying (attempt ${attempts}/${maxAttempts})...`);
        setTimeout(attemptScroll, retryDelay);
      } else {
        console.warn(`❌ Element "${elementId}" not found after ${maxAttempts} attempts`);
        resolve(false);
      }
    };

    // Start attempting after a small initial delay
    setTimeout(attemptScroll, 100);
  });
};

/**
 * Scroll to a question by ID
 */
export const scrollToQuestion = (
  questionId: string,
  options?: Partial<ScrollToElementOptions>
): Promise<boolean> => {
  return scrollToElement({
    elementId: `question-${questionId}`,
    ...options
  });
};

/**
 * Scroll to an answer by ID
 */
export const scrollToAnswer = (
  answerId: string,
  options?: Partial<ScrollToElementOptions>
): Promise<boolean> => {
  return scrollToElement({
    elementId: `answer-${answerId}`,
    ...options
  });
};

/**
 * Scroll to a comment by ID
 */
export const scrollToComment = (
  commentId: string,
  options?: Partial<ScrollToElementOptions>
): Promise<boolean> => {
  return scrollToElement({
    elementId: `comment-${commentId}`,
    ...options
  });
};

/**
 * Expand a collapsible section if needed before scrolling
 * Useful for comment panels that might be collapsed
 */
export const expandAndScroll = async (
  elementId: string,
  expandCallback: () => void | Promise<void>,
  options?: Partial<ScrollToElementOptions>
): Promise<boolean> => {
  // First expand the section
  await expandCallback();
  
  // Wait a bit for expansion animation
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // Then scroll to the element
  return scrollToElement({
    elementId,
    ...options
  });
};

