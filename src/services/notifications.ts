import { Notification, NotificationResponse } from '../types';

class NotificationService {
  private apiUrl: string;

  constructor() {
    this.apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
  }

  /**
   * Get user's notifications with pagination
   */
  async getNotifications(
    userId: string,
    limit: number = 20,
    offset: number = 0,
    unreadOnly: boolean = false
  ): Promise<NotificationResponse> {
    try {
      const params = new URLSearchParams({
        userId,
        limit: limit.toString(),
        offset: offset.toString(),
        unreadOnly: unreadOnly.toString()
      });

      const response = await fetch(`${this.apiUrl}/notifications?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get notifications: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Convert date strings to Date objects
      const notifications = data.notifications.map((notif: any) => ({
        ...notif,
        createdAt: new Date(notif.createdAt),
        readAt: notif.readAt ? new Date(notif.readAt) : undefined
      }));

      return {
        ...data,
        notifications
      };
    } catch (error) {
      console.error('Error getting notifications:', error);
      throw error;
    }
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const response = await fetch(
        `${this.apiUrl}/notifications/unread-count?userId=${userId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get unread count: ${response.statusText}`);
      }

      const data = await response.json();
      return data.unreadCount;
    } catch (error) {
      console.error('Error getting unread count:', error);
      throw error;
    }
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    try {
      const response = await fetch(
        `${this.apiUrl}/notifications/${notificationId}/read`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to mark notification as read: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/notifications/mark-all-read`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        throw new Error(`Failed to mark all as read: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error marking all as read:', error);
      throw error;
    }
  }

  /**
   * Delete a notification
   */
  async deleteNotification(notificationId: string): Promise<void> {
    try {
      const response = await fetch(
        `${this.apiUrl}/notifications/${notificationId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to delete notification: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
      throw error;
    }
  }

  /**
   * Clear all notifications
   */
  async clearAll(userId: string): Promise<void> {
    try {
      const response = await fetch(
        `${this.apiUrl}/notifications/clear-all?userId=${userId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to clear all notifications: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error clearing all notifications:', error);
      throw error;
    }
  }
}

export const notificationService = new NotificationService();

