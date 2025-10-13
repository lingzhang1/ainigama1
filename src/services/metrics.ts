import {
  ViewResponse,
  LikeResponse,
  SaveResponse,
  ShareResponse,
  LikesData,
  SavesData,
  SharesData
} from '../types';

class MetricsService {
  private apiUrl: string;

  constructor() {
    this.apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
  }

  // ==================== VIEWS ====================

  /**
   * Track a view for a thread
   */
  async trackView(threadId: string, userId?: string): Promise<ViewResponse> {
    try {
      const response = await fetch(`${this.apiUrl}/threads/${threadId}/views`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userId || null,
          // Note: IP address and user agent are handled server-side
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to track view: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error tracking view:', error);
      throw error;
    }
  }

  // ==================== LIKES ====================

  /**
   * Toggle like on content (thread, question, answer, or comment)
   */
  async toggleLike(
    contentType: 'thread' | 'question' | 'answer' | 'comment',
    contentId: string,
    userId: string,
    action: 'like' | 'unlike'
  ): Promise<LikeResponse> {
    try {
      const response = await fetch(`${this.apiUrl}/likes/${contentType}/${contentId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          action,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to toggle like: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error toggling like:', error);
      throw error;
    }
  }

  /**
   * Get likes data for specific content
   */
  async getLikes(
    contentType: 'thread' | 'question' | 'answer' | 'comment',
    contentId: string,
    userId?: string
  ): Promise<LikesData> {
    try {
      const url = new URL(`${this.apiUrl}/likes/${contentType}/${contentId}`);
      if (userId) {
        url.searchParams.append('userId', userId);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get likes: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting likes:', error);
      throw error;
    }
  }

  // ==================== SAVES ====================

  /**
   * Toggle save on content (thread, question, answer, or comment)
   */
  async toggleSave(
    contentType: 'thread' | 'question' | 'answer' | 'comment',
    contentId: string,
    userId: string,
    action: 'save' | 'unsave'
  ): Promise<SaveResponse> {
    try {
      const response = await fetch(`${this.apiUrl}/saves/${contentType}/${contentId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          action,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to toggle save: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error toggling save:', error);
      throw error;
    }
  }

  /**
   * Get user's saved content
   */
  async getUserSaves(userId: string): Promise<SavesData> {
    try {
      const response = await fetch(`${this.apiUrl}/users/${userId}/saves`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get user saves: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting user saves:', error);
      throw error;
    }
  }

  /**
   * Get user's liked content
   */
  async getUserLikes(userId: string): Promise<LikesData> {
    try {
      const response = await fetch(`${this.apiUrl}/users/${userId}/likes`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get user likes: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting user likes:', error);
      throw error;
    }
  }

  /**
   * Get user's replies (answers and comments)
   */
  async getUserReplies(userId: string): Promise<any> {
    try {
      const response = await fetch(`${this.apiUrl}/users/${userId}/replies`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get user replies: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting user replies:', error);
      throw error;
    }
  }

  // ==================== SHARES ====================

  /**
   * Track a share for content
   */
  async trackShare(
    contentType: 'thread' | 'question' | 'answer' | 'comment',
    contentId: string,
    userId?: string,
    shareMethod: string = 'copy_link'
  ): Promise<ShareResponse> {
    try {
      const response = await fetch(`${this.apiUrl}/shares/${contentType}/${contentId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userId || null,
          shareMethod,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to track share: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error tracking share:', error);
      throw error;
    }
  }

  /**
   * Get shares data for specific content
   */
  async getShares(
    contentType: 'thread' | 'question' | 'answer' | 'comment',
    contentId: string
  ): Promise<SharesData> {
    try {
      const response = await fetch(`${this.apiUrl}/shares/${contentType}/${contentId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get shares: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting shares:', error);
      throw error;
    }
  }

  // ==================== BATCH INTERACTIONS (PERFORMANCE OPTIMIZATION) ====================

  /**
   * Get all user interactions for a specific thread in a single API call
   * This is a performance optimization that replaces N individual getLikes calls
   */
  async getUserInteractionsForThread(userId: string, threadId: string): Promise<{
    likes: {
      thread: string[];
      questions: string[];
      answers: string[];
      comments: string[];
    };
    saves: {
      thread: string[];
      questions: string[];
      answers: string[];
      comments: string[];
    };
  }> {
    try {
      const response = await fetch(`${this.apiUrl}/users/${userId}/interactions?threadId=${threadId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get user interactions: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting user interactions for thread:', error);
      throw error;
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Copy content URL to clipboard and track share
   */
  async copyAndTrackShare(
    contentType: 'thread' | 'question' | 'answer' | 'comment',
    contentId: string,
    userId?: string
  ): Promise<void> {
    try {
      // Get share URL from tracking
      const shareResponse = await this.trackShare(contentType, contentId, userId, 'copy_link');
      
      // Copy to clipboard
      await navigator.clipboard.writeText(shareResponse.shareUrl);
      
      console.log('URL copied to clipboard and share tracked');
    } catch (error) {
      console.error('Error copying and tracking share:', error);
      throw error;
    }
  }

  /**
   * Share to social media and track
   */
  async shareToSocial(
    contentType: 'thread' | 'question' | 'answer' | 'comment',
    contentId: string,
    platform: 'twitter' | 'facebook' | 'linkedin',
    userId?: string
  ): Promise<void> {
    try {
      // Track the share
      await this.trackShare(contentType, contentId, userId, platform);
      
      // Get share URL
      const shareResponse = await this.trackShare(contentType, contentId, userId, 'copy_link');
      
      // Open social media share dialog
      let shareUrl = '';
      switch (platform) {
        case 'twitter':
          shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareResponse.shareUrl)}&text=${encodeURIComponent('Check out this thread on Ainigama!')}`;
          break;
        case 'facebook':
          shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareResponse.shareUrl)}`;
          break;
        case 'linkedin':
          shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareResponse.shareUrl)}`;
          break;
      }
      
      window.open(shareUrl, '_blank', 'width=600,height=400');
    } catch (error) {
      console.error('Error sharing to social media:', error);
      throw error;
    }
  }
}

export const metricsService = new MetricsService();
