const AWS = require('aws-sdk');
const crypto = require('crypto');
const dynamodb = new AWS.DynamoDB.DocumentClient();

const threadsTable = process.env.DYNAMODB_TABLE_THREADS;
const conversationsTable = process.env.DYNAMODB_TABLE_CONVERSATIONS;
const messagesTable = process.env.DYNAMODB_TABLE_MESSAGES;
const questionsTable = process.env.DYNAMODB_TABLE_QUESTIONS || 'ainigama-dev-questions';
const answersTable = process.env.DYNAMODB_TABLE_ANSWERS;
const commentsTable = process.env.DYNAMODB_TABLE_COMMENTS;

// Simple CORS headers - let API Gateway handle CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Max-Age': '86400'
};

exports.getThreads = async (event) => {
  try {
    const { filter = 'recent' } = event.queryStringParameters || {};
    
    // Use GSI for efficient public thread queries
    const params = {
      TableName: threadsTable,
      IndexName: 'PublicThreadsIndex',
      KeyConditionExpression: 'is_public = :isPublic',
      ExpressionAttributeValues: {
        ':isPublic': 'true'
      },
      ScanIndexForward: filter === 'recent' ? false : false, // Both use descending order
      Limit: 20
    };

    let result;
    try {
      result = await dynamodb.query(params).promise();
    } catch (gsiError) {
      console.log('GSI query failed, falling back to scan:', gsiError.message);
      // Fallback to scan if GSI query fails
      result = await dynamodb.scan({
        TableName: threadsTable,
        FilterExpression: 'is_public = :isPublic',
        ExpressionAttributeValues: {
          ':isPublic': true
        },
        Limit: 50
      }).promise();
    }
    
    let sortedItems = result.Items || [];
    
    // If we used scan (fallback), sort in memory
    if (!params.IndexName || result.Items.length > 20) {
      if (filter === 'trending') {
        sortedItems = sortedItems.sort((a, b) => 
          new Date(b.updated_at || b.updatedAt || 0).getTime() - 
          new Date(a.updated_at || a.updatedAt || 0).getTime()
        );
      } else {
        sortedItems = sortedItems.sort((a, b) => 
          new Date(b.created_at || b.createdAt || 0).getTime() - 
          new Date(a.created_at || a.createdAt || 0).getTime()
        );
      }
      // Take only first 20 after sorting
      sortedItems = sortedItems.slice(0, 20);
    }
    
    // Transform threads to include proper structure
    const transformedThreads = sortedItems.map(thread => ({
      id: thread.id,
      title: thread.title,
      creator: {
        id: thread.creator_id || thread.creatorId,
        name: thread.creator_name || 'Unknown User',
        avatar: thread.creator_avatar || '/img-5.svg',
        handle: thread.creator_handle || '@user'
      },
      isPublic: Boolean(thread.is_public),
      createdAt: thread.created_at || thread.createdAt,
      updatedAt: thread.updated_at || thread.updatedAt,
      questionCount: thread.question_count || 0,
      answerCount: thread.answer_count || 0,
      interactionCount: (thread.question_count || 0) + (thread.answer_count || 0),
      questions: [],
      category: thread.category
    }));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        threads: transformedThreads,
        count: transformedThreads.length
      })
    };

  } catch (error) {
    console.error('Get threads error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to fetch threads',
        message: error.message 
      })
    };
  }
};

