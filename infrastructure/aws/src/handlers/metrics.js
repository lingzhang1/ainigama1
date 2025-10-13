const crypto = require('crypto');
const { addCorsHeaders, handleOptionsRequest } = require('../utils/cors');
const { tables, dbOperations, parseRequestBody } = require('../utils/db');
const { createNotification, NotificationTypes } = require('./notifications');

// ==================== HELPER FUNCTIONS ====================

/**
 * Get thread ID for any content type
 * Handles the different relationships: thread->question->answer->comment
 */
async function getThreadIdForContent(contentType, contentItem) {
  let threadId = contentItem.thread_id;
  
  // For answers, get thread_id from the question
  if (contentType === 'answer' && !threadId) {
    try {
      const questionId = contentItem.question_id;
      if (questionId) {
        const questionResult = await dbOperations.get(tables.questions, { id: questionId });
        threadId = questionResult.Item?.thread_id;
        console.log('📍 Got thread ID from question:', threadId);
      }
    } catch (err) {
      console.error('Failed to get question for answer:', err);
    }
  }
  
  // For comments, get thread_id from the answer's question
  if (contentType === 'comment' && !threadId) {
    try {
      const answerId = contentItem.answerId;
      if (answerId) {
        const answerResult = await dbOperations.get(tables.answers, { id: answerId });
        const questionId = answerResult.Item?.question_id;
        if (questionId) {
          const questionResult = await dbOperations.get(tables.questions, { id: questionId });
          threadId = questionResult.Item?.thread_id;
          console.log('📍 Got thread ID from answer->question:', threadId);
        }
      }
    } catch (err) {
      console.error('Failed to get question for comment:', err);
    }
  }
  
  return threadId;
}

// ==================== VIEWS ====================

// Track thread view
exports.trackView = async (event) => {
  try {
    console.log('trackView called with method:', event.httpMethod);
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    const { threadId } = event.pathParameters || {};
    
    if (!threadId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Thread ID is required' })
      });
    }

    const requestBody = parseRequestBody(event.body);
    const { userId, ipAddress, userAgent } = requestBody || {};

    // Verify thread exists
    const threadResult = await dbOperations.get(tables.threads, { id: threadId });

    if (!threadResult.Item) {
      return addCorsHeaders({
        statusCode: 404,
        body: JSON.stringify({ error: 'Thread not found' })
      });
    }

    // Increment view count on thread
    const now = new Date().toISOString();
    await dbOperations.update(
      tables.threads,
      { id: threadId },
      'SET view_count = if_not_exists(view_count, :zero) + :one',
      {
        ':zero': 0,
        ':one': 1
      }
    );

    // Optionally track individual view for analytics
    if (userId || ipAddress) {
      const viewId = crypto.randomUUID();
      const view = {
        id: viewId,
        thread_id: threadId,
        user_id: userId || null,
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
        created_at: now
      };

      try {
        await dbOperations.put(tables.threadViews, view);
      } catch (viewError) {
        console.error('Failed to save individual view:', viewError);
        // Don't fail the request if individual view tracking fails
      }
    }

    // Get updated view count
    const updatedThread = await dbOperations.get(tables.threads, { id: threadId });

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        viewCount: updatedThread.Item?.view_count || 0
      })
    });

  } catch (error) {
    console.error('Track view error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to track view',
        message: error.message 
      })
    });
  }
};

// ==================== LIKES ====================

