const crypto = require('crypto');
const AWS = require('aws-sdk');
const { addCorsHeaders, handleOptionsRequest } = require('../utils/cors');
const { tables, dbOperations, parseRequestBody } = require('../utils/db');

const apiGatewayManagementApi = new AWS.ApiGatewayManagementApi({
  endpoint: process.env.WEBSOCKET_ENDPOINT
});

// Notification types
const NotificationTypes = {
  NEW_ANSWER: 'new_answer',
  ANSWER_LIKED: 'answer_liked',
  ANSWER_COMMENTED: 'answer_commented',
  ANSWER_SAVED: 'answer_saved',
  ANSWER_SHARED: 'answer_shared',
  COMMENT_LIKED: 'comment_liked',
  COMMENT_REPLIED: 'comment_replied',
  THREAD_LIKED: 'thread_liked',
  THREAD_SAVED: 'thread_saved',
  THREAD_SHARED: 'thread_shared'
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Generate human-readable notification message
 */
function generateNotificationMessage(type, data) {
  const { actorName } = data;
  
  switch (type) {
    case NotificationTypes.NEW_ANSWER:
      return `${actorName} answered your question`;
    case NotificationTypes.ANSWER_LIKED:
      return `${actorName} liked your answer`;
    case NotificationTypes.ANSWER_COMMENTED:
      return `${actorName} commented on your answer`;
    case NotificationTypes.ANSWER_SAVED:
      return `${actorName} saved your answer`;
    case NotificationTypes.ANSWER_SHARED:
      return `${actorName} shared your answer`;
    case NotificationTypes.COMMENT_LIKED:
      return `${actorName} liked your comment`;
    case NotificationTypes.COMMENT_REPLIED:
      return `${actorName} replied to your comment`;
    case NotificationTypes.THREAD_LIKED:
      return `${actorName} liked your thread`;
    case NotificationTypes.THREAD_SAVED:
      return `${actorName} saved your thread`;
    case NotificationTypes.THREAD_SHARED:
      return `${actorName} shared your thread`;
    default:
      return 'You have a new notification';
  }
}

/**
 * Send notification via WebSocket
 */
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
    console.log('✅ Notification sent via WebSocket to user:', recipientId);
  } catch (error) {
    console.error('Failed to send notification via WebSocket:', error);
  }
}

/**
 * Create a notification and optionally send it via WebSocket
 */
async function createNotification(recipientId, type, data) {
  try {
    const notificationId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const notification = {
      id: notificationId,
      recipient_id: recipientId,
      actor_id: data.actorId || null,
      type: type,
      content_type: data.contentType,
      content_id: data.contentId,
      related_content_id: data.relatedContentId || null,
      thread_id: data.threadId || null,
      message: generateNotificationMessage(type, data),
      metadata: JSON.stringify({
        actorName: data.actorName,
        actorAvatar: data.actorAvatar,
        contentPreview: data.contentPreview,
        threadTitle: data.threadTitle
      }),
      is_read: 'false', // Store as string for GSI compatibility
      created_at: now.toISOString(),
      read_at: null,
      expires_at: Math.floor(expiresAt.getTime() / 1000) // DynamoDB TTL format (seconds)
    };

    // Save to DynamoDB
    await dbOperations.put(tables.notifications, notification);
    console.log('✅ Notification created:', notificationId);

    // Send via WebSocket if user is connected
    await sendNotificationViaWebSocket(recipientId, notification);

    return notification;
  } catch (error) {
    console.error('Failed to create notification:', error);
    throw error;
  }
}

// ==================== API HANDLERS ====================

/**
 * Get user's notifications
 * GET /notifications?userId={userId}&limit={limit}&offset={offset}&unreadOnly={true/false}
 */
exports.getNotifications = async (event) => {
  try {
    console.log('getNotifications called with method:', event.httpMethod);
    
    if (event.httpMethod === 'OPTIONS') {
      return handleOptionsRequest();
    }

    const { userId, limit = '20', offset = '0', unreadOnly = 'false' } = event.queryStringParameters || {};
    
    if (!userId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'User ID is required' })
      });
    }

    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset);

    // Query notifications for user
    const result = await dbOperations.query(
      tables.notifications,
      'recipient_id = :recipientId',
      { ':recipientId': userId },
      'RecipientIdIndex',
      false, // newest first
      limitNum + offsetNum + 1 // Get one extra to check if there's more
    );

    let notifications = result.Items || [];

    // Filter for unread only if requested
    if (unreadOnly === 'true') {
      notifications = notifications.filter(n => n.is_read === 'false');
    }

    // Apply offset and limit
    const paginatedNotifications = notifications.slice(offsetNum, offsetNum + limitNum);
    const hasMore = notifications.length > offsetNum + limitNum;

    // Parse metadata for each notification
    const transformedNotifications = paginatedNotifications.map(notif => ({
      id: notif.id,
      recipientId: notif.recipient_id,
      actorId: notif.actor_id,
      type: notif.type,
      contentType: notif.content_type,
      contentId: notif.content_id,
      relatedContentId: notif.related_content_id,
      threadId: notif.thread_id,
      message: notif.message,
      metadata: JSON.parse(notif.metadata || '{}'),
      isRead: notif.is_read === 'true',
      createdAt: notif.created_at,
      readAt: notif.read_at
    }));

    // Get unread count
    const unreadResult = await dbOperations.query(
      tables.notifications,
      'recipient_id = :recipientId AND is_read = :isRead',
      { 
        ':recipientId': userId,
        ':isRead': 'false'
      },
      'RecipientIdReadIndex'
    );

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        notifications: transformedNotifications,
        unreadCount: unreadResult.Count || 0,
        hasMore: hasMore,
        nextOffset: hasMore ? offsetNum + limitNum : null
      })
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to get notifications',
        message: error.message 
      })
    });
  }
};

