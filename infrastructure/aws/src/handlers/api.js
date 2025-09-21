const AWS = require('aws-sdk');
const crypto = require('crypto');
const dynamodb = new AWS.DynamoDB.DocumentClient();

const threadsTable = process.env.DYNAMODB_TABLE_THREADS;
const conversationsTable = process.env.DYNAMODB_TABLE_CONVERSATIONS;
const messagesTable = process.env.DYNAMODB_TABLE_MESSAGES;
const questionsTable = process.env.DYNAMODB_TABLE_QUESTIONS || 'ainigama-dev-questions';
const answersTable = process.env.DYNAMODB_TABLE_ANSWERS;

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
    
    let params = {
      TableName: threadsTable,
      FilterExpression: 'is_public = :isPublic',
      ExpressionAttributeValues: {
        ':isPublic': true
      },
      Limit: 20
    };

    // Add sorting based on filter
    if (filter === 'trending') {
      params.IndexName = 'UpdatedAtIndex';
      params.ScanIndexForward = false;
    }

    const result = await dynamodb.scan(params).promise();
    
    // Transform threads to include proper structure
    const transformedThreads = (result.Items || []).map(thread => ({
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
      is_public: true,
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
      ScanIndexForward: true
    }).promise();

    const questions = (questionsResult.Items || []).map(q => ({
      id: q.id,
      content: q.content,
      timestamp: q.created_at || q.timestamp,
      userId: q.user_id,
      threadId: q.thread_id
    }));

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
      answerCount: thread.answer_count || 0,
      interactionCount: questions.length + (thread.answer_count || 0),
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
      const answersResult = await dynamodb.query({
        TableName: answersTable,
        IndexName: 'QuestionIdIndexV2',
        KeyConditionExpression: 'question_id = :questionId',
        ExpressionAttributeValues: {
          ':questionId': questionId
        },
        ScanIndexForward: true
      }).promise();

      const answers = (answersResult.Items || []).map(answer => ({
        id: answer.id,
        content: answer.content,
        timestamp: answer.created_at || answer.timestamp,
        userId: answer.user_id,
        questionId: answer.question_id,
        isPinned: Boolean(answer.is_pinned),
        isAI: Boolean(answer.is_ai),
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