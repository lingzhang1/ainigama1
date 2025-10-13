/**
 * Unified Engagement Tracker
 * 
 * Single service for tracking all user engagement events
 * Sends data to AWS Lambda unified tracking endpoint
 */

import { ENGAGEMENT_WEIGHTS, getRecommendationScore } from '../constants/weights';

export interface EngagementEvent {
  userId: string;
  threadId: string;
  contentId?: string;
  contentType?: 'thread' | 'question' | 'answer' | 'comment';
  action: 'view' | 'like' | 'save' | 'share' | 'question' | 'answer' | 'time_spent';
  metadata?: {
    timeSpentSeconds?: number;
    shareMethod?: string;
  };
}

export class EngagementTracker {
  private apiUrl: string;
  private pendingEvents: Map<string, NodeJS.Timeout>;

  constructor() {
    this.apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
    this.pendingEvents = new Map();
  }

  /**
   * Track any engagement event
   * Single entry point for all user actions
   */
  async track(event: EngagementEvent): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/engagement/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...event,
          timestamp: Date.now()
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to track engagement: ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`✅ Tracked ${event.action}:`, result.id);
    } catch (error) {
      console.error('Error tracking engagement:', error);
      // Don't throw - tracking failures should not break user experience
      // Could implement retry queue here
    }
  }

  /**
   * Convenience method: Track thread view
   */
  async trackView(userId: string, threadId: string): Promise<void> {
    return this.track({ 
      userId, 
      threadId, 
      action: 'view' 
    });
  }

  /**
   * Convenience method: Track like
   */
  async trackLike(
    userId: string, 
    threadId: string, 
    contentId: string, 
    contentType: 'thread' | 'question' | 'answer' | 'comment'
  ): Promise<void> {
    return this.track({ 
      userId, 
      threadId, 
      contentId, 
      contentType, 
      action: 'like' 
    });
  }

  /**
   * Convenience method: Track save
   */
  async trackSave(
    userId: string, 
    threadId: string, 
    contentId: string, 
    contentType: 'thread' | 'question' | 'answer' | 'comment'
  ): Promise<void> {
    return this.track({ 
      userId, 
      threadId, 
      contentId, 
      contentType, 
      action: 'save' 
    });
  }

  /**
   * Convenience method: Track share
   */
  async trackShare(
    userId: string, 
    threadId: string, 
    contentId: string, 
    contentType: 'thread' | 'question' | 'answer' | 'comment',
    shareMethod?: string
  ): Promise<void> {
    return this.track({ 
      userId, 
      threadId, 
      contentId, 
      contentType, 
      action: 'share',
      metadata: { shareMethod }
    });
  }

  /**
   * Track time spent on thread
   * Debounced to avoid excessive API calls
   */
  trackTimeSpent(userId: string, threadId: string, seconds: number): void {
    const key = `${userId}-${threadId}`;
    
    // Clear existing debounce timer
    if (this.pendingEvents.has(key)) {
      clearTimeout(this.pendingEvents.get(key)!);
    }

    // Set new debounce timer (send after 5 seconds of inactivity)
    const timer = setTimeout(() => {
      this.track({
        userId,
        threadId,
        action: 'time_spent',
        metadata: { timeSpentSeconds: seconds }
      }).finally(() => {
        this.pendingEvents.delete(key);
      });
    }, 5000);

    this.pendingEvents.set(key, timer);
  }

  /**
   * Flush pending time tracking events (call on page unload)
   */
  flushPendingEvents(): void {
    this.pendingEvents.forEach((timer, key) => {
      clearTimeout(timer);
      // Immediately send pending events
      const [userId, threadId] = key.split('-');
      // Note: This is synchronous send using navigator.sendBeacon if available
      this.sendBeacon(userId, threadId);
    });
    this.pendingEvents.clear();
  }

  /**
   * Send event using navigator.sendBeacon (for page unload)
   */
  private sendBeacon(userId: string, threadId: string): void {
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) {
      return;
    }

    const data = JSON.stringify({
      userId,
      threadId,
      action: 'time_spent',
      timestamp: Date.now()
    });

    navigator.sendBeacon(`${this.apiUrl}/engagement/track`, data);
  }

  /**
   * Get score for an interaction (for display/debugging)
   */
  getScore(interactionType: string, metadata?: { timeSpentSeconds?: number }): number {
    return getRecommendationScore(interactionType, metadata);
  }
}

// Export singleton instance
export const engagementTracker = new EngagementTracker();

// Flush pending events on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    engagementTracker.flushPendingEvents();
  });
}