// Toggle like on content
exports.toggleLike = async (event) => {
  try {
    console.log('toggleLike called with method:', event.httpMethod);
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    const { contentType, contentId } = event.pathParameters || {};
    
    if (!contentType || !contentId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Content type and ID are required' })
      });
    }

    if (!['thread', 'question', 'answer', 'comment'].includes(contentType)) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid content type. Must be thread, question, answer, or comment' })
      });
    }

    const requestBody = parseRequestBody(event.body);
    const { userId, action } = requestBody;
    
    if (!userId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'User ID is required' })
      });
    }

    if (!action || !['like', 'unlike'].includes(action)) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Action must be "like" or "unlike"' })
      });
    }

    // Check if content exists
    let contentTable;
    switch (contentType) {
      case 'thread':
        contentTable = tables.threads;
        break;
      case 'question':
        contentTable = tables.questions;
        break;
      case 'answer':
        contentTable = tables.answers;
        break;
      case 'comment':
        contentTable = tables.comments;
        break;
    }

    const contentResult = await dbOperations.get(contentTable, { id: contentId });

    if (!contentResult.Item) {
      return addCorsHeaders({
        statusCode: 404,
        body: JSON.stringify({ error: `${contentType} not found` })
      });
    }

    const now = new Date().toISOString();
    let isLiked = false;
    let likeCount = 0;

    if (action === 'like') {
      // Check if already liked
      try {
        await dbOperations.get(tables.likes, { 
          user_id: userId, 
          content_type: contentType, 
          content_id: contentId 
        });
        // Already liked, so this is actually an unlike operation
        await dbOperations.delete(tables.likes, { 
          user_id: userId, 
          content_type: contentType, 
          content_id: contentId 
        });
        
        // Update like count in content table
        await dbOperations.update(
          contentTable,
          { id: contentId },
          'SET like_count = GREATEST(if_not_exists(like_count, :zero) - :one, :zero)',
          {
            ':zero': 0,
            ':one': 1
          }
        );
        
        isLiked = false;
      } catch (error) {
        // Not liked yet, create like
        const likeId = crypto.randomUUID();
        const like = {
          id: likeId,
          user_id: userId,
          content_type: contentType,
          content_id: contentId,
          created_at: now
        };

        await dbOperations.put(tables.likes, like);
        
        // Update like count in content table
        await dbOperations.update(
          contentTable,
          { id: contentId },
          'SET like_count = if_not_exists(like_count, :zero) + :one',
          {
            ':zero': 0,
            ':one': 1
          }
        );
        
        isLiked = true;

        // Create notification for content owner
        try {
          const contentCreatorId = contentResult.Item.user_id || contentResult.Item.creator_id;
          
          // Don't notify if user likes their own content
          if (contentCreatorId && contentCreatorId !== userId) {
            // Get actor (liker) info
            const actorResult = await dbOperations.get(tables.users, { id: userId });
            const actor = actorResult.Item || { name: 'Someone', avatar: '/img-5.svg' };

            // Determine notification type
            let notificationType;
            switch (contentType) {
              case 'thread':
                notificationType = NotificationTypes.THREAD_LIKED;
                break;
              case 'answer':
                notificationType = NotificationTypes.ANSWER_LIKED;
                break;
              case 'comment':
                notificationType = NotificationTypes.COMMENT_LIKED;
                break;
              default:
                notificationType = NotificationTypes.ANSWER_LIKED;
            }

            // Get thread info using helper function
            let threadId = await getThreadIdForContent(contentType, contentResult.Item);
            let threadTitle = '';
            
            if (threadId) {
              try {
                const threadResult = await dbOperations.get(tables.threads, { id: threadId });
                threadTitle = threadResult.Item?.title || '';
              } catch (err) {
                console.error('Failed to get thread info:', err);
              }
            }

            console.log('💙 Creating like notification with threadId:', threadId);

            // Create notification
            await createNotification(contentCreatorId, notificationType, {
              actorId: userId,
              actorName: actor.name,
              actorAvatar: actor.avatar,
              contentType: contentType,
              contentId: contentId,
              relatedContentId: null,
              threadId: threadId,
              contentPreview: (contentResult.Item.content || contentResult.Item.title || '').substring(0, 100),
              threadTitle: threadTitle
            });
          }
        } catch (notifError) {
          console.error('Failed to create like notification:', notifError);
          // Don't fail the request if notification fails
        }
      }
    } else {
      // Unlike - delete the like record
      try {
        await dbOperations.delete(tables.likes, { 
          user_id: userId, 
          content_type: contentType, 
          content_id: contentId 
        });
        
        // Update like count in content table
        await dbOperations.update(
          contentTable,
          { id: contentId },
          'SET like_count = GREATEST(if_not_exists(like_count, :zero) - :one, :zero)',
          {
            ':zero': 0,
            ':one': 1
          }
        );
        
        isLiked = false;
      } catch (error) {
        console.error('Failed to unlike:', error);
        isLiked = false;
      }
    }

    // Get updated like count
    const updatedContent = await dbOperations.get(contentTable, { id: contentId });
    likeCount = updatedContent.Item?.like_count || 0;

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        action: isLiked ? 'liked' : 'unliked',
        likeCount: likeCount,
        isLiked: isLiked
      })
    });

  } catch (error) {
    console.error('Toggle like error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to toggle like',
        message: error.message 
      })
    });
  }
};

// Get likes for specific content
exports.getLikes = async (event) => {
  try {
    console.log('getLikes called with method:', event.httpMethod);
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    const { contentType, contentId } = event.pathParameters || {};
    const { userId } = event.queryStringParameters || {};
    
    if (!contentType || !contentId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Content type and ID are required' })
      });
    }

    if (!['thread', 'question', 'answer', 'comment'].includes(contentType)) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid content type' })
      });
    }

    // Get like count from content table
    let contentTable;
    switch (contentType) {
      case 'thread':
        contentTable = tables.threads;
        break;
      case 'question':
        contentTable = tables.questions;
        break;
      case 'answer':
        contentTable = tables.answers;
        break;
      case 'comment':
        contentTable = tables.comments;
        break;
    }

    const contentResult = await dbOperations.get(contentTable, { id: contentId });

    if (!contentResult.Item) {
      return addCorsHeaders({
        statusCode: 404,
        body: JSON.stringify({ error: `${contentType} not found` })
      });
    }

    const likeCount = contentResult.Item.like_count || 0;
    let isLiked = false;

    // Check if current user has liked this content
    if (userId) {
      try {
        await dbOperations.get(tables.likes, { 
          user_id: userId, 
          content_type: contentType, 
          content_id: contentId 
        });
        isLiked = true;
      } catch (error) {
        isLiked = false;
      }
    }

    // Get recent likes (last 10)
    let recentLikes = [];
    try {
      const likesResult = await dbOperations.query(
        tables.likes,
        'content_type = :contentType AND content_id = :contentId',
        {
          ':contentType': contentType,
          ':contentId': contentId
        },
        'ContentTypeIndex',
        false,
        10
      );

      // Get user info for each like
      recentLikes = await Promise.all(
        (likesResult.Items || []).map(async (like) => {
          try {
            const userResult = await dbOperations.get(tables.users, { id: like.user_id });
            return {
              userId: like.user_id,
              userName: userResult.Item?.name || 'Unknown User',
              userAvatar: userResult.Item?.avatar || '/img-5.svg',
              timestamp: like.created_at
            };
          } catch (error) {
            return {
              userId: like.user_id,
              userName: 'Unknown User',
              userAvatar: '/img-5.svg',
              timestamp: like.created_at
            };
          }
        })
      );
    } catch (error) {
      console.error('Failed to get recent likes:', error);
    }

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        likeCount: likeCount,
        isLiked: isLiked,
        recentLikes: recentLikes
      })
    });

  } catch (error) {
    console.error('Get likes error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to get likes',
        message: error.message 
      })
    });
  }
};

// ==================== SAVES ====================