/**
 * Get unread notification count
 * GET /notifications/unread-count?userId={userId}
 */
exports.getUnreadCount = async (event) => {
  try {
    console.log('getUnreadCount called with method:', event.httpMethod);
    
    if (event.httpMethod === 'OPTIONS') {
      return handleOptionsRequest();
    }

    const { userId } = event.queryStringParameters || {};
    
    if (!userId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'User ID is required' })
      });
    }

    // Query unread notifications
    const result = await dbOperations.query(
      tables.notifications,
      'recipient_id = :recipientId AND is_read = :isRead',
      { 
        ':recipientId': userId,
        ':isRead': 'false'
      },
      'RecipientIdReadIndex'
    );

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        unreadCount: result.Count || 0
      })
    });

  } catch (error) {
    console.error('Get unread count error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to get unread count',
        message: error.message 
      })
    });
  }
};

/**
 * Mark a notification as read
 * PUT /notifications/{notificationId}/read
 */
exports.markRead = async (event) => {
  try {
    console.log('markRead called with method:', event.httpMethod);
    
    if (event.httpMethod === 'OPTIONS') {
      return handleOptionsRequest();
    }

    const { notificationId } = event.pathParameters || {};
    
    if (!notificationId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Notification ID is required' })
      });
    }

    // Update notification
    await dbOperations.update(
      tables.notifications,
      { id: notificationId },
      'SET is_read = :isRead, read_at = :readAt',
      {
        ':isRead': 'true',
        ':readAt': new Date().toISOString()
      }
    );

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Notification marked as read'
      })
    });

  } catch (error) {
    console.error('Mark read error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to mark notification as read',
        message: error.message 
      })
    });
  }
};

/**
 * Mark all notifications as read
 * PUT /notifications/mark-all-read
 * Body: { userId }
 */
exports.markAllRead = async (event) => {
  try {
    console.log('markAllRead called with method:', event.httpMethod);
    
    if (event.httpMethod === 'OPTIONS') {
      return handleOptionsRequest();
    }

    const requestBody = parseRequestBody(event.body);
    const { userId } = requestBody;
    
    if (!userId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'User ID is required' })
      });
    }

    // Get all unread notifications for user
    const result = await dbOperations.query(
      tables.notifications,
      'recipient_id = :recipientId AND is_read = :isRead',
      { 
        ':recipientId': userId,
        ':isRead': 'false'
      },
      'RecipientIdReadIndex'
    );

    const notifications = result.Items || [];

    // Update each notification
    const updatePromises = notifications.map(notif =>
      dbOperations.update(
        tables.notifications,
        { id: notif.id },
        'SET is_read = :isRead, read_at = :readAt',
        {
          ':isRead': 'true',
          ':readAt': new Date().toISOString()
        }
      )
    );

    await Promise.all(updatePromises);

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `Marked ${notifications.length} notifications as read`
      })
    });

  } catch (error) {
    console.error('Mark all read error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to mark all notifications as read',
        message: error.message 
      })
    });
  }
};

/**
 * Delete a notification
 * DELETE /notifications/{notificationId}
 */
exports.deleteNotification = async (event) => {
  try {
    console.log('deleteNotification called with method:', event.httpMethod);
    
    if (event.httpMethod === 'OPTIONS') {
      return handleOptionsRequest();
    }

    const { notificationId } = event.pathParameters || {};
    
    if (!notificationId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Notification ID is required' })
      });
    }

    // Delete notification
    await dbOperations.delete(tables.notifications, { id: notificationId });

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Notification deleted'
      })
    });

  } catch (error) {
    console.error('Delete notification error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to delete notification',
        message: error.message 
      })
    });
  }
};

/**
 * Clear all notifications for a user
 * DELETE /notifications/clear-all?userId={userId}
 */
exports.clearAll = async (event) => {
  try {
    console.log('clearAll called with method:', event.httpMethod);
    
    if (event.httpMethod === 'OPTIONS') {
      return handleOptionsRequest();
    }

    const { userId } = event.queryStringParameters || {};
    
    if (!userId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'User ID is required' })
      });
    }

    // Get all notifications for user
    const result = await dbOperations.query(
      tables.notifications,
      'recipient_id = :recipientId',
      { ':recipientId': userId },
      'RecipientIdIndex'
    );

    const notifications = result.Items || [];

    // Delete each notification
    const deletePromises = notifications.map(notif =>
      dbOperations.delete(tables.notifications, { id: notif.id })
    );

    await Promise.all(deletePromises);

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `Deleted ${notifications.length} notifications`
      })
    });

  } catch (error) {
    console.error('Clear all notifications error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to clear all notifications',
        message: error.message 
      })
    });
  }
};

// Export helper functions for use in other handlers
module.exports.createNotification = createNotification;
module.exports.NotificationTypes = NotificationTypes;

