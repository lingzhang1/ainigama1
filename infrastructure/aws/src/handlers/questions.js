const crypto = require('crypto');
const { addCorsHeaders, handleOptionsRequest } = require('../utils/cors');
const { tables, dbOperations, parseRequestBody } = require('../utils/db');
const { createNotification, NotificationTypes } = require('./notifications');

// Add question to thread
exports.addQuestion = async (event) => {
  try {
    console.log('addQuestion called with method:', event.httpMethod);
    
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
    const { content, userId, isSummary } = requestBody;
    
    if (!content || !content.trim()) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Question content is required' })
      });
    }

    if (!userId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'User ID is required' })
      });
    }

    // Verify thread exists
    const threadResult = await dbOperations.get(tables.threads, { id: threadId });

    if (!threadResult.Item) {
      return addCorsHeaders({
        statusCode: 404,
        body: JSON.stringify({ error: 'Thread not found' })
      });
    }

    const questionId = crypto.randomUUID();
    const now = new Date().toISOString();

    const question = {
      id: questionId,
      thread_id: threadId,
      content: content.trim(),
      user_id: userId,
      created_at: now,
      is_summary: Boolean(isSummary) // Store summary flag
    };

    await dbOperations.put(tables.questions, question);

    // Update thread question count and timestamp
    await dbOperations.update(
      tables.threads,
      { id: threadId },
      'SET updated_at = :updatedAt, question_count = if_not_exists(question_count, :zero) + :one',
      {
        ':updatedAt': now,
        ':zero': 0,
        ':one': 1
      }
    );

    const newQuestion = {
      id: questionId,
      content: content.trim(),
      timestamp: now,
      userId: userId,
      threadId: threadId,
      isSummary: Boolean(isSummary), // Return summary flag
      // New metrics (initialize to 0 for new questions)
      likeCount: 0,
      saveCount: 0,
      shareCount: 0
    };

    console.log('✅ Created question:', questionId, 'for thread:', threadId);

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify(newQuestion)
    });

  } catch (error) {
    console.error('Add question error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to add question',
        message: error.message 
      })
    });
  }
};

// Add answer to question
exports.addAnswer = async (event) => {
  try {
    console.log('addAnswer called with method:', event.httpMethod);
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    const { questionId } = event.pathParameters || {};
    
    if (!questionId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Question ID is required' })
      });
    }

    const requestBody = parseRequestBody(event.body);
    const { content, userId, isAI, isPinned, thinking } = requestBody;
    
    if (!content || !content.trim()) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Answer content is required' })
      });
    }

    // Verify question exists
    const questionResult = await dbOperations.get(tables.questions, { id: questionId });

    if (!questionResult.Item) {
      return addCorsHeaders({
        statusCode: 404,
        body: JSON.stringify({ error: 'Question not found' })
      });
    }

    const answerId = crypto.randomUUID();
    const now = new Date().toISOString();

    const answer = {
      id: answerId,
      question_id: questionId,
      content: content.trim(),
      user_id: userId || null,
      is_ai: Boolean(isAI),
      is_pinned: Boolean(isPinned),
      interaction_count: 0,
      thinking: thinking || null,
      created_at: now
    };

    await dbOperations.put(tables.answers, answer);

    // Update thread answer count
    const question = questionResult.Item;
    await dbOperations.update(
      tables.threads,
      { id: question.thread_id },
      'SET updated_at = :updatedAt, answer_count = if_not_exists(answer_count, :zero) + :one',
      {
        ':updatedAt': now,
        ':zero': 0,
        ':one': 1
      }
    );

    // Create notification for question owner
    try {
      const questionOwnerId = question.user_id;
      
      // Don't notify if user answers their own question or if it's an AI answer
      if (questionOwnerId && userId && questionOwnerId !== userId && !isAI) {
        // Get answerer info
        const answererResult = await dbOperations.get(tables.users, { id: userId });
        const answerer = answererResult.Item || { name: 'Someone', avatar: '/img-5.svg' };

        // Get thread info
        let threadTitle = '';
        if (question.thread_id) {
          try {
            const threadResult = await dbOperations.get(tables.threads, { id: question.thread_id });
            threadTitle = threadResult.Item?.title || '';
          } catch (err) {
            console.error('Failed to get thread info:', err);
          }
        }

        // Create notification
        await createNotification(questionOwnerId, NotificationTypes.NEW_ANSWER, {
          actorId: userId,
          actorName: answerer.name,
          actorAvatar: answerer.avatar,
          contentType: 'answer',
          contentId: answerId,
          relatedContentId: questionId,
          threadId: question.thread_id,
          contentPreview: content.trim().substring(0, 100),
          threadTitle: threadTitle
        });
      }
    } catch (notifError) {
      console.error('Failed to create new answer notification:', notifError);
      // Don't fail the request if notification fails
    }

    const newAnswer = {
      id: answerId,
      content: content.trim(),
      timestamp: now,
      userId: userId || null,
      questionId: questionId,
      isPinned: Boolean(isPinned),
      isAI: Boolean(isAI),
      thinking: thinking || null,
      interactionCount: 0,
      commentCount: 0,
      // New metrics (initialize to 0 for new answers)
      likeCount: 0,
      saveCount: 0,
      shareCount: 0
    };

    console.log('✅ Created answer:', answerId, 'for question:', questionId);

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        answer: newAnswer,
        threadId: question.thread_id
      })
    });

  } catch (error) {
    console.error('Add answer error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to add answer',
        message: error.message 
      })
    });
  }
};