// Toggle save on content
exports.toggleSave = async (event) => {
  try {
    console.log('toggleSave called with method:', event.httpMethod);
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    const { contentType, contentId } = event.pathParameters || {};
    
    if (!contentType || !contentId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Content type and ID are required' })
      });
    }

    if (!['thread', 'question', 'answer', 'comment'].includes(contentType)) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid content type. Must be thread, question, answer, or comment' })
      });
    }

    const requestBody = parseRequestBody(event.body);
    const { userId, action } = requestBody;
    
    if (!userId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'User ID is required' })
      });
    }

    if (!action || !['save', 'unsave'].includes(action)) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Action must be "save" or "unsave"' })
      });
    }

    // Check if content exists
    let contentTable;
    switch (contentType) {
      case 'thread':
        contentTable = tables.threads;
        break;
      case 'question':
        contentTable = tables.questions;
        break;
      case 'answer':
        contentTable = tables.answers;
        break;
      case 'comment':
        contentTable = tables.comments;
        break;
    }

    const contentResult = await dbOperations.get(contentTable, { id: contentId });

    if (!contentResult.Item) {
      return addCorsHeaders({
        statusCode: 404,
        body: JSON.stringify({ error: `${contentType} not found` })
      });
    }

    const now = new Date().toISOString();
    let isSaved = false;
    let saveCount = 0;

    if (action === 'save') {
      // Check if already saved
      try {
        await dbOperations.get(tables.saves, { 
          user_id: userId, 
          content_type: contentType, 
          content_id: contentId 
        });
        // Already saved, so this is actually an unsave operation
        await dbOperations.delete(tables.saves, { 
          user_id: userId, 
          content_type: contentType, 
          content_id: contentId 
        });
        
        // Update save count in content table
        await dbOperations.update(
          contentTable,
          { id: contentId },
          'SET save_count = GREATEST(if_not_exists(save_count, :zero) - :one, :zero)',
          {
            ':zero': 0,
            ':one': 1
          }
        );
        
        isSaved = false;
      } catch (error) {
        // Not saved yet, create save
        const saveId = crypto.randomUUID();
        const save = {
          id: saveId,
          user_id: userId,
          content_type: contentType,
          content_id: contentId,
          created_at: now
        };

        await dbOperations.put(tables.saves, save);
        
        // Update save count in content table
        await dbOperations.update(
          contentTable,
          { id: contentId },
          'SET save_count = if_not_exists(save_count, :zero) + :one',
          {
            ':zero': 0,
            ':one': 1
          }
        );
        
        isSaved = true;

        // Create notification for content owner
        try {
          const contentCreatorId = contentResult.Item.user_id || contentResult.Item.creator_id;
          
          // Don't notify if user saves their own content
          if (contentCreatorId && contentCreatorId !== userId) {
            // Get actor (saver) info
            const actorResult = await dbOperations.get(tables.users, { id: userId });
            const actor = actorResult.Item || { name: 'Someone', avatar: '/img-5.svg' };

            // Determine notification type
            let notificationType;
            switch (contentType) {
              case 'thread':
                notificationType = NotificationTypes.THREAD_SAVED;
                break;
              case 'answer':
                notificationType = NotificationTypes.ANSWER_SAVED;
                break;
              default:
                notificationType = NotificationTypes.ANSWER_SAVED;
            }

            // Get thread info using helper function
            let threadId = await getThreadIdForContent(contentType, contentResult.Item);
            let threadTitle = '';
            
            if (threadId) {
              try {
                const threadResult = await dbOperations.get(tables.threads, { id: threadId });
                threadTitle = threadResult.Item?.title || '';
              } catch (err) {
                console.error('Failed to get thread info:', err);
              }
            }

            console.log('💾 Creating save notification with threadId:', threadId);

            // Create notification
            await createNotification(contentCreatorId, notificationType, {
              actorId: userId,
              actorName: actor.name,
              actorAvatar: actor.avatar,
              contentType: contentType,
              contentId: contentId,
              relatedContentId: null,
              threadId: threadId,
              contentPreview: (contentResult.Item.content || contentResult.Item.title || '').substring(0, 100),
              threadTitle: threadTitle
            });
          }
        } catch (notifError) {
          console.error('Failed to create save notification:', notifError);
          // Don't fail the request if notification fails
        }
      }
    } else {
      // Unsave - delete the save record
      try {
        await dbOperations.delete(tables.saves, { 
          user_id: userId, 
          content_type: contentType, 
          content_id: contentId 
        });
        
        // Update save count in content table
        await dbOperations.update(
          contentTable,
          { id: contentId },
          'SET save_count = GREATEST(if_not_exists(save_count, :zero) - :one, :zero)',
          {
            ':zero': 0,
            ':one': 1
          }
        );
        
        isSaved = false;
      } catch (error) {
        console.error('Failed to unsave:', error);
        isSaved = false;
      }
    }

    // Get updated save count
    const updatedContent = await dbOperations.get(contentTable, { id: contentId });
    saveCount = updatedContent.Item?.save_count || 0;

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        action: isSaved ? 'saved' : 'unsaved',
        saveCount: saveCount,
        isSaved: isSaved
      })
    });

  } catch (error) {
    console.error('Toggle save error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to toggle save',
        message: error.message 
      })
    });
  }
};

// Get user's saved content
exports.getUserSaves = async (event) => {
  try {
    console.log('getUserSaves called with method:', event.httpMethod);
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    const { userId } = event.pathParameters || {};
    
    if (!userId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'User ID is required' })
      });
    }

    // Get user's saves
    const savesResult = await dbOperations.query(
      tables.saves,
      'user_id = :userId',
      { ':userId': userId },
      'UserIdIndex',
      false,
      50
    );

    // Get content details for each save
    const saves = await Promise.all(
      (savesResult.Items || []).map(async (save) => {
        try {
          let contentTable;
          switch (save.content_type) {
            case 'thread':
              contentTable = tables.threads;
              break;
            case 'question':
              contentTable = tables.questions;
              break;
            case 'answer':
              contentTable = tables.answers;
              break;
            case 'comment':
              contentTable = tables.comments;
              break;
          }

          const contentResult = await dbOperations.get(contentTable, { id: save.content_id });
          
          if (contentResult.Item) {
            // For answers and questions, get the thread ID
            let threadId = contentResult.Item.thread_id;
            
            if (save.content_type === 'answer' && !threadId) {
              // Get thread ID from question
              try {
                const questionResult = await dbOperations.get(tables.questions, { id: contentResult.Item.question_id });
                threadId = questionResult.Item?.thread_id;
              } catch (err) {
                console.error('Failed to get thread ID for answer:', err);
              }
            }
            
            return {
              contentType: save.content_type,
              contentId: save.content_id,
              content: {
                title: contentResult.Item.title || contentResult.Item.content?.substring(0, 100) + '...',
                preview: contentResult.Item.content?.substring(0, 200) || contentResult.Item.title,
                creator: contentResult.Item.creator_id || contentResult.Item.user_id
              },
              threadId: threadId || save.content_id, // Include thread ID for navigation
              timestamp: save.created_at
            };
          }
        } catch (error) {
          console.error('Failed to get content for save:', error);
        }
        return null;
      })
    );

    // Filter out null results
    const validSaves = saves.filter(save => save !== null);

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        saves: validSaves
      })
    });

  } catch (error) {
    console.error('Get user saves error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to get user saves',
        message: error.message 
      })
    });
  }
};

// ==================== SHARES ====================

// Track share
exports.trackShare = async (event) => {
  try {
    console.log('trackShare called with method:', event.httpMethod);
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    const { contentType, contentId } = event.pathParameters || {};
    
    if (!contentType || !contentId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Content type and ID are required' })
      });
    }

    if (!['thread', 'question', 'answer', 'comment'].includes(contentType)) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid content type' })
      });
    }

    const requestBody = parseRequestBody(event.body);
    const { userId, shareMethod } = requestBody || {};

    // Check if content exists
    let contentTable;
    switch (contentType) {
      case 'thread':
        contentTable = tables.threads;
        break;
      case 'question':
        contentTable = tables.questions;
        break;
      case 'answer':
        contentTable = tables.answers;
        break;
      case 'comment':
        contentTable = tables.comments;
        break;
    }

    const contentResult = await dbOperations.get(contentTable, { id: contentId });

    if (!contentResult.Item) {
      return addCorsHeaders({
        statusCode: 404,
        body: JSON.stringify({ error: `${contentType} not found` })
      });
    }

    // Increment share count on content
    const now = new Date().toISOString();
    await dbOperations.update(
      contentTable,
      { id: contentId },
      'SET share_count = if_not_exists(share_count, :zero) + :one',
      {
        ':zero': 0,
        ':one': 1
      }
    );

    // Track individual share for analytics
    const shareId = crypto.randomUUID();
    const share = {
      id: shareId,
      user_id: userId || null,
      content_type: contentType,
      content_id: contentId,
      share_method: shareMethod || 'copy_link',
      created_at: now
    };

    try {
      await dbOperations.put(tables.shares, share);
    } catch (shareError) {
      console.error('Failed to save individual share:', shareError);
      // Don't fail the request if individual share tracking fails
    }

    // Create notification for content owner
    if (userId) {
      try {
        const contentCreatorId = contentResult.Item.user_id || contentResult.Item.creator_id;
        
        // Don't notify if user shares their own content
        if (contentCreatorId && contentCreatorId !== userId) {
          // Get actor (sharer) info
          const actorResult = await dbOperations.get(tables.users, { id: userId });
          const actor = actorResult.Item || { name: 'Someone', avatar: '/img-5.svg' };

          // Determine notification type
          let notificationType;
          switch (contentType) {
            case 'thread':
              notificationType = NotificationTypes.THREAD_SHARED;
              break;
            case 'answer':
              notificationType = NotificationTypes.ANSWER_SHARED;
              break;
            default:
              notificationType = NotificationTypes.ANSWER_SHARED;
          }

          // Get thread info using helper function
          let threadId = await getThreadIdForContent(contentType, contentResult.Item);
          let threadTitle = '';
          
          if (threadId) {
            try {
              const threadResult = await dbOperations.get(tables.threads, { id: threadId });
              threadTitle = threadResult.Item?.title || '';
            } catch (err) {
              console.error('Failed to get thread info:', err);
            }
          }

          console.log('📤 Creating share notification with threadId:', threadId);

          // Create notification
          await createNotification(contentCreatorId, notificationType, {
            actorId: userId,
            actorName: actor.name,
            actorAvatar: actor.avatar,
            contentType: contentType,
            contentId: contentId,
            relatedContentId: null,
            threadId: threadId,
            contentPreview: (contentResult.Item.content || contentResult.Item.title || '').substring(0, 100),
            threadTitle: threadTitle
          });
        }
      } catch (notifError) {
        console.error('Failed to create share notification:', notifError);
        // Don't fail the request if notification fails
      }
    }

    // Get updated share count
    const updatedContent = await dbOperations.get(contentTable, { id: contentId });

    // Generate proper deep link share URL based on content type
    const baseUrl = process.env.BASE_URL || 'https://your-app.com';
    let shareUrl;
    
    switch (contentType) {
      case 'comment':
        // For comments, we need the answer ID from the comment's answerId field
        const commentAnswerId = contentResult.Item.answerId;
        const commentThreadId = contentResult.Item.thread_id;
        shareUrl = `${baseUrl}/thread/${commentThreadId}/answer/${commentAnswerId}/comment/${contentId}?from=share`;
        break;
        
      case 'answer':
        // For answers, we need the thread ID from the question
        try {
          const answerQuestionId = contentResult.Item.question_id;
          const questionResult = await dbOperations.get(tables.questions, { id: answerQuestionId });
          const answerThreadId = questionResult.Item?.thread_id;
          shareUrl = `${baseUrl}/thread/${answerThreadId}/answer/${contentId}?from=share`;
        } catch (err) {
          console.error('Failed to get thread ID for answer:', err);
          shareUrl = `${baseUrl}/thread/${contentResult.Item.thread_id || contentId}`;
        }
        break;
        
      case 'question':
        // For questions, include the question ID in the URL
        const questionThreadId = contentResult.Item.thread_id;
        shareUrl = `${baseUrl}/thread/${questionThreadId}/question/${contentId}?from=share`;
        break;
        
      case 'thread':
      default:
        // For threads, simple thread URL
        shareUrl = `${baseUrl}/thread/${contentId}?from=share`;
        break;
    }

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        shareCount: updatedContent.Item?.share_count || 0,
        shareUrl: shareUrl
      })
    });

  } catch (error) {
    console.error('Track share error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to track share',
        message: error.message 
      })
    });
  }
};

// Get shares for specific content
exports.getShares = async (event) => {
  try {
    console.log('getShares called with method:', event.httpMethod);
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    const { contentType, contentId } = event.pathParameters || {};
    
    if (!contentType || !contentId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Content type and ID are required' })
      });
    }

    // Get share count from content table
    let contentTable;
    switch (contentType) {
      case 'thread':
        contentTable = tables.threads;
        break;
      case 'question':
        contentTable = tables.questions;
        break;
      case 'answer':
        contentTable = tables.answers;
        break;
      case 'comment':
        contentTable = tables.comments;
        break;
    }

    const contentResult = await dbOperations.get(contentTable, { id: contentId });

    if (!contentResult.Item) {
      return addCorsHeaders({
        statusCode: 404,
        body: JSON.stringify({ error: `${contentType} not found` })
      });
    }

    const shareCount = contentResult.Item.share_count || 0;

    // Get share method breakdown
    const sharesResult = await dbOperations.query(
      tables.shares,
      'content_type = :contentType AND content_id = :contentId',
      {
        ':contentType': contentType,
        ':contentId': contentId
      },
      'ContentTypeIndex'
    );

    const shareMethods = {};
    const recentShares = [];

    (sharesResult.Items || []).forEach(share => {
      // Count by method
      shareMethods[share.share_method] = (shareMethods[share.share_method] || 0) + 1;
      
      // Add to recent shares (limit to 10)
      if (recentShares.length < 10) {
        recentShares.push({
          userId: share.user_id,
          shareMethod: share.share_method,
          timestamp: share.created_at
        });
      }
    });

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        shareCount: shareCount,
        shareMethods: shareMethods,
        recentShares: recentShares
      })
    });

  } catch (error) {
    console.error('Get shares error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to get shares',
        message: error.message 
      })
    });
  }
};

// ==================== BATCH INTERACTIONS ====================