// Create new thread (Make Public functionality)
exports.createThread = async (event) => {
  try {
    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }
    
    const { title, creatorId, category, questions, initialAnswers } = requestBody;
    
    if (!title || !creatorId || !questions || questions.length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing required fields: title, creatorId, questions' })
      };
    }
    
    const threadId = crypto.randomUUID();
    const now = new Date().toISOString();
    
    console.log('Creating thread:', threadId, 'with', questions.length, 'questions');
    
    // Create thread
    const thread = {
      id: threadId,
      title,
      creator_id: creatorId,
      category: category || 'General',
      is_public: 'true', // String for GSI compatibility
      created_at: now,
      updated_at: now,
      question_count: questions.length,
      answer_count: initialAnswers?.length || 0
    };

    await dynamodb.put({
      TableName: threadsTable,
      Item: thread
    }).promise();

    console.log('✅ Created thread:', threadId);
    
    // Create questions
    for (const question of questions) {
      const questionId = question.id || crypto.randomUUID();
      
      const questionItem = {
        id: questionId,
        thread_id: threadId,
        content: question.content,
        user_id: question.userId || creatorId,
        created_at: question.timestamp || now
      };

      await dynamodb.put({
        TableName: questionsTable,
        Item: questionItem
      }).promise();

      console.log('✅ Created question:', questionId);
      
      // Create corresponding AI answer if exists
      const correspondingAnswer = initialAnswers?.find(a => a.questionId === question.id);
      if (correspondingAnswer) {
        const answerId = correspondingAnswer.id || crypto.randomUUID();
        
        const answerItem = {
          id: answerId,
          question_id: questionId,
          content: correspondingAnswer.content,
          user_id: null, // AI answers don't have user_id
          is_ai: true,
          is_pinned: true,
          interaction_count: 0,
          created_at: correspondingAnswer.timestamp || now
        };

        await dynamodb.put({
          TableName: answersTable,
          Item: answerItem
        }).promise();

        console.log('✅ Created AI answer:', answerId);
      }
    }
    
    // Return the created thread
    const newThread = {
      id: threadId,
      title,
      creator: {
        id: creatorId,
        name: 'User',
        avatar: '/img-5.svg',
        handle: '@user'
      },
      isPublic: true,
      createdAt: now,
      updatedAt: now,
      questionCount: questions.length,
      answerCount: initialAnswers?.length || 0,
      interactionCount: questions.length + (initialAnswers?.length || 0),
      questions: questions.map(q => ({
        id: q.id || crypto.randomUUID(),
        content: q.content,
        timestamp: q.timestamp || now,
        userId: q.userId || creatorId,
        threadId
      })),
      category: category || 'General'
    };
    
    console.log('🎉 Successfully created public thread:', threadId);
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(newThread)
    };

  } catch (error) {
    console.error('Create thread error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to create thread',
        message: error.message 
      })
    };
  }
};

// Get individual thread by ID
exports.getThread = async (event) => {
  try {
    const { threadId } = event.pathParameters || {};
    
    if (!threadId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Thread ID is required' })
      };
    }

    // Get thread with creator info
    const threadResult = await dynamodb.get({
      TableName: threadsTable,
      Key: { id: threadId }
    }).promise();

    if (!threadResult.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Thread not found' })
      };
    }

    const thread = threadResult.Item;

    // Get questions for this thread
    const questionsResult = await dynamodb.query({
      TableName: questionsTable,
      IndexName: 'ThreadIdIndex',
      KeyConditionExpression: 'thread_id = :threadId',
      ExpressionAttributeValues: {
        ':threadId': threadId
      },
      ScanIndexForward: false // Get newest first by default
    }).promise();

    const questions = (questionsResult.Items || []).map(q => ({
      id: q.id,
      content: q.content,
      timestamp: q.created_at || q.timestamp,
      userId: q.user_id,
      threadId: q.thread_id
    }));

    // Calculate answer count for the thread
    let totalAnswerCount = 0;
    for (const question of questions) {
      try {
        const answersResult = await dynamodb.query({
          TableName: answersTable,
          IndexName: 'QuestionIdIndexV2',
          KeyConditionExpression: 'question_id = :questionId',
          ExpressionAttributeValues: {
            ':questionId': question.id
          },
          Select: 'COUNT'
        }).promise();
        totalAnswerCount += answersResult.Count || 0;
      } catch (error) {
        console.error('Error counting answers for question:', question.id, error);
      }
    }
    // Transform thread data
    const transformedThread = {
      id: thread.id,
      title: thread.title,
      creator: {
        id: thread.creator_id,
        name: thread.creator_name || 'Unknown User',
        avatar: thread.creator_avatar || '/img-5.svg',
        handle: thread.creator_handle || '@user'
      },
      isPublic: Boolean(thread.is_public),
      createdAt: thread.created_at,
      updatedAt: thread.updated_at,
      questionCount: questions.length,
      answerCount: totalAnswerCount,
      interactionCount: questions.length + totalAnswerCount,
      questions,
      category: thread.category
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(transformedThread)
    };

  } catch (error) {
    console.error('Get thread error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to fetch thread',
        message: error.message 
      })
    };
  }
};

