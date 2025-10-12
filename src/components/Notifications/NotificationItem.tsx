import React from 'react';
import { Notification } from '../../types';
import { formatDistanceToNow } from 'date-fns';
import { 
  MessageSquare, 
  ThumbsUp, 
  Bookmark, 
  Share2, 
  X,
  Bell
} from 'lucide-react';

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
  onClick: (notification: Notification) => void;
}

export const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onMarkAsRead,
  onDelete,
  onClick
}) => {
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'new_answer':
      case 'answer_commented':
      case 'comment_replied':
        return <MessageSquare size={20} className="text-blue-500" />;
      case 'answer_liked':
      case 'comment_liked':
      case 'thread_liked':
        return <ThumbsUp size={20} className="text-pink-500" />;
      case 'answer_saved':
      case 'thread_saved':
        return <Bookmark size={20} className="text-green-500" />;
      case 'answer_shared':
      case 'thread_shared':
        return <Share2 size={20} className="text-purple-500" />;
      default:
        return <Bell size={20} className="text-gray-500" />;
    }
  };

  const handleClick = () => {
    if (!notification.isRead) {
      onMarkAsRead(notification.id);
    }
    onClick(notification);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(notification.id);
  };

  return (
    <div
      className={`flex items-start gap-3 p-4 border-b cursor-pointer hover:bg-gray-50 transition-colors ${
        !notification.isRead ? 'bg-blue-50' : ''
      }`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {/* Actor Avatar */}
      <img
        src={notification.metadata.actorAvatar}
        alt={notification.metadata.actorName}
        className="w-10 h-10 rounded-full flex-shrink-0 object-cover"
        onError={(e) => {
          (e.target as HTMLImageElement).src = '/img-5.svg';
        }}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {getNotificationIcon(notification.type)}
            <p className="text-sm font-medium text-gray-900">
              {notification.message}
            </p>
          </div>
          
          <button
            onClick={handleDelete}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0 p-1 rounded hover:bg-gray-200 transition-colors"
            aria-label="Delete notification"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Preview */}
        {notification.metadata.contentPreview && (
          <p className="mt-1 text-sm text-gray-600 truncate">
            "{notification.metadata.contentPreview}"
          </p>
        )}

        {/* Thread Title */}
        {notification.metadata.threadTitle && (
          <p className="mt-1 text-xs text-gray-500">
            in "{notification.metadata.threadTitle}"
          </p>
        )}

        {/* Timestamp */}
        <p className="mt-1 text-xs text-gray-400">
          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
        </p>
      </div>

      {/* Unread indicator */}
      {!notification.isRead && (
        <div 
          className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 mt-2" 
          aria-label="Unread"
        />
      )}
    </div>
  );
};

