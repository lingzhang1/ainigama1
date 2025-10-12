# Message Notification System Design

## Overview

This document outlines the design for a comprehensive notification system that alerts users to various activities in the application, including new answers to their questions, and reactions to their content (likes, comments, saves, and shares).

## System Architecture

### Core Components
1. **Notifications Table (DynamoDB)**: Store all notification records
2. **Lambda Handlers**: Process and deliver notifications
3. **WebSocket Integration**: Real-time notification delivery
4. **Frontend Message Center**: Display and manage notifications
5. **Notification Service**: Centralized notification creation logic

---

## 1. Backend Design (AWS Lambda + DynamoDB)

### 1.1 Database Schema

#### Notifications Table

**Table Name**: `ainigama-{stage}-notifications`

**Primary Key**:
- `id` (String, HASH): Unique notification ID (UUID)

**Attributes**:
```javascript
{
  id: "UUID",                          // Notification ID
  recipient_id: "user_id",            // User who receives the notification
  actor_id: "user_id",                // User who triggered the notification (optional)
  type: "notification_type",          // Type of notification
  content_type: "thread|answer|comment", // Type of content involved
  content_id: "content_id",           // ID of the content (answer, comment, etc.)
  related_content_id: "content_id",   // ID of related content (question_id for answer, answer_id for comment)
  thread_id: "thread_id",             // Thread this notification relates to
  message: "Notification message",     // Human-readable message
  metadata: {                         // Additional data for rendering
    actorName: "Actor Name",
    actorAvatar: "/avatar.png",
    contentPreview: "Content preview...",
    threadTitle: "Thread Title"
  },
  is_read: false,                     // Read status
  created_at: "ISO timestamp",        // When notification was created
  read_at: null,                      // When notification was read (optional)
  expires_at: "ISO timestamp"         // TTL for old notifications (30 days)
}
```

**Global Secondary Indexes**:

1. **RecipientIdIndex**
   - Partition Key: `recipient_id`
   - Sort Key: `created_at`
   - Purpose: Query all notifications for a user, sorted by time
   - Projection: ALL

2. **RecipientIdReadIndex**
   - Partition Key: `recipient_id`
   - Sort Key: `is_read`
   - Purpose: Query unread notifications for a user
   - Projection: ALL

**Notification Types**:
```javascript
const NotificationTypes = {
  NEW_ANSWER: 'new_answer',           // New answer to user's question
  ANSWER_LIKED: 'answer_liked',       // Someone liked user's answer
  ANSWER_COMMENTED: 'answer_commented', // Someone commented on user's answer
  ANSWER_SAVED: 'answer_saved',       // Someone saved user's answer
  ANSWER_SHARED: 'answer_shared',     // Someone shared user's answer
  COMMENT_LIKED: 'comment_liked',     // Someone liked user's comment
  COMMENT_REPLIED: 'comment_replied', // Someone replied to user's comment
  THREAD_LIKED: 'thread_liked',       // Someone liked user's thread
  THREAD_SAVED: 'thread_saved',       // Someone saved user's thread
  THREAD_SHARED: 'thread_shared'      // Someone shared user's thread
};
```

### 1.2 Lambda Handlers

#### File: `infrastructure/aws/src/handlers/notifications.js`

**Endpoints**:

1. **GET /notifications**
   - Get user's notifications (with pagination)
   - Query parameters: `userId`, `limit`, `offset`, `unreadOnly`

2. **GET /notifications/unread-count**
   - Get count of unread notifications
   - Query parameters: `userId`

3. **PUT /notifications/{notificationId}/read**
   - Mark a notification as read

4. **PUT /notifications/mark-all-read**
   - Mark all user's notifications as read
   - Body: `{ userId }`

5. **DELETE /notifications/{notificationId}**
   - Delete a specific notification

6. **DELETE /notifications/clear-all**
   - Clear all notifications for a user
   - Query parameters: `userId`

#### Helper Functions

**createNotification(recipientId, type, data)**
```javascript
/**
 * Creates a notification and optionally sends it via WebSocket
 * @param {string} recipientId - User who will receive the notification
 * @param {string} type - Type of notification
 * @param {object} data - Notification data
 * @returns {Promise<Notification>}
 */
async function createNotification(recipientId, type, data) {
  const notificationId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const notification = {
    id: notificationId,
    recipient_id: recipientId,
    actor_id: data.actorId,
    type: type,
    content_type: data.contentType,
    content_id: data.contentId,
    related_content_id: data.relatedContentId,
    thread_id: data.threadId,
    message: generateNotificationMessage(type, data),
    metadata: {
      actorName: data.actorName,
      actorAvatar: data.actorAvatar,
      contentPreview: data.contentPreview,
      threadTitle: data.threadTitle
    },
    is_read: false,
    created_at: now.toISOString(),
    read_at: null,
    expires_at: Math.floor(expiresAt.getTime() / 1000) // DynamoDB TTL format
  };

  // Save to DynamoDB
  await dbOperations.put(tables.notifications, notification);

  // Send via WebSocket if user is connected
  await sendNotificationViaWebSocket(recipientId, notification);

  return notification;
}
```

**generateNotificationMessage(type, data)**
```javascript
/**
 * Generate human-readable notification message
 */
function generateNotificationMessage(type, data) {
  const { actorName } = data;
  
  switch (type) {
    case 'new_answer':
      return `${actorName} answered your question`;
    case 'answer_liked':
      return `${actorName} liked your answer`;
    case 'answer_commented':
      return `${actorName} commented on your answer`;
    case 'answer_saved':
      return `${actorName} saved your answer`;
    case 'answer_shared':
      return `${actorName} shared your answer`;
    case 'comment_liked':
      return `${actorName} liked your comment`;
    case 'comment_replied':
      return `${actorName} replied to your comment`;
    case 'thread_liked':
      return `${actorName} liked your thread`;
    case 'thread_saved':
      return `${actorName} saved your thread`;
    case 'thread_shared':
      return `${actorName} shared your thread`;
    default:
      return 'You have a new notification';
  }
}
```

### 1.3 Notification Triggers

Notifications should be created when specific events occur. These triggers need to be integrated into existing handlers:

#### 1.3.1 New Answer Notification

**File**: `infrastructure/aws/src/handlers/publicThread.js` (addAnswer function)

```javascript
// After creating an answer
const question = await getQuestionById(questionId);
if (question.user_id && question.user_id !== answer.user_id) {
  // Get actor info
  const actor = await getUserById(answer.user_id);
  
  await createNotification(question.user_id, 'new_answer', {
    actorId: answer.user_id,
    actorName: actor.name,
    actorAvatar: actor.avatar,
    contentType: 'answer',
    contentId: answer.id,
    relatedContentId: question.id,
    threadId: question.thread_id,
    contentPreview: answer.content.substring(0, 100),
    threadTitle: await getThreadTitle(question.thread_id)
  });
}
```

#### 1.3.2 Like Notification

**File**: `infrastructure/aws/src/handlers/metrics.js` (toggleLike function)

```javascript
// After successfully liking content
if (action === 'like' && isLiked) {
  const content = await getContentById(contentType, contentId);
  const contentCreatorId = content.user_id || content.creator_id;
  
  if (contentCreatorId && contentCreatorId !== userId) {
    const actor = await getUserById(userId);
    
    await createNotification(contentCreatorId, `${contentType}_liked`, {
      actorId: userId,
      actorName: actor.name,
      actorAvatar: actor.avatar,
      contentType: contentType,
      contentId: contentId,
      relatedContentId: null,
      threadId: content.thread_id,
      contentPreview: content.content?.substring(0, 100) || content.title,
      threadTitle: await getThreadTitle(content.thread_id)
    });
  }
}
```

#### 1.3.3 Comment Notification

**File**: `infrastructure/aws/src/handlers/api.js` (addAnswerComment function)

```javascript
// After adding a comment
const answer = await getAnswerById(answerId);
if (answer.user_id && answer.user_id !== comment.user_id) {
  const actor = await getUserById(comment.user_id);
  
  await createNotification(answer.user_id, 'answer_commented', {
    actorId: comment.user_id,
    actorName: actor.name,
    actorAvatar: actor.avatar,
    contentType: 'comment',
    contentId: comment.id,
    relatedContentId: answer.id,
    threadId: answer.thread_id,
    contentPreview: comment.content.substring(0, 100),
    threadTitle: await getThreadTitle(answer.thread_id)
  });
}
```

#### 1.3.4 Save Notification

**File**: `infrastructure/aws/src/handlers/metrics.js` (toggleSave function)

```javascript
// After successfully saving content
if (action === 'save' && isSaved) {
  const content = await getContentById(contentType, contentId);
  const contentCreatorId = content.user_id || content.creator_id;
  
  if (contentCreatorId && contentCreatorId !== userId) {
    const actor = await getUserById(userId);
    
    await createNotification(contentCreatorId, `${contentType}_saved`, {
      actorId: userId,
      actorName: actor.name,
      actorAvatar: actor.avatar,
      contentType: contentType,
      contentId: contentId,
      relatedContentId: null,
      threadId: content.thread_id,
      contentPreview: content.content?.substring(0, 100) || content.title,
      threadTitle: await getThreadTitle(content.thread_id)
    });
  }
}
```

#### 1.3.5 Share Notification

**File**: `infrastructure/aws/src/handlers/metrics.js` (trackShare function)

```javascript
// After tracking a share
if (userId) {
  const content = await getContentById(contentType, contentId);
  const contentCreatorId = content.user_id || content.creator_id;
  
  if (contentCreatorId && contentCreatorId !== userId) {
    const actor = await getUserById(userId);
    
    await createNotification(contentCreatorId, `${contentType}_shared`, {
      actorId: userId,
      actorName: actor.name,
      actorAvatar: actor.avatar,
      contentType: contentType,
      contentId: contentId,
      relatedContentId: null,
      threadId: content.thread_id,
      contentPreview: content.content?.substring(0, 100) || content.title,
      threadTitle: await getThreadTitle(content.thread_id)
    });
  }
}
```

### 1.4 WebSocket Integration

#### File: `infrastructure/aws/src/handlers/websocket.js`

Add a new WebSocket route for notification subscription:

```javascript
// New route: notification_subscribe
exports.subscribeNotifications = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const { userId } = JSON.parse(event.body);

  try {
    // Store subscription preference in connections table
    await dynamodb.update({
      TableName: connectionsTable,
      Key: { connectionId },
      UpdateExpression: 'SET subscribeNotifications = :true',
      ExpressionAttributeValues: {
        ':true': true
      }
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Subscribed to notifications' })
    };
  } catch (error) {
    console.error('Subscribe notifications error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to subscribe to notifications' })
    };
  }
};
```

**Send Notification via WebSocket**:

```javascript
async function sendNotificationViaWebSocket(recipientId, notification) {
  try {
    // Get all active connections for this user
    const connections = await dbOperations.query(
      tables.connections,
      'userId = :userId',
      { ':userId': recipientId },
      'UserIdIndex'
    );

    if (!connections.Items || connections.Items.length === 0) {
      console.log('No active connections for user:', recipientId);
      return;
    }

    const apiGatewayManagementApi = new AWS.ApiGatewayManagementApi({
      endpoint: process.env.WEBSOCKET_ENDPOINT
    });

    // Send to all user's connections
    const sendPromises = connections.Items.map(async (connection) => {
      try {
        await apiGatewayManagementApi.postToConnection({
          ConnectionId: connection.connectionId,
          Data: JSON.stringify({
            type: 'notification',
            data: notification
          })
        }).promise();
      } catch (error) {
        if (error.statusCode === 410) {
          // Connection is stale, delete it
          await dbOperations.delete(tables.connections, { 
            connectionId: connection.connectionId 
          });
        } else {
          console.error('Failed to send notification to connection:', error);
        }
      }
    });

    await Promise.all(sendPromises);
  } catch (error) {
    console.error('Failed to send notification via WebSocket:', error);
  }
}
```

### 1.5 serverless.yml Updates

Add the following to `infrastructure/aws/serverless.yml`:

```yaml
provider:
  environment:
    # ... existing environment variables
    DYNAMODB_TABLE_NOTIFICATIONS: ${self:service}-${self:provider.stage}-notifications

  iamRoleStatements:
    # ... existing IAM statements
    - Effect: Allow
      Action:
        - dynamodb:Query
        - dynamodb:Scan
        - dynamodb:GetItem
        - dynamodb:PutItem
        - dynamodb:UpdateItem
        - dynamodb:DeleteItem
      Resource:
        - "arn:aws:dynamodb:${self:provider.region}:*:table/${self:provider.environment.DYNAMODB_TABLE_NOTIFICATIONS}"
        - "arn:aws:dynamodb:${self:provider.region}:*:table/${self:provider.environment.DYNAMODB_TABLE_NOTIFICATIONS}/index/*"

functions:
  # ... existing functions
  
  # Notification API Functions
  getNotifications:
    handler: src/handlers/notifications.getNotifications
    events:
      - http:
          path: /notifications
          method: get
          cors: true
      - http:
          path: /notifications
          method: options
          cors: true

  getUnreadCount:
    handler: src/handlers/notifications.getUnreadCount
    events:
      - http:
          path: /notifications/unread-count
          method: get
          cors: true
      - http:
          path: /notifications/unread-count
          method: options
          cors: true

  markNotificationRead:
    handler: src/handlers/notifications.markRead
    events:
      - http:
          path: /notifications/{notificationId}/read
          method: put
          cors: true
      - http:
          path: /notifications/{notificationId}/read
          method: options
          cors: true

  markAllNotificationsRead:
    handler: src/handlers/notifications.markAllRead
    events:
      - http:
          path: /notifications/mark-all-read
          method: put
          cors: true
      - http:
          path: /notifications/mark-all-read
          method: options
          cors: true

  deleteNotification:
    handler: src/handlers/notifications.deleteNotification
    events:
      - http:
          path: /notifications/{notificationId}
          method: delete
          cors: true
      - http:
          path: /notifications/{notificationId}
          method: options
          cors: true

  clearAllNotifications:
    handler: src/handlers/notifications.clearAll
    events:
      - http:
          path: /notifications/clear-all
          method: delete
          cors: true
      - http:
          path: /notifications/clear-all
          method: options
          cors: true

  # WebSocket notification subscription
  subscribeNotifications:
    handler: src/handlers/websocket.subscribeNotifications
    events:
      - websocket:
          route: subscribe_notifications

resources:
  Resources:
    # ... existing resources
    
    NotificationsTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: ${self:provider.environment.DYNAMODB_TABLE_NOTIFICATIONS}
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
          - AttributeName: recipient_id
            AttributeType: S
          - AttributeName: created_at
            AttributeType: S
          - AttributeName: is_read
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
        GlobalSecondaryIndexes:
          - IndexName: RecipientIdIndex
            KeySchema:
              - AttributeName: recipient_id
                KeyType: HASH
              - AttributeName: created_at
                KeyType: RANGE
            Projection:
              ProjectionType: ALL
          - IndexName: RecipientIdReadIndex
            KeySchema:
              - AttributeName: recipient_id
                KeyType: HASH
              - AttributeName: is_read
                KeyType: RANGE
            Projection:
              ProjectionType: ALL
        TimeToLiveSpecification:
          AttributeName: expires_at
          Enabled: true
        BillingMode: PAY_PER_REQUEST
```

---

## 2. Frontend Design (React + TypeScript)

### 2.1 Type Definitions

Add to `src/types/index.ts`:

```typescript
export interface Notification {
  id: string;
  recipientId: string;
  actorId?: string;
  type: NotificationType;
  contentType: 'thread' | 'answer' | 'comment';
  contentId: string;
  relatedContentId?: string;
  threadId: string;
  message: string;
  metadata: {
    actorName: string;
    actorAvatar: string;
    contentPreview: string;
    threadTitle: string;
  };
  isRead: boolean;
  createdAt: Date;
  readAt?: Date;
}

export type NotificationType =
  | 'new_answer'
  | 'answer_liked'
  | 'answer_commented'
  | 'answer_saved'
  | 'answer_shared'
  | 'comment_liked'
  | 'comment_replied'
  | 'thread_liked'
  | 'thread_saved'
  | 'thread_shared';

export interface NotificationResponse {
  notifications: Notification[];
  unreadCount: number;
  hasMore: boolean;
  nextOffset?: number;
}
```

### 2.2 Notification Service

Create `src/services/notifications.ts`:

```typescript
import { Notification, NotificationResponse } from '../types';

class NotificationService {
  private apiUrl: string;

  constructor() {
    this.apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
  }

  /**
   * Get user's notifications
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

      return await response.json();
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
```

### 2.3 Notification Context

Create `src/context/NotificationContext.tsx`:

```typescript
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Notification } from '../types';
import { notificationService } from '../services/notifications';
import { useWebSocket } from '../hooks/useWebSocket';

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
  children: React.ReactNode;
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

  const { sendMessage, lastMessage } = useWebSocket();

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
      
      setNotifications(prev => prev.filter(notif => notif.id !== notificationId));
      
      // Update unread count if deleted notification was unread
      const deletedNotif = notifications.find(n => n.id === notificationId);
      if (deletedNotif && !deletedNotif.isRead) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
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

  // Handle incoming WebSocket notifications
  useEffect(() => {
    if (lastMessage?.type === 'notification') {
      const newNotification = lastMessage.data as Notification;
      
      // Add to top of list
      setNotifications(prev => [newNotification, ...prev]);
      setUnreadCount(prev => prev + 1);
    }
  }, [lastMessage]);

  // Subscribe to notifications on mount
  useEffect(() => {
    if (sendMessage) {
      sendMessage('subscribe_notifications', { userId });
    }
  }, [sendMessage, userId]);

  // Initial load
  useEffect(() => {
    loadNotifications(true);
    loadUnreadCount();
  }, [userId]);

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    loading,
    hasMore,
    loadNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
```

### 2.4 UI Components

#### 2.4.1 Notification Bell Icon

Create `src/components/Notifications/NotificationBell.tsx`:

```typescript
import React from 'react';
import { Bell } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';

interface NotificationBellProps {
  onClick: () => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ onClick }) => {
  const { unreadCount } = useNotifications();

  return (
    <button
      onClick={onClick}
      className="relative p-2 text-gray-600 hover:text-gray-900 focus:outline-none"
      aria-label="Notifications"
    >
      <Bell size={24} />
      {unreadCount > 0 && (
        <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
};
```

#### 2.4.2 Notification Item

Create `src/components/Notifications/NotificationItem.tsx`:

```typescript
import React from 'react';
import { Notification } from '../../types';
import { formatDistanceToNow } from 'date-fns';
import { 
  MessageSquare, 
  ThumbsUp, 
  Bookmark, 
  Share2, 
  X 
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
    >
      {/* Actor Avatar */}
      <img
        src={notification.metadata.actorAvatar}
        alt={notification.metadata.actorName}
        className="w-10 h-10 rounded-full flex-shrink-0"
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
            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
            aria-label="Delete notification"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Preview */}
        {notification.metadata.contentPreview && (
          <p className="mt-1 text-sm text-gray-600 truncate">
            {notification.metadata.contentPreview}
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
        <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 mt-2" />
      )}
    </div>
  );
};
```

#### 2.4.3 Notification Center

Create `src/components/Notifications/NotificationCenter.tsx`:

```typescript
import React, { useState, useRef, useEffect } from 'react';
import { useNotifications } from '../../context/NotificationContext';
import { NotificationItem } from './NotificationItem';
import { Button } from '../ui/button';
import { X, Check, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onClose
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
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Handle notification click - navigate to relevant page
  const handleNotificationClick = (notification: Notification) => {
    // Close notification center
    onClose();

    // Navigate based on content type
    if (notification.threadId) {
      navigate(`/thread/${notification.threadId}`);
    }
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
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold">Notifications</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={24} />
          </button>
        </div>

        {/* Filters and Actions */}
        <div className="p-4 border-b space-y-3">
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
                className="flex items-center gap-1 text-red-600 hover:text-red-700"
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
          className="overflow-y-auto"
          style={{ height: 'calc(100% - 180px)' }}
        >
          {filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <Bell size={48} className="mb-4 text-gray-300" />
              <p className="text-lg font-medium">No notifications</p>
              <p className="text-sm">You're all caught up!</p>
            </div>
          ) : (
            filteredNotifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkAsRead={markAsRead}
                onDelete={deleteNotification}
                onClick={handleNotificationClick}
              />
            ))
          )}

          {loading && (
            <div className="flex justify-center p-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
```

### 2.5 Integration with App

Update `src/App.tsx` to include notification context and bell icon:

```typescript
import { NotificationProvider } from './context/NotificationContext';
import { NotificationBell } from './components/Notifications/NotificationBell';
import { NotificationCenter } from './components/Notifications/NotificationCenter';
import { useState } from 'react';

function App() {
  const [showNotifications, setShowNotifications] = useState(false);
  const { user } = useAppContext();

  return (
    <AppContext.Provider value={contextValue}>
      {user && (
        <NotificationProvider userId={user.id}>
          {/* Add notification bell to header */}
          <header className="...">
            {/* ... other header content ... */}
            <NotificationBell onClick={() => setShowNotifications(true)} />
          </header>

          {/* Notification Center */}
          <NotificationCenter
            isOpen={showNotifications}
            onClose={() => setShowNotifications(false)}
          />

          {/* ... rest of app ... */}
        </NotificationProvider>
      )}
    </AppContext.Provider>
  );
}
```

---

## 3. Implementation Roadmap

### Phase 1: Backend Setup (Week 1)
1. Create notifications DynamoDB table, Use GSI for efficient queries
2. Implement notification handler functions
3. Add notification creation to existing handlers
4. Deploy and test API endpoints

### Phase 2: WebSocket Integration (Week 2)
1. Add WebSocket notification routes
2. Implement real-time notification delivery
3. Test WebSocket connectivity

### Phase 3: Frontend UI (Week 2-3)
1. Create notification components
2. Implement notification context
3. Add notification bell to header
4. Build notification center UI

### Phase 4: Testing & Optimization (Week 3)
1. End-to-end testing
2. Performance optimization
3. Bug fixes and refinements

### Phase 5: Deployment (Week 4)
1. Deploy to production
2. Monitor performance
3. Gather user feedback

---

## 4. Notification Delivery Rules

### When to Send Notifications

1. **NEW_ANSWER**: Immediately when answer is posted
2. **LIKE**: Immediately when content is liked
3. **COMMENT**: Immediately when comment is posted
4. **SAVE**: Immediately when content is saved
5. **SHARE**: Immediately when content is shared

### When NOT to Send Notifications

1. User is interacting with their own content
2. User has muted notifications (future feature)
3. Content is more than 30 days old
4. User has blocked the actor (future feature)

### Notification Grouping (Future Enhancement)

Group similar notifications:
- "John and 5 others liked your answer"
- "3 new answers to your question"

---

## 5. Performance Considerations

### Database Optimization
- Use GSI for efficient queries
- Enable TTL to auto-delete old notifications (30 days)
- Implement pagination for large notification lists

### WebSocket Optimization
- Clean up stale connections regularly
- Batch notifications when possible
- Fallback to polling if WebSocket unavailable

### Frontend Optimization
- Lazy load notification list
- Cache notification data
- Implement virtual scrolling for long lists
- Debounce mark-as-read actions

---

## 6. Future Enhancements

1. **Notification Preferences**
   - Allow users to customize which notifications they receive
   - Email notifications for important events
   - Push notifications for mobile

2. **Notification Grouping**
   - Group similar notifications together
   - Batch digest notifications

3. **Rich Notifications**
   - Include images and formatted text
   - Preview content inline

4. **Notification History**
   - Archive old notifications
   - Search through notification history

5. **Smart Notifications**
   - Priority-based notification sorting
   - AI-powered notification relevance
   - Mute notifications for specific threads

6. **Multi-device Sync**
   - Sync read/unread status across devices
   - Mark as read on one device updates all devices

---

## 7. Security Considerations

1. **Authorization**: Ensure users can only access their own notifications
2. **Rate Limiting**: Prevent notification spam
3. **Data Validation**: Validate all notification data
4. **XSS Prevention**: Sanitize notification messages
5. **DDoS Protection**: Implement rate limiting on WebSocket connections

---

## 8. Monitoring & Analytics

Track the following metrics:

1. **Notification Metrics**
   - Total notifications sent
   - Notifications by type
   - Average time to read
   - Read rate

2. **Performance Metrics**
   - API response times
   - WebSocket connection success rate
   - Database query performance

3. **User Engagement**
   - Notification click-through rate
   - Time spent in notification center
   - Most engaged notification types

---

## Conclusion

This notification system design provides a robust, scalable solution for keeping users engaged with real-time updates about their content. The system leverages AWS Lambda, DynamoDB, and WebSocket API for efficient real-time delivery, while the React frontend provides a smooth, user-friendly experience.

The phased implementation approach ensures steady progress with testable milestones, and the design is flexible enough to accommodate future enhancements as the product evolves.