// Get answers for a specific thread
exports.getThreadAnswers = async (event) => {
  try {
    const { threadId } = event.pathParameters || {};
    
    if (!threadId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Thread ID is required' })
      };
    }

    // Get all questions for this thread first
    const questionsResult = await dynamodb.query({
      TableName: questionsTable,
      IndexName: 'ThreadIdIndex',
      KeyConditionExpression: 'thread_id = :threadId',
      ExpressionAttributeValues: {
        ':threadId': threadId
      }
    }).promise();

    const questionIds = (questionsResult.Items || []).map(q => q.id);

    if (questionIds.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({})
      };
    }

    // Get answers for all questions
    const answersByQuestion = {};
    
    for (const questionId of questionIds) {
      // Use GSI query with new index name
      const answersResult = await dynamodb.query({
        TableName: answersTable,
        IndexName: 'QuestionIdIndexV2',
        KeyConditionExpression: 'question_id = :questionId',
        ExpressionAttributeValues: {
          ':questionId': questionId
        },
        ScanIndexForward: false // Get newest first, then we'll sort by pinned
      }).promise();

      // Sort answers: pinned first, then by creation time (newest first)
      const sortedAnswers = (answersResult.Items || []).sort((a, b) => {
        // Pinned answers first
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        
        // Then by creation time (newest first)
        const timeA = new Date(a.created_at || 0).getTime();
        const timeB = new Date(b.created_at || 0).getTime();
        return timeB - timeA;
      });

      const answers = sortedAnswers.map(answer => ({
        id: answer.id,
        content: answer.content,
        timestamp: answer.created_at || answer.timestamp,
        userId: answer.user_id,
        questionId: answer.question_id,
        isPinned: Boolean(answer.is_pinned),
        isAI: Boolean(answer.is_ai),
        thinking: answer.thinking || null,
        interactionCount: answer.interaction_count || 0
      }));

      if (answers.length > 0) {
        answersByQuestion[questionId] = answers;
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(answersByQuestion)
    };

  } catch (error) {
    console.error('Get thread answers error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to fetch thread answers',
        message: error.message 
      })
    };
  }
};

exports.getUserConversations = async (event) => {
  try {
    const { userId } = event.pathParameters || {};
    
    if (!userId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User ID is required' })
      };
    }

    const params = {
      TableName: conversationsTable,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      },
      ScanIndexForward: false,
      Limit: 50
    };

    const result = await dynamodb.query(params).promise();

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        conversations: result.Items || [],
        count: result.Count || 0
      })
    };

  } catch (error) {
    console.error('Get conversations error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to fetch conversations',
        message: error.message 
      })
    };
  }
};