// Get comments for a specific answer
exports.getAnswerComments = async (event) => {
  try {
    console.log('getAnswerComments called with method:', event.httpMethod);
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    const { answerId } = event.pathParameters || {};
    
    if (!answerId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Answer ID is required' })
      });
    }

    // Get all comments for this answer
    const commentsResult = await dbOperations.query(
      tables.comments,
      'answerId = :answerId',
      { ':answerId': answerId },
      'AnswerIdIndex',
      true // Get oldest first for chronological order
    );

    // Organize comments with replies
    const comments = [];
    const commentMap = new Map();

    // First pass: create all comments
    for (const item of commentsResult.Items || []) {
      const comment = {
        id: item.id,
        content: item.content,
        timestamp: item.created_at || item.timestamp,
        userId: item.user_id,
        parentId: item.parent_id || null,
        replies: [],
        // New metrics
        likeCount: item.like_count || 0,
        saveCount: item.save_count || 0,
        shareCount: item.share_count || 0
      };
      commentMap.set(comment.id, comment);
      
      if (!comment.parentId) {
        comments.push(comment);
      }
    }

    // Second pass: organize replies
    for (const comment of commentMap.values()) {
      if (comment.parentId && commentMap.has(comment.parentId)) {
        commentMap.get(comment.parentId).replies.push(comment);
      }
    }

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify(comments)
    });

  } catch (error) {
    console.error('Get answer comments error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to fetch comments',
        message: error.message 
      })
    });
  }
};

// Add comment to answer
exports.addAnswerComment = async (event) => {
  try {
    console.log('addAnswerComment called with method:', event.httpMethod);
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    const { answerId } = event.pathParameters || {};
    
    if (!answerId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Answer ID is required' })
      });
    }

    const requestBody = parseRequestBody(event.body);
    const { content, userId, parentId } = requestBody;
    
    if (!content || !content.trim()) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Comment content is required' })
      });
    }

    if (!userId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'User ID is required' })
      });
    }

    // Verify answer exists
    const answerResult = await dbOperations.get(tables.answers, { id: answerId });

    if (!answerResult.Item) {
      return addCorsHeaders({
        statusCode: 404,
        body: JSON.stringify({ error: 'Answer not found' })
      });
    }

    const commentId = crypto.randomUUID();
    const now = new Date().toISOString();

    const comment = {
      id: commentId,
      answerId: answerId,
      content: content.trim(),
      user_id: userId,
      parent_id: parentId || null,
      created_at: now
    };

    await dbOperations.put(tables.comments, comment);

    // Update answer interaction count and comment count
    await dbOperations.update(
      tables.answers,
      { id: answerId },
      'SET interaction_count = if_not_exists(interaction_count, :zero) + :one, comment_count = if_not_exists(comment_count, :zero) + :one',
      {
        ':zero': 0,
        ':one': 1
      }
    );

    // Create notification for answer owner
    try {
      const answer = answerResult.Item;
      const answerOwnerId = answer.user_id;
      
      // Don't notify if user comments on their own answer
      if (answerOwnerId && answerOwnerId !== userId) {
        // Get commenter info
        const commenterResult = await dbOperations.get(tables.users, { id: userId });
        const commenter = commenterResult.Item || { name: 'Someone', avatar: '/img-5.svg' };

        // Get question to find thread
        const questionResult = await dbOperations.get(tables.questions, { id: answer.question_id });
        const question = questionResult.Item;

        // Get thread info
        let threadTitle = '';
        if (question && question.thread_id) {
          try {
            const threadResult = await dbOperations.get(tables.threads, { id: question.thread_id });
            threadTitle = threadResult.Item?.title || '';
          } catch (err) {
            console.error('Failed to get thread info:', err);
          }
        }

        // Create notification
        await createNotification(answerOwnerId, NotificationTypes.ANSWER_COMMENTED, {
          actorId: userId,
          actorName: commenter.name,
          actorAvatar: commenter.avatar,
          contentType: 'comment',
          contentId: commentId,
          relatedContentId: answerId,
          threadId: question?.thread_id || null,
          contentPreview: content.trim().substring(0, 100),
          threadTitle: threadTitle
        });
      }
    } catch (notifError) {
      console.error('Failed to create comment notification:', notifError);
      // Don't fail the request if notification fails
    }

    const newComment = {
      id: commentId,
      content: content.trim(),
      timestamp: now,
      userId: userId,
      answerId: answerId,
      parentId: parentId || null,
      replies: [],
      // New metrics (initialize to 0 for new comments)
      likeCount: 0,
      saveCount: 0,
      shareCount: 0
    };

    console.log('✅ Created comment:', commentId, 'for answer:', answerId);

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify(newComment)
    });

  } catch (error) {
    console.error('Add answer comment error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to add comment',
        message: error.message 
      })
    });
  }
};