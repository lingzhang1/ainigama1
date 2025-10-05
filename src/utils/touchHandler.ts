/**
 * Touch Event Handler Utilities for Mobile Browser Compatibility
 *
 * This module provides utilities to ensure proper touch interactions
 * across different mobile browsers, preventing cursor issues and
 * ensuring clickable elements respond correctly.
 */

/**
 * Initializes mobile-specific event handlers to ensure proper touch behavior
 * Should be called once when the app initializes
 */
export const initializeMobileTouchHandlers = (): void => {
  // Only run on touch-enabled devices
  if (!('ontouchstart' in window)) {
    return;
  }

  // Prevent double-tap zoom on buttons and links
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (event) => {
    const now = Date.now();
    const target = event.target as HTMLElement;

    // Check if the target is an interactive element
    const isInteractive =
      target.tagName === 'BUTTON' ||
      target.tagName === 'A' ||
      target.getAttribute('role') === 'button' ||
      target.closest('button') !== null ||
      target.closest('a') !== null;

    if (isInteractive && now - lastTouchEnd <= 300) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });

  // Add active state feedback for touch interactions
  document.addEventListener('touchstart', (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest('button, a, [role="button"]');

    if (button && !button.classList.contains('touch-active')) {
      button.classList.add('touch-active');
    }
  }, { passive: true });

  document.addEventListener('touchend', (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest('button, a, [role="button"]');

    if (button) {
      setTimeout(() => {
        button.classList.remove('touch-active');
      }, 150);
    }
  }, { passive: true });

  document.addEventListener('touchcancel', (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest('button, a, [role="button"]');

    if (button) {
      button.classList.remove('touch-active');
    }
  }, { passive: true });
};

/**
 * Fixes cursor issues on specific elements
 * Call this after dynamically adding interactive elements to the DOM
 */
export const fixElementCursor = (element: HTMLElement): void => {
  const isInteractive =
    element.tagName === 'BUTTON' ||
    element.tagName === 'A' ||
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.tagName === 'SELECT' ||
    element.getAttribute('role') === 'button' ||
    element.hasAttribute('onclick');

  if (isInteractive) {
    element.style.cursor = 'pointer';
    element.style.touchAction = 'manipulation';
    element.style.webkitTapHighlightColor = 'rgba(0, 0, 0, 0.1)';
  }
};

/**
 * Ensures all interactive elements in a container have proper cursor styles
 */
export const fixContainerCursors = (container: HTMLElement = document.body): void => {
  const interactiveElements = container.querySelectorAll(
    'button, a, input, textarea, select, [role="button"], [onclick]'
  );

  interactiveElements.forEach((element) => {
    fixElementCursor(element as HTMLElement);
  });
};

/**
 * Creates a touch-friendly click handler
 * Use this for custom clickable elements that might have issues
 */
export const createTouchHandler = (
  onClick: (event: MouseEvent | TouchEvent) => void,
  options: { preventDefault?: boolean } = {}
) => {
  let touchStartTime = 0;
  let touchStartX = 0;
  let touchStartY = 0;

  const handleTouchStart = (event: TouchEvent) => {
    touchStartTime = Date.now();
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
  };

  const handleTouchEnd = (event: TouchEvent) => {
    const touchEndTime = Date.now();
    const touchEndX = event.changedTouches[0].clientX;
    const touchEndY = event.changedTouches[0].clientY;

    // Calculate distance moved
    const deltaX = Math.abs(touchEndX - touchStartX);
    const deltaY = Math.abs(touchEndY - touchStartY);
    const timeDelta = touchEndTime - touchStartTime;

    // Only trigger click if it was a quick tap without much movement
    if (deltaX < 10 && deltaY < 10 && timeDelta < 500) {
      if (options.preventDefault) {
        event.preventDefault();
      }
      onClick(event);
    }
  };

  const handleClick = (event: MouseEvent) => {
    onClick(event);
  };

  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
    onClick: handleClick,
  };
};

/**
 * Detects if the device is using touch input
 */
export const isTouchDevice = (): boolean => {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    // @ts-ignore - for older browsers
    navigator.msMaxTouchPoints > 0
  );
};

/**
 * Gets the optimal event type for the current device
 */
export const getClickEventType = (): 'click' | 'touchend' => {
  return isTouchDevice() ? 'touchend' : 'click';
};