// Get messages for a specific conversation
exports.getMessages = async (event) => {
  try {
    const { conversationId } = event.pathParameters || {};
    
    if (!conversationId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Conversation ID is required' })
      };
    }

    const params = {
      TableName: messagesTable,
      IndexName: 'ConversationIdIndex',
      KeyConditionExpression: 'conversationId = :conversationId',
      ExpressionAttributeValues: {
        ':conversationId': conversationId
      },
      ScanIndexForward: true,
      // Add explicit sorting to ensure proper message order
      ProjectionExpression: 'id, conversationId, content, sender, userId, thinking, #ts',
      ExpressionAttributeNames: {
        '#ts': 'timestamp'
      }
    };

    const result = await dynamodb.query(params).promise();

    // Sort messages by timestamp and then by ID to ensure proper ordering
    const sortedItems = result.Items.sort((a, b) => {
      const timeA = new Date(a.timestamp || a.createdAt || 0).getTime();
      const timeB = new Date(b.timestamp || b.createdAt || 0).getTime();
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      // Use ID as tiebreaker for messages with same timestamp
      return a.id.localeCompare(b.id);
    });

    // Transform messages to include thinking process
    const messages = sortedItems.map(msg => ({
      id: msg.id,
      content: msg.content,
      timestamp: msg.timestamp || msg.createdAt,
      sender: msg.sender,
      userId: msg.userId,
      thinking: msg.thinking || undefined // Include thinking process
    }));

    console.log(`📥 Loaded ${messages.length} messages for conversation ${conversationId}`);
    console.log(`🧠 Messages with thinking: ${messages.filter(m => m.thinking).length}`);
    console.log(`📋 Message order: ${messages.map(m => `${m.sender}(${m.id.slice(-4)})`).join(' -> ')}`);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(messages)
    };

  } catch (error) {
    console.error('Get conversation messages error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to fetch messages',
        message: error.message 
      })
    };
  }
};

// Create new conversation
exports.createNewConversation = async (event) => {
  try {
    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }
    
    const { userId, title } = requestBody;
    
    if (!userId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User ID is required' })
      };
    }

    const conversationId = crypto.randomUUID();
    const now = new Date().toISOString();

    const conversation = {
      id: conversationId,
      userId,
      title: title || null,
      createdAt: now,
      updatedAt: now,
      messages: []
    };

    await dynamodb.put({
      TableName: conversationsTable,
      Item: conversation
    }).promise();

    console.log('✅ Created new conversation:', conversationId);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(conversation)
    };

  } catch (error) {
    console.error('Create conversation error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to create conversation',
        message: error.message 
      })
    };
  }
};

// Save messages to conversation
exports.saveMessages = async (event) => {
  try {
    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }
    
    const { conversationId, messages } = requestBody;
    
    if (!conversationId || !messages || !Array.isArray(messages)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Conversation ID and messages array are required' })
      };
    }

    console.log('💾 Saving', messages.length, 'messages to conversation:', conversationId);

    // Verify conversation exists
    const conversation = await dynamodb.get({
      TableName: conversationsTable,
      Key: { id: conversationId }
    }).promise();

    if (!conversation.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Conversation not found' })
      };
    }

    // Save messages sequentially
    let savedCount = 0;
    for (const message of messages) {
      try {
        const messageItem = {
          id: message.id,
          conversationId: conversationId,
          content: message.content,
          sender: message.sender,
          userId: message.sender === 'user' ? conversation.Item.userId : null,
          thinking: message.thinking || null,
          timestamp: message.timestamp || new Date().toISOString(),
          createdAt: message.timestamp || new Date().toISOString()
        };

        // Use PUT with condition to prevent duplicates while maintaining order
        await dynamodb.put({
          TableName: messagesTable,
          Item: messageItem,
          ConditionExpression: 'attribute_not_exists(id) OR #ts < :newTimestamp',
          ExpressionAttributeNames: {
            '#ts': 'timestamp'
          },
          ExpressionAttributeValues: {
            ':newTimestamp': messageItem.timestamp
          }
        }).promise();

        console.log(`✅ Saved message ${message.id} (${message.sender}) to conversation ${conversationId} at ${messageItem.timestamp}`);
        savedCount++;

      } catch (messageError) {
        // If it's a conditional check failure, the message already exists - skip it
        if (messageError.code === 'ConditionalCheckFailedException') {
          console.log(`⚠️ Message ${message.id} already exists, skipping`);
          savedCount++;
        } else {
          console.error(`❌ Failed to save message ${message.id}:`, messageError);
          return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ 
              error: `Failed to save message: ${messageError.message}`,
              savedCount 
            })
          };
        }
      }
    }

    // Update conversation timestamp
    await dynamodb.update({
      TableName: conversationsTable,
      Key: { id: conversationId },
      UpdateExpression: 'SET updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':updatedAt': new Date().toISOString()
      }
    }).promise();

    console.log(`✅ Successfully saved ${savedCount} messages to conversation ${conversationId}`);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ 
        success: true, 
        savedCount,
        conversationId 
      })
    };

  } catch (error) {
    console.error('Save messages error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to save messages',
        message: error.message 
      })
    };
  }
};

