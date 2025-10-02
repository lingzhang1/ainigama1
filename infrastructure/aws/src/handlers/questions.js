const crypto = require('crypto');
const { addCorsHeaders, handleOptionsRequest } = require('../utils/cors');
const { tables, dbOperations, parseRequestBody } = require('../utils/db');

// Add question to thread
exports.addQuestion = async (event) => {
  try {
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
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
      isSummary: Boolean(isSummary) // Return summary flag
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
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
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

    const newAnswer = {
      id: answerId,
      content: content.trim(),
      timestamp: now,
      userId: userId || null,
      questionId: questionId,
      isPinned: Boolean(isPinned),
      isAI: Boolean(isAI),
      thinking: thinking || null,
      interactionCount: 0
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
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      return handleOptionsRequest();
    }

    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
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
      return addCorsHeaders({
        parentId: item.parent_id || null,
        body: JSON.stringify({ error: 'Answer ID is required' })
      });
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
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
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
    for (const item of result.Items || []) {
    // Update answer interaction count
    await dbOperations.update(
      tables.answers,
    const result = await dbOperations.query(
      'SET interaction_count = if_not_exists(interaction_count, :zero) + :one',
      {
        ':zero': 0,
        ':one': 1
      }
    );

    const newComment = {
      id: commentId,
      content: content.trim(),
      timestamp: now,
      userId: userId,
      answerId: answerId,
      parentId: parentId || null,
      replies: []
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