import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Notification } from '../types';
import { notificationService } from '../services/notifications';
import { wsService } from '../services/websocket';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  hasMore: boolean;
  loadNotifications: (reset?: boolean) => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  clearAll: () => Promise<void>;
  addNotification: (notification: Notification) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: ReactNode;
  userId: string;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({
  children,
  userId
}) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  // Load notifications
  const loadNotifications = useCallback(async (reset: boolean = false) => {
    if (loading) return;
    
    setLoading(true);
    try {
      const currentOffset = reset ? 0 : offset;
      const response = await notificationService.getNotifications(
        userId,
        20,
        currentOffset
      );

      if (reset) {
        setNotifications(response.notifications);
        setOffset(20);
      } else {
        setNotifications(prev => [...prev, ...response.notifications]);
        setOffset(prev => prev + 20);
      }

      setUnreadCount(response.unreadCount);
      setHasMore(response.hasMore);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [userId, offset, loading]);

  // Load unread count
  const loadUnreadCount = useCallback(async () => {
    try {
      const count = await notificationService.getUnreadCount(userId);
      setUnreadCount(count);
    } catch (error) {
      console.error('Failed to load unread count:', error);
    }
  }, [userId]);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      await notificationService.markAsRead(notificationId);
      
      setNotifications(prev =>
        prev.map(notif =>
          notif.id === notificationId ? { ...notif, isRead: true } : notif
        )
      );
      
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      await notificationService.markAllAsRead(userId);
      
      setNotifications(prev =>
        prev.map(notif => ({ ...notif, isRead: true }))
      );
      
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  }, [userId]);

  // Delete notification
  const deleteNotification = useCallback(async (notificationId: string) => {
    try {
      await notificationService.deleteNotification(notificationId);
      
      // Update unread count if deleted notification was unread
      const deletedNotif = notifications.find(n => n.id === notificationId);
      if (deletedNotif && !deletedNotif.isRead) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }

      setNotifications(prev => prev.filter(notif => notif.id !== notificationId));
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  }, [notifications]);

  // Clear all notifications
  const clearAll = useCallback(async () => {
    try {
      await notificationService.clearAll(userId);
      setNotifications([]);
      setUnreadCount(0);
      setOffset(0);
      setHasMore(false);
    } catch (error) {
      console.error('Failed to clear all notifications:', error);
    }
  }, [userId]);

  // Add notification (from WebSocket)
  const addNotification = useCallback((notification: Notification) => {
    setNotifications(prev => [notification, ...prev]);
    if (!notification.isRead) {
      setUnreadCount(prev => prev + 1);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (userId) {
      loadNotifications(true);
      loadUnreadCount();
    }
  }, [userId]);

  // Subscribe to WebSocket notifications
  useEffect(() => {
    if (!userId) return;

    // Listen for incoming notifications
    const handleNotification = (data: any) => {
      if (data.type === 'notification' && data.data) {
        const notif = data.data;
        
        // Convert backend snake_case to frontend camelCase
        const notification: Notification = {
          id: notif.id,
          recipientId: notif.recipientId || notif.recipient_id,
          actorId: notif.actorId || notif.actor_id,
          type: notif.type,
          contentType: notif.contentType || notif.content_type,
          contentId: notif.contentId || notif.content_id,
          relatedContentId: notif.relatedContentId || notif.related_content_id,
          threadId: notif.threadId || notif.thread_id,
          message: notif.message,
          metadata: typeof notif.metadata === 'string' 
            ? JSON.parse(notif.metadata) 
            : notif.metadata,
          isRead: notif.isRead !== undefined ? notif.isRead : (notif.is_read === 'true'),
          createdAt: new Date(notif.createdAt || notif.created_at),
          readAt: notif.readAt || notif.read_at ? new Date(notif.readAt || notif.read_at) : undefined
        };
        
        console.log('📬 Received notification via WebSocket:', notification);
        addNotification(notification);
      }
    };

    // Register handler for both AWS and Socket.IO
    if (wsService.isAWS) {
      if (!wsService.eventHandlers) {
        wsService.eventHandlers = new Map();
      }
      if (!wsService.eventHandlers.has('notification')) {
        wsService.eventHandlers.set('notification', []);
      }
      wsService.eventHandlers.get('notification')!.push(handleNotification);
    } else if (wsService.socket) {
      wsService.socket.on('notification', handleNotification);
    }

    // Subscribe to notifications via WebSocket (with connection ready check)
    const subscribeToNotifications = () => {
      if (wsService.isAWS && wsService.nativeWs) {
        // Check if WebSocket is ready before sending
        if (wsService.nativeWs.readyState === WebSocket.OPEN) {
          wsService.nativeWs.send(JSON.stringify({ 
            action: 'subscribe_notifications', 
            userId 
          }));
        } else if (wsService.nativeWs.readyState === WebSocket.CONNECTING) {
          // Wait for connection to open
          const openHandler = () => {
            wsService.nativeWs?.send(JSON.stringify({ 
              action: 'subscribe_notifications', 
              userId 
            }));
            wsService.nativeWs?.removeEventListener('open', openHandler);
          };
          wsService.nativeWs.addEventListener('open', openHandler);
        }
      } else if (wsService.socket) {
        // Socket.IO handles connection state internally
        if (wsService.socket.connected) {
          wsService.socket.emit('subscribe_notifications', { userId });
        } else {
          wsService.socket.on('connect', () => {
            wsService.socket?.emit('subscribe_notifications', { userId });
          });
        }
      }
    };

    // Small delay to ensure WebSocket connection is established
    const timer = setTimeout(subscribeToNotifications, 500);

    return () => {
      clearTimeout(timer);
      
      // Cleanup handler
      if (wsService.isAWS && wsService.eventHandlers) {
        const handlers = wsService.eventHandlers.get('notification') || [];
        const index = handlers.indexOf(handleNotification);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      } else if (wsService.socket) {
        wsService.socket.off('notification', handleNotification);
      }
    };
  }, [userId, addNotification]);

  // Poll for updates every 30 seconds (fallback if WebSocket fails)
  useEffect(() => {
    if (!userId) return;

    const interval = setInterval(() => {
      loadUnreadCount();
    }, 30000);

    return () => clearInterval(interval);
  }, [userId, loadUnreadCount]);

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    loading,
    hasMore,
    loadNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    addNotification
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