// Update conversation title
exports.updateConversationTitle = async (event) => {
  try {
    const { conversationId } = event.pathParameters || {};
    
    if (!conversationId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Conversation ID is required' })
      };
    }

    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }
    
    const { title } = requestBody;
    
    if (!title) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Title is required' })
      };
    }

    // Update conversation title
    await dynamodb.update({
      TableName: conversationsTable,
      Key: { id: conversationId },
      UpdateExpression: 'SET title = :title, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':title': title,
        ':updatedAt': new Date().toISOString()
      },
      ConditionExpression: 'attribute_exists(id)'
    }).promise();

    console.log('✅ Updated conversation title:', conversationId, title);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, title })
    };

  } catch (error) {
    console.error('Update conversation title error:', error);
    
    if (error.code === 'ConditionalCheckFailedException') {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Conversation not found' })
      };
    }
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to update conversation title',
        message: error.message 
      })
    };
  }
};

// Delete conversation
exports.deleteConversation = async (event) => {
  try {
    console.log('🗑️ AWS: Delete conversation handler called');
    console.log('📋 Event details:', {
      httpMethod: event.httpMethod,
      pathParameters: event.pathParameters,
      path: event.path,
      resource: event.resource,
      headers: Object.keys(event.headers || {})
    });
    
    const { conversationId } = event.pathParameters || {};
    
    console.log('🔍 Extracted conversationId:', conversationId);
    
    if (!conversationId) {
      console.log('❌ No conversationId provided');
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Conversation ID is required' })
      };
    }

    console.log('🗑️ Deleting conversation:', conversationId);

    // First, delete all messages in the conversation
    const messagesResult = await dynamodb.query({
      TableName: messagesTable,
      IndexName: 'ConversationIdIndex',
      KeyConditionExpression: 'conversationId = :conversationId',
      ExpressionAttributeValues: {
        ':conversationId': conversationId
      },
      ProjectionExpression: 'id'
    }).promise();

    // Delete messages in batches
    const messages = messagesResult.Items || [];
    if (messages.length > 0) {
      const deleteRequests = messages.map(message => ({
        DeleteRequest: {
          Key: { id: message.id }
        }
      }));

      // Process in batches of 25 (DynamoDB limit)
      for (let i = 0; i < deleteRequests.length; i += 25) {
        const batch = deleteRequests.slice(i, i + 25);
        await dynamodb.batchWrite({
          RequestItems: {
            [messagesTable]: batch
          }
        }).promise();
      }

      console.log('✅ Deleted', messages.length, 'messages for conversation:', conversationId);
    }

    // Then delete the conversation itself
    await dynamodb.delete({
      TableName: conversationsTable,
      Key: { id: conversationId },
      ConditionExpression: 'attribute_exists(id)'
    }).promise();

    console.log('✅ Successfully deleted conversation:', conversationId);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ 
        success: true, 
        message: 'Conversation deleted successfully',
        conversationId: conversationId
      })
    };

  } catch (error) {
    console.error('Delete conversation error:', error);
    console.error('Error stack:', error.stack);
    
    if (error.code === 'ConditionalCheckFailedException') {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Conversation not found' })
      };
    }
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to delete conversation',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};

// Add question to thread
exports.addQuestion = async (event) => {
  try {
    const { threadId } = event.pathParameters || {};
    
    if (!threadId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Thread ID is required' })
      };
    }

    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }
    
    const { content, userId } = requestBody;
    
    if (!content || !content.trim()) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Question content is required' })
      };
    }

    if (!userId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User ID is required' })
      };
    }

    // Verify thread exists
    const threadResult = await dynamodb.get({
      TableName: threadsTable,
      Key: { id: threadId }
    }).promise();

    if (!threadResult.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Thread not found' })
      };
    }

    // Create new question
    const questionId = crypto.randomUUID();
    const now = new Date().toISOString();

    const question = {
      id: questionId,
      thread_id: threadId,
      threadId: threadId, // Dual compatibility
      content: content.trim(),
      user_id: userId,
      userId: userId, // Dual compatibility
      created_at: now,
      timestamp: now // Dual compatibility
    };

    await dynamodb.put({
      TableName: questionsTable,
      Item: question
    }).promise();

    console.log('✅ Created question:', questionId, 'for thread:', threadId);

    // Update thread timestamp and question count
    await dynamodb.update({
      TableName: threadsTable,
      Key: { id: threadId },
      UpdateExpression: 'SET updated_at = :updatedAt, question_count = if_not_exists(question_count, :zero) + :inc',
      ExpressionAttributeValues: {
        ':updatedAt': now,
        ':zero': 0,
        ':inc': 1
      }
    }).promise();

    // Return the created question in frontend format
    const responseQuestion = {
      id: questionId,
      content: content.trim(),
      timestamp: now,
      userId: userId,
      threadId: threadId
    };

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify(responseQuestion)
    };

  } catch (error) {
    console.error('Add question error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to add question',
        message: error.message 
      })
    };
  }
};

// Add answer to a question (REST API for public users)
exports.addAnswer = async (event) => {
  try {
    const { questionId } = event.pathParameters || {};
    
    if (!questionId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Question ID is required' })
      };
    }

    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }
    
    const { content, userId, isAI = false, isPinned = false, thinking } = requestBody;
    
    if (!content || !content.trim()) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Answer content is required' })
      };
    }

    console.log('💾 AWS: Saving answer with AI data:', {
      questionId,
      isAI: Boolean(isAI),
      isPinned: Boolean(isPinned),
      hasThinking: !!thinking
    });
    // Verify question exists and get thread info
    const questionResult = await dynamodb.get({
      TableName: questionsTable,
      Key: { id: questionId }
    }).promise();

    if (!questionResult.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Question not found' })
      };
    }

    const question = questionResult.Item;
    const threadId = question.thread_id;

    // Create new answer
    const answerId = crypto.randomUUID();
    const now = new Date().toISOString();

    const answer = {
      id: answerId,
      question_id: questionId,
      questionId: questionId, // Dual compatibility
      content: content.trim(),
      user_id: userId || null,
      userId: userId || null, // Dual compatibility
      is_ai: Boolean(isAI),
      isAI: Boolean(isAI), // Dual compatibility
      is_pinned: Boolean(isPinned),
      isPinned: Boolean(isPinned), // Dual compatibility
      interaction_count: 0,
      interactionCount: 0, // Dual compatibility
      thinking: thinking || null,
      created_at: now,
      timestamp: now // Dual compatibility
    };

    await dynamodb.put({
      TableName: answersTable,
      Item: answer
    }).promise();

    console.log('✅ AWS: Answer saved successfully:', {
      answerId,
      isAI: Boolean(isAI),
      isPinned: Boolean(isPinned),
      thinkingLength: thinking ? thinking.length : 0
    });

    // Update thread timestamp to reflect activity
    await dynamodb.update({
      TableName: threadsTable,
      Key: { id: threadId },
      UpdateExpression: 'SET updated_at = :updatedAt, answer_count = if_not_exists(answer_count, :zero) + :inc',
      ExpressionAttributeValues: {
        ':updatedAt': now,
        ':zero': 0,
        ':inc': 1
      }
    }).promise();

    // Return the created answer in frontend format
    const responseAnswer = {
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

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        answer: responseAnswer,
        threadId: threadId
      })
    };

  } catch (error) {
    console.error('Add answer error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to add answer',
        message: error.message 
      })
    };
  }
};

