import { useEffect, useRef } from 'react';

interface SwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  enabled?: boolean;
}

export const useSwipeGesture = (options: SwipeGestureOptions) => {
  const {
    onSwipeLeft,
    onSwipeRight,
    threshold = 50,
    enabled = true,
  } = options;

  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const touchEndX = useRef<number>(0);
  const touchEndY = useRef<number>(0);
  const isSwipeGesture = useRef<boolean>(false);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      
      // Don't interfere with interactive elements
      const isInteractiveElement = 
        target.tagName === 'BUTTON' ||
        target.tagName === 'A' ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.getAttribute('role') === 'button' ||
        target.closest('button') !== null ||
        target.closest('a') !== null ||
        target.closest('[role="button"]') !== null ||
        target.closest('[onclick]') !== null;

      if (isInteractiveElement) {
        return; // Don't interfere with interactive elements
      }

      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      isSwipeGesture.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartX.current === 0 && touchStartY.current === 0) return;

      touchEndX.current = e.touches[0].clientX;
      touchEndY.current = e.touches[0].clientY;

      const deltaX = Math.abs(touchEndX.current - touchStartX.current);
      const deltaY = Math.abs(touchEndY.current - touchStartY.current);

      // If horizontal movement is significant and more than vertical, it's a swipe gesture
      if (deltaX > 10 && deltaX > deltaY) {
        isSwipeGesture.current = true;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current === 0 || !isSwipeGesture.current) {
        // Reset if not a swipe gesture
        touchStartX.current = 0;
        touchStartY.current = 0;
        touchEndX.current = 0;
        touchEndY.current = 0;
        isSwipeGesture.current = false;
        return;
      }

      const distance = touchStartX.current - touchEndX.current;
      const isLeftSwipe = distance > threshold;
      const isRightSwipe = distance < -threshold;

      if (isLeftSwipe && onSwipeLeft) {
        onSwipeLeft();
      }

      if (isRightSwipe && onSwipeRight) {
        onSwipeRight();
      }

      // Reset values
      touchStartX.current = 0;
      touchStartY.current = 0;
      touchEndX.current = 0;
      touchEndY.current = 0;
      isSwipeGesture.current = false;
    };

    // Use passive listeners to avoid interfering with scroll performance
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, threshold, onSwipeLeft, onSwipeRight]);
};
