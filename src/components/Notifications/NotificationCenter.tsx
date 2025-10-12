import React, { useState, useRef, useEffect } from 'react';
import { useNotifications } from '../../context/NotificationContext';
import { NotificationItem } from './NotificationItem';
import { Button } from '../ui/button';
import { X, Check, Trash2, Bell } from 'lucide-react';
import { Notification } from '../../types';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (notification: Notification) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onClose,
  onNavigate
}) => {
  const {
    notifications,
    unreadCount,
    loading,
    hasMore,
    loadNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll
  } = useNotifications();

  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Handle notification click - navigate to relevant page
  const handleNotificationClick = (notification: Notification) => {
    // Close notification center
    onClose();
    // Navigate
    onNavigate(notification);
  };

  // Infinite scroll
  const handleScroll = () => {
    if (!scrollRef.current || loading || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 100) {
      loadNotifications(false);
    }
  };

  useEffect(() => {
    const div = scrollRef.current;
    if (div) {
      div.addEventListener('scroll', handleScroll);
      return () => div.removeEventListener('scroll', handleScroll);
    }
  }, [loading, hasMore]);

  const filteredNotifications = filter === 'unread'
    ? notifications.filter(n => !n.isRead)
    : notifications;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40 bg-black bg-opacity-50" 
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Notification Panel */}
      <div
        className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-xl z-50 flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Notifications"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-white">
          <h2 className="text-xl font-bold">Notifications</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Close notifications"
          >
            <X size={24} />
          </button>
        </div>

        {/* Filters and Actions */}
        <div className="p-4 border-b space-y-3 bg-white">
          {/* Filter Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'unread'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* Actions */}
          {notifications.length > 0 && (
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={markAllAsRead}
                  className="flex items-center gap-1"
                >
                  <Check size={16} />
                  Mark all read
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={clearAll}
                className="flex items-center gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 size={16} />
                Clear all
              </Button>
            </div>
          )}
        </div>

        {/* Notifications List */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto"
        >
          {filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8">
              <Bell size={48} className="mb-4 text-gray-300" />
              <p className="text-lg font-medium">No notifications</p>
              <p className="text-sm">You're all caught up!</p>
            </div>
          ) : (
            <>
              {filteredNotifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={markAsRead}
                  onDelete={deleteNotification}
                  onClick={handleNotificationClick}
                />
              ))}

              {loading && (
                <div className="flex justify-center p-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              )}

              {!hasMore && filteredNotifications.length > 0 && (
                <div className="text-center p-4 text-sm text-gray-500">
                  No more notifications
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