// Get all user interactions for a specific thread (likes + saves)
// This is a performance optimization to replace N individual API calls
exports.getUserInteractionsForThread = async (event) => {
  try {
    console.log('getUserInteractionsForThread called with method:', event.httpMethod);
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    const { userId } = event.pathParameters || {};
    const { threadId } = event.queryStringParameters || {};
    
    if (!userId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'User ID is required' })
      });
    }

    if (!threadId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Thread ID is required in query parameters' })
      });
    }

    console.log(`📦 Fetching batch interactions for user ${userId} in thread ${threadId}`);

    // Get all likes for this user (using UserIdIndex)
    const likesResult = await dbOperations.query(
      tables.likes,
      'user_id = :userId',
      { ':userId': userId },
      'UserIdIndex',
      false,
      100 // Reasonable limit per thread
    );

    // Get all saves for this user (using UserIdIndex)
    const savesResult = await dbOperations.query(
      tables.saves,
      'user_id = :userId',
      { ':userId': userId },
      'UserIdIndex',
      false,
      100
    );

    // We need to filter to only items that belong to this thread
    // For this, we'll need to check content IDs against thread content
    
    // Get thread's questions to identify relevant answers and comments
    const questionsResult = await dbOperations.query(
      tables.questions,
      'thread_id = :threadId',
      { ':threadId': threadId },
      'ThreadIdIndex'
    );
    
    const questionIds = new Set((questionsResult.Items || []).map(q => q.id));
    
    // Get all answer IDs for this thread
    const answerIds = new Set();
    for (const questionId of questionIds) {
      const answersResult = await dbOperations.query(
        tables.answers,
        'question_id = :questionId',
        { ':questionId': questionId },
        'QuestionIdIndexV2'
      );
      (answersResult.Items || []).forEach(a => answerIds.add(a.id));
    }

    // Get all comment IDs for answers in this thread
    const commentIds = new Set();
    for (const answerId of answerIds) {
      const commentsResult = await dbOperations.query(
        tables.comments,
        'answerId = :answerId',
        { ':answerId': answerId },
        'AnswerIdIndex'
      );
      (commentsResult.Items || []).forEach(c => commentIds.add(c.id));
    }

    // Filter likes to only those in this thread
    const threadLikes = (likesResult.Items || []).filter(like => {
      if (like.content_type === 'thread' && like.content_id === threadId) return true;
      if (like.content_type === 'question' && questionIds.has(like.content_id)) return true;
      if (like.content_type === 'answer' && answerIds.has(like.content_id)) return true;
      if (like.content_type === 'comment' && commentIds.has(like.content_id)) return true;
      return false;
    });

    // Filter saves to only those in this thread
    const threadSaves = (savesResult.Items || []).filter(save => {
      if (save.content_type === 'thread' && save.content_id === threadId) return true;
      if (save.content_type === 'question' && questionIds.has(save.content_id)) return true;
      if (save.content_type === 'answer' && answerIds.has(save.content_id)) return true;
      if (save.content_type === 'comment' && commentIds.has(save.content_id)) return true;
      return false;
    });

    // Organize by content type for easy frontend consumption
    const response = {
      likes: {
        thread: threadLikes.filter(l => l.content_type === 'thread').map(l => l.content_id),
        questions: threadLikes.filter(l => l.content_type === 'question').map(l => l.content_id),
        answers: threadLikes.filter(l => l.content_type === 'answer').map(l => l.content_id),
        comments: threadLikes.filter(l => l.content_type === 'comment').map(l => l.content_id)
      },
      saves: {
        thread: threadSaves.filter(s => s.content_type === 'thread').map(s => s.content_id),
        questions: threadSaves.filter(s => s.content_type === 'question').map(s => s.content_id),
        answers: threadSaves.filter(s => s.content_type === 'answer').map(s => s.content_id),
        comments: threadSaves.filter(s => s.content_type === 'comment').map(s => s.content_id)
      }
    };

    console.log(`✅ Batch interactions fetched: ${threadLikes.length} likes, ${threadSaves.length} saves`);

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify(response)
    });

  } catch (error) {
    console.error('Get user interactions for thread error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to get user interactions',
        message: error.message 
      })
    });
  }
};

// ==================== USER LIKES ====================

// Get all content liked by a user
exports.getUserLikes = async (event) => {
  try {
    console.log('getUserLikes called with method:', event.httpMethod);
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    const { userId } = event.pathParameters || {};
    
    if (!userId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'User ID is required' })
      });
    }

    // Get user's likes using UserIdIndex
    const likesResult = await dbOperations.query(
      tables.likes,
      'user_id = :userId',
      { ':userId': userId },
      'UserIdIndex',
      false,
      100 // Limit to 100 most recent likes
    );

    // Get content details for each like
    const likes = await Promise.all(
      (likesResult.Items || []).map(async (like) => {
        try {
          let contentTable;
          switch (like.content_type) {
            case 'thread':
              contentTable = tables.threads;
              break;
            case 'question':
              contentTable = tables.questions;
              break;
            case 'answer':
              contentTable = tables.answers;
              break;
            case 'comment':
              contentTable = tables.comments;
              break;
          }

          const contentResult = await dbOperations.get(contentTable, { id: like.content_id });
          
          if (contentResult.Item) {
            // For answers and questions, get the thread ID
            let threadId = contentResult.Item.thread_id;
            
            if (like.content_type === 'answer' && !threadId) {
              // Get thread ID from question
              const questionResult = await dbOperations.get(tables.questions, { id: contentResult.Item.question_id });
              threadId = questionResult.Item?.thread_id;
            }
            
            return {
              contentType: like.content_type,
              contentId: like.content_id,
              content: {
                title: contentResult.Item.title || contentResult.Item.content?.substring(0, 100) + '...',
                preview: contentResult.Item.content?.substring(0, 200) || contentResult.Item.title,
                creator: contentResult.Item.creator_id || contentResult.Item.user_id
              },
              threadId: threadId || like.content_id,
              timestamp: like.created_at
            };
          }
        } catch (error) {
          console.error('Failed to get content for like:', error);
        }
        return null;
      })
    );

    // Filter out null results
    const validLikes = likes.filter(like => like !== null);

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        likes: validLikes
      })
    });

  } catch (error) {
    console.error('Get user likes error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to get user likes',
        message: error.message 
      })
    });
  }
};

// ==================== USER REPLIES ====================

// Get all answers and comments by a user
exports.getUserReplies = async (event) => {
  try {
    console.log('getUserReplies called with method:', event.httpMethod);
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    const { userId } = event.pathParameters || {};
    
    if (!userId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'User ID is required' })
      });
    }

    // Get user's answers
    const answersResult = await dbOperations.scan(
      tables.answers,
      'user_id = :userId',
      { ':userId': userId },
      100
    );

    // Get user's comments
    const commentsResult = await dbOperations.scan(
      tables.comments,
      'userId = :userId',
      { ':userId': userId },
      100
    );

    // Transform answers to reply format
    const answerReplies = await Promise.all(
      (answersResult.Items || []).map(async (answer) => {
        try {
          // Get question to find thread
          const questionResult = await dbOperations.get(tables.questions, { id: answer.question_id });
          const threadId = questionResult.Item?.thread_id;
          
          // Get thread details if available
          let threadTitle = '';
          if (threadId) {
            const threadResult = await dbOperations.get(tables.threads, { id: threadId });
            threadTitle = threadResult.Item?.title || '';
          }
          
          return {
            contentType: 'answer',
            contentId: answer.id,
            content: {
              title: threadTitle || 'Answer',
              preview: answer.content?.substring(0, 200) || '',
              creator: answer.user_id
            },
            threadId: threadId,
            timestamp: answer.created_at
          };
        } catch (error) {
          console.error('Failed to get thread for answer:', error);
          return null;
        }
      })
    );

    // Transform comments to reply format
    const commentReplies = await Promise.all(
      (commentsResult.Items || []).map(async (comment) => {
        try {
          // Get answer to find question, then thread
          const answerResult = await dbOperations.get(tables.answers, { id: comment.answerId });
          const questionId = answerResult.Item?.question_id;
          
          let threadId = null;
          let threadTitle = '';
          
          if (questionId) {
            const questionResult = await dbOperations.get(tables.questions, { id: questionId });
            threadId = questionResult.Item?.thread_id;
            
            if (threadId) {
              const threadResult = await dbOperations.get(tables.threads, { id: threadId });
              threadTitle = threadResult.Item?.title || '';
            }
          }
          
          return {
            contentType: 'comment',
            contentId: comment.id,
            content: {
              title: threadTitle || 'Comment',
              preview: comment.content?.substring(0, 200) || '',
              creator: comment.userId
            },
            threadId: threadId,
            timestamp: comment.timestamp
          };
        } catch (error) {
          console.error('Failed to get thread for comment:', error);
          return null;
        }
      })
    );

    // Combine and filter out null results
    const allReplies = [...answerReplies, ...commentReplies].filter(reply => reply !== null);
    
    // Sort by timestamp (most recent first)
    allReplies.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        replies: allReplies
      })
    });

  } catch (error) {
    console.error('Get user replies error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to get user replies',
        message: error.message 
      })
    });
  }
};