// Get comments for a specific answer
exports.getAnswerComments = async (event) => {
  try {
    const { answerId } = event.pathParameters || {};
    
    if (!answerId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Answer ID is required' })
      };
    }

    const params = {
      TableName: commentsTable,
      IndexName: 'AnswerIdIndex',
      KeyConditionExpression: 'answerId = :answerId',
      ExpressionAttributeValues: {
        ':answerId': answerId
      },
      ScanIndexForward: true // Oldest first for comments (chronological order)
    };

    const result = await dynamodb.query(params).promise();

    // Group comments by parent/child relationship
    const allComments = result.Items || [];
    const topLevelComments = allComments.filter(c => !c.parentId);
    const replies = allComments.filter(c => c.parentId);

    // Sort comments by timestamp (oldest first)
    const sortByTimestamp = (a, b) => {
      const timeA = new Date(a.created_at || a.timestamp || 0).getTime();
      const timeB = new Date(b.created_at || b.timestamp || 0).getTime();
      return timeA - timeB;
    };

    // Attach replies to their parent comments
    const commentsWithReplies = topLevelComments
      .sort(sortByTimestamp)
      .map(comment => ({
      id: comment.id,
      content: comment.content,
      timestamp: comment.created_at || comment.timestamp,
      userId: comment.user_id || comment.userId,
      answerId: comment.answerId,
      parentId: comment.parentId,
      replies: replies
        .filter(reply => reply.parentId === comment.id)
        .sort(sortByTimestamp)
        .map(reply => ({
          id: reply.id,
          content: reply.content,
          timestamp: reply.created_at || reply.timestamp,
          userId: reply.user_id || reply.userId,
          answerId: reply.answerId,
          parentId: reply.parentId
        }))
      }));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(commentsWithReplies)
    };

  } catch (error) {
    console.error('Get answer comments error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to fetch comments',
        message: error.message 
      })
    };
  }
};

// Add comment to answer
exports.addAnswerComment = async (event) => {
  try {
    const { answerId } = event.pathParameters || {};
    
    if (!answerId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Answer ID is required' })
      };
    }

    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }
    
    const { content, userId, parentId } = requestBody;
    
    if (!content || !content.trim()) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Comment content is required' })
      };
    }

    if (!userId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User ID is required' })
      };
    }

    // Verify answer exists
    const answerResult = await dynamodb.get({
      TableName: answersTable,
      Key: { id: answerId }
    }).promise();

    if (!answerResult.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Answer not found' })
      };
    }

    // Create new comment
    const commentId = crypto.randomUUID();
    const now = new Date().toISOString();

    const comment = {
      id: commentId,
      answerId: answerId,
      content: content.trim(),
      user_id: userId,
      userId: userId, // Dual compatibility
      parent_id: parentId || null,
      parentId: parentId || null, // Dual compatibility
      created_at: now,
      timestamp: now // Dual compatibility
    };

    await dynamodb.put({
      TableName: commentsTable,
      Item: comment
    }).promise();

    // Update answer interaction count
    await dynamodb.update({
      TableName: answersTable,
      Key: { id: answerId },
      UpdateExpression: 'SET interaction_count = if_not_exists(interaction_count, :zero) + :inc',
      ExpressionAttributeValues: {
        ':zero': 0,
        ':inc': 1
      }
    }).promise();

    // Return the created comment in frontend format
    const responseComment = {
      id: commentId,
      content: content.trim(),
      timestamp: now,
      userId: userId,
      answerId: answerId,
      parentId: parentId || null,
      replies: []
    };

    console.log('✅ Created comment:', commentId, 'for answer:', answerId);

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify(responseComment)
    };

  } catch (error) {
    console.error('Add answer comment error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to add comment',
        message: error.message 
      })
    };
  }
};