const AWS = require('aws-sdk');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const dynamodb = new AWS.DynamoDB.DocumentClient();

const threadsTable = process.env.DYNAMODB_TABLE_THREADS;
const conversationsTable = process.env.DYNAMODB_TABLE_CONVERSATIONS;
const messagesTable = process.env.DYNAMODB_TABLE_MESSAGES;
const questionsTable = process.env.DYNAMODB_TABLE_QUESTIONS || 'ainigama-dev-questions';
const answersTable = process.env.DYNAMODB_TABLE_ANSWERS;
const commentsTable = process.env.DYNAMODB_TABLE_COMMENTS;

// Comprehensive CORS headers for all origins
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'false'
};

// Helper function to add CORS headers to all responses
const addCorsHeaders = (response) => {
  return {
    ...response,
    headers: {
      ...corsHeaders,
      ...(response.headers || {}),
      'Content-Type': 'application/json'
    }
  };
};

// Check if user exists
exports.checkUserExists = async (event) => {
  try {
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      return addCorsHeaders({
        statusCode: 200,
        body: ''
      });
    }

    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      });
    }
    
    const { email } = requestBody;
    
    if (!email) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Email is required' })
      });
    }

    const result = await dynamodb.scan({
      TableName: process.env.DYNAMODB_TABLE_USERS,
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email.toLowerCase()
      }
    }).promise();

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({ exists: result.Items.length > 0 })
    });
  } catch (error) {
    console.error('Check user exists error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to check user existence',
        message: error.message 
      })
    });
  }
};

// User registration
exports.registerUser = async (event) => {
  try {
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      return addCorsHeaders({
        statusCode: 200,
        body: ''
      });
    }

    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      });
    }
    
    const { name, email, alias, password } = requestBody;
    
    if (!name || !email || !alias || !password) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'All fields are required' })
      });
    }
    
    if (password.length < 6) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Password must be at least 6 characters' })
      });
    }

    // Check if user already exists
    const existingUser = await dynamodb.scan({
      TableName: process.env.DYNAMODB_TABLE_USERS,
      FilterExpression: 'email = :email OR alias = :alias',
      ExpressionAttributeValues: {
        ':email': email.toLowerCase(),
        ':alias': alias.toLowerCase()
      }
    }).promise();
    
    if (existingUser.Items.length > 0) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'User with this email or username already exists' })
      });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create user
    const userId = crypto.randomUUID();
    const handle = `@${alias}`;
    const now = new Date().toISOString();
    
    const user = {
      id: userId,
      name,
      email: email.toLowerCase(),
      alias: alias.toLowerCase(),
      password_hash: passwordHash,
      avatar: '/img-5.svg',
      handle,
      created_at: now,
      updated_at: now
    };

    await dynamodb.put({
      TableName: process.env.DYNAMODB_TABLE_USERS,
      Item: user
    }).promise();
    
    // Return user data (without password hash)
    const userData = {
      id: userId,
      name,
      email: email.toLowerCase(),
      alias: alias.toLowerCase(),
      avatar: '/img-5.svg',
      handle
    };
    
    console.log('✅ User registered successfully:', email);
    
    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({ user: userData })
    });
  } catch (error) {
    console.error('Registration error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Registration failed',
        message: error.message 
      })
    });
  }
};

// User login
exports.loginUser = async (event) => {
  try {
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      return addCorsHeaders({
        statusCode: 200,
        body: ''
      });
    }

    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      });
    }
    
    const { email, password } = requestBody;
    
    if (!email || !password) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Email and password are required' })
      });
    }

    // Find user by email
    const result = await dynamodb.scan({
      TableName: process.env.DYNAMODB_TABLE_USERS,
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email.toLowerCase()
      }
    }).promise();
    
    if (result.Items.length === 0) {
      return addCorsHeaders({
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid email or password' })
      });
    }
    
    const user = result.Items[0];
    
    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      return addCorsHeaders({
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid email or password' })
      });
    }
    
    // Return user data (without password hash)
    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      alias: user.alias,
      avatar: user.avatar,
      handle: user.handle
    };
    
    console.log('✅ User logged in successfully:', email);
    
    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({ user: userData })
    });
  } catch (error) {
    console.error('Login error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Login failed',
        message: error.message 
      })
    });
  }
};

// Check alias availability
exports.checkAlias = async (event) => {
  try {
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      return addCorsHeaders({
        statusCode: 200,
        body: ''
      });
    }

    const { alias } = event.pathParameters || {};
    
    if (!alias || alias.length < 3) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Alias must be at least 3 characters' })
      });
    }
    
    if (!/^[a-z0-9_]+$/.test(alias)) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Alias can only contain lowercase letters, numbers, and underscores' })
      });
    }

    const result = await dynamodb.scan({
      TableName: process.env.DYNAMODB_TABLE_USERS,
      FilterExpression: 'alias = :alias',
      ExpressionAttributeValues: {
        ':alias': alias
      }
    }).promise();

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({ available: result.Items.length === 0 })
    });
  } catch (error) {
    console.error('Check alias error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to check alias availability',
        message: error.message 
      })
    });
  }
};

exports.getThreads = async (event) => {
  try {
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      return addCorsHeaders({
        statusCode: 200,
        body: ''
      });
    }

    const { filter = 'recent' } = event.queryStringParameters || {};
    
    console.log('Getting threads with filter:', filter);
    
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
      console.log('GSI query successful, found', result.Items?.length || 0, 'threads');
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
      console.log('Scan fallback successful, found', result.Items?.length || 0, 'threads');
    }
    
    let sortedItems = result.Items || [];
    console.log('Processing', sortedItems.length, 'threads');
    
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
    
    // Get user information for each thread creator
    const transformedThreads = await Promise.all(sortedItems.map(async (thread) => {
      let creatorInfo = {
        id: thread.creator_id || thread.creatorId,
        name: 'Unknown User',
        avatar: '/img-5.svg',
        handle: '@unknown'
      };

      // Try to get user info from users table
      if (thread.creator_id) {
        try {
          const userResult = await dynamodb.get({
            TableName: process.env.DYNAMODB_TABLE_USERS,
            Key: { id: thread.creator_id }
          }).promise();

          if (userResult.Item) {
            creatorInfo = {
              id: userResult.Item.id,
              name: userResult.Item.name || 'Unknown User',
              avatar: userResult.Item.avatar || '/img-5.svg',
              handle: userResult.Item.handle || '@unknown'
            };
          }
        } catch (userError) {
          console.error('Failed to get user info for thread creator:', userError);
        }
      }

      return {
        id: thread.id,
        title: thread.title,
        creator: creatorInfo,
        isPublic: Boolean(thread.is_public),
        createdAt: thread.created_at || thread.createdAt,
        updatedAt: thread.updated_at || thread.updatedAt,
        questionCount: thread.question_count || 0,
        answerCount: thread.answer_count || 0,
        interactionCount: (thread.question_count || 0) + (thread.answer_count || 0),
        questions: [],
        category: thread.category
      };
    }));

    console.log('Returning', transformedThreads.length, 'transformed threads');

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        threads: transformedThreads,
        count: transformedThreads.length
      })
    });

  } catch (error) {
    console.error('Get threads error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to fetch threads',
        message: error.message 
      })
    });
  }
};

// Create new thread (Make Public functionality)
exports.createThread = async (event) => {
  try {
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      return addCorsHeaders({
        statusCode: 200,
        body: ''
      });
    }

    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      });
    }
    
    const { title, creatorId, category, questions, initialAnswers } = requestBody;
    
    if (!title || !creatorId || !questions || questions.length === 0) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields: title, creatorId, questions' })
      });
    }
    
    const threadId = crypto.randomUUID();
    const now = new Date().toISOString();
    
    console.log('Creating thread:', threadId, 'with', questions.length, 'questions');
    
    // Get user information for the creator
    let creatorInfo = {
      id: creatorId,
      name: 'Unknown User',
      avatar: '/img-5.svg',
      handle: '@unknown'
    };

    try {
      const userResult = await dynamodb.get({
        TableName: process.env.DYNAMODB_TABLE_USERS,
        Key: { id: creatorId }
      }).promise();

      if (userResult.Item) {
        creatorInfo = {
          id: userResult.Item.id,
          name: userResult.Item.name || 'Unknown User',
          alias: userResult.Item.alias || 'unknown',
          avatar: userResult.Item.avatar || '/img-5.svg',
          handle: userResult.Item.handle || '@unknown'
        };
      }
    } catch (userError) {
      console.error('Failed to get user info for thread creator:', userError);
    }

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
          thinking: correspondingAnswer.thinking || null, // Include AI thinking process
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
      creator: creatorInfo,
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
    
    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify(newThread)
    });

  } catch (error) {
    console.error('Create thread error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to create thread',
        message: error.message 
      })
    });
  }
};

// Get individual thread by ID
exports.getThread = async (event) => {
  try {
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      return addCorsHeaders({
        statusCode: 200,
        body: ''
      });
    }

    const { threadId } = event.pathParameters || {};
    
    if (!threadId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Thread ID is required' })
      });
    }

    // Get thread with creator info
    const threadResult = await dynamodb.get({
      TableName: threadsTable,
      Key: { id: threadId }
    }).promise();

    if (!threadResult.Item) {
      return addCorsHeaders({
        statusCode: 404,
        body: JSON.stringify({ error: 'Thread not found' })
      });
    }

    const thread = threadResult.Item;

    // Get creator information
    let creatorInfo = {
      id: thread.creator_id,
      name: 'Unknown User',
      avatar: '/img-5.svg',
      handle: '@unknown'
    };

    if (thread.creator_id) {
      try {
        const userResult = await dynamodb.get({
          TableName: process.env.DYNAMODB_TABLE_USERS,
          Key: { id: thread.creator_id }
        }).promise();

        if (userResult.Item) {
          creatorInfo = {
            id: userResult.Item.id,
            name: userResult.Item.name || 'Unknown User',
            avatar: userResult.Item.avatar || '/img-5.svg',
            handle: userResult.Item.handle || '@unknown'
          };
        }
      } catch (userError) {
        console.error('Failed to get user info for thread creator:', userError);
      }
    }
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
      creator: creatorInfo,
      isPublic: Boolean(thread.is_public),
      createdAt: thread.created_at,
      updatedAt: thread.updated_at,
      questionCount: questions.length,
      answerCount: totalAnswerCount,
      interactionCount: questions.length + totalAnswerCount,
      questions,
      category: thread.category
    };

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify(transformedThread)
    });

  } catch (error) {
    console.error('Get thread error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to fetch thread',
        message: error.message 
      })
    });
  }
};

// Get answers for a specific thread
exports.getThreadAnswers = async (event) => {
  try {
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      return addCorsHeaders({
        statusCode: 200,
        body: ''
      });
    }

    const { threadId } = event.pathParameters || {};
    
    if (!threadId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Thread ID is required' })
      });
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
      return addCorsHeaders({
        statusCode: 200,
        body: JSON.stringify({})
      });
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

      // Sort answers: pinned first, then by creation time
      const sortedAnswers = (answersResult.Items || []).sort((a, b) => {
        // First by pinned status (pinned answers first)
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

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify(answersByQuestion)
    });

  } catch (error) {
    console.error('Get thread answers error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to fetch thread answers',
        message: error.message 
      })
    });
  }
};

exports.getUserConversations = async (event) => {
  try {
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      return addCorsHeaders({
        statusCode: 200,
        body: ''
      });
    }

    const { userId } = event.pathParameters || {};
    
    if (!userId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'User ID is required' })
      });
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

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({
        conversations: result.Items || [],
        count: result.Count || 0
      })
    });

  } catch (error) {
    console.error('Get conversations error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to fetch conversations',
        message: error.message 
      })
    });
  }
};

// Get messages for a specific conversation
exports.getMessages = async (event) => {
  try {
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      return addCorsHeaders({
        statusCode: 200,
        body: ''
      });
    }

    const { conversationId } = event.pathParameters || {};
    
    if (!conversationId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Conversation ID is required' })
      });
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

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify(messages)
    });

  } catch (error) {
    console.error('Get conversation messages error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to fetch messages',
        message: error.message 
      })
    });
  }
};

// Create new conversation
exports.createNewConversation = async (event) => {
  try {
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      return addCorsHeaders({
        statusCode: 200,
        body: ''
      });
    }

    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      });
    }
    
    const { userId, title } = requestBody;
    
    if (!userId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'User ID is required' })
      });
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

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify(conversation)
    });

  } catch (error) {
    console.error('Create conversation error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to create conversation',
        message: error.message 
      })
    });
  }
};

// Save messages to conversation
exports.saveMessages = async (event) => {
  try {
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      return addCorsHeaders({
        statusCode: 200,
        body: ''
      });
    }

    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      });
    }
    
    const { conversationId, messages } = requestBody;
    
    if (!conversationId || !messages || !Array.isArray(messages)) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Conversation ID and messages array are required' })
      });
    }

    console.log('💾 Saving', messages.length, 'messages to conversation:', conversationId);

    // Verify conversation exists
    const conversation = await dynamodb.get({
      TableName: conversationsTable,
      Key: { id: conversationId }
    }).promise();

    if (!conversation.Item) {
      return addCorsHeaders({
        statusCode: 404,
        body: JSON.stringify({ error: 'Conversation not found' })
      });
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
          return addCorsHeaders({
            statusCode: 500,
            body: JSON.stringify({ 
              error: `Failed to save message: ${messageError.message}`,
              savedCount 
            })
          });
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

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        savedCount,
        conversationId 
      })
    });

  } catch (error) {
    console.error('Save messages error:', error);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to save messages',
        message: error.message 
      })
    });
  }
};

// Update conversation title
exports.updateConversationTitle = async (event) => {
  try {
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      return addCorsHeaders({
        statusCode: 200,
        body: ''
      });
    }

    const { conversationId } = event.pathParameters || {};
    
    if (!conversationId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Conversation ID is required' })
      });
    }

    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      });
    }
    
    const { title } = requestBody;
    
    if (!title) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Title is required' })
      });
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

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({ success: true, title })
    });

  } catch (error) {
    console.error('Update conversation title error:', error);
    
    if (error.code === 'ConditionalCheckFailedException') {
      return addCorsHeaders({
        statusCode: 404,
        body: JSON.stringify({ error: 'Conversation not found' })
      });
    }
    
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to update conversation title',
        message: error.message 
      })
    });
  }
};

// Delete conversation
exports.deleteConversation = async (event) => {
  try {
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      return addCorsHeaders({
        statusCode: 200,
        body: ''
      });
    }

    console.log('🗑️ AWS: Delete conversation handler called');
    console.log('📋 Full event:', JSON.stringify(event, null, 2));
    
    const { conversationId } = event.pathParameters || {};
    
    console.log('🔍 Path parameters:', event.pathParameters);
    console.log('🔍 Extracted conversationId:', conversationId);
    
    if (!conversationId) {
      console.log('❌ No conversationId provided');
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Conversation ID is required' })
      });
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

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        message: 'Conversation deleted successfully',
        conversationId: conversationId
      })
    });

  } catch (error) {
    console.error('Delete conversation error:', error);
    console.error('Error stack:', error.stack);
    
    if (error.code === 'ConditionalCheckFailedException') {
      return addCorsHeaders({
        statusCode: 404,
        body: JSON.stringify({ error: 'Conversation not found' })
      });
    }
    
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to delete conversation',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    });
  }
};

// Add question to thread
exports.addQuestion = async (event) => {
  try {
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      return addCorsHeaders({
        statusCode: 200,
        body: ''
      });
    }

    const { threadId } = event.pathParameters || {};
    
    if (!threadId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Thread ID is required' })
      });
    }

    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      });
    }
    
    const { content, userId } = requestBody;
    
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
    const threadResult = await dynamodb.get({
      TableName: threadsTable,
      Key: { id: threadId }
    }).promise();

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
      created_at: now
    };

    await dynamodb.put({
      TableName: questionsTable,
      Item: question
    }).promise();

    // Update thread question count and timestamp
    await dynamodb.update({
      TableName: threadsTable,
      Key: { id: threadId },
      UpdateExpression: 'SET updated_at = :updatedAt, question_count = COALESCE(question_count, :zero) + :one',
      ExpressionAttributeValues: {
        ':updatedAt': now,
        ':zero': 0,
        ':one': 1
      }
    }).promise();

    const newQuestion = {
      id: questionId,
      content: content.trim(),
      timestamp: now,
      userId: userId,
      threadId: threadId
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
      return addCorsHeaders({
        statusCode: 200,
        body: ''
      });
    }

    const { questionId } = event.pathParameters || {};
    
    if (!questionId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Question ID is required' })
      });
    }

    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      });
    }
    
    const { content, userId, isAI, isPinned, thinking } = requestBody;
    
    if (!content || !content.trim()) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Answer content is required' })
      });
    }

    // Verify question exists
    const questionResult = await dynamodb.get({
      TableName: questionsTable,
      Key: { id: questionId }
    }).promise();

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

    await dynamodb.put({
      TableName: answersTable,
      Item: answer
    }).promise();

    // Update thread answer count
    const question = questionResult.Item;
    await dynamodb.update({
      TableName: threadsTable,
      Key: { id: question.thread_id },
      UpdateExpression: 'SET updated_at = :updatedAt, answer_count = COALESCE(answer_count, :zero) + :one',
      ExpressionAttributeValues: {
        ':updatedAt': now,
        ':zero': 0,
        ':one': 1
      }
    }).promise();

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
      return addCorsHeaders({
        statusCode: 200,
        body: ''
      });
    }

    const { answerId } = event.pathParameters || {};
    
    if (!answerId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Answer ID is required' })
      });
    }

    // Get all comments for this answer
    const commentsResult = await dynamodb.query({
      TableName: commentsTable,
      IndexName: 'AnswerIdIndex',
      KeyConditionExpression: 'answerId = :answerId',
      ExpressionAttributeValues: {
        ':answerId': answerId
      },
      ScanIndexForward: true // Get oldest first for chronological order
    }).promise();

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
        answerId: item.answerId,
        parentId: item.parent_id || null,
        replies: []
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
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      return addCorsHeaders({
        statusCode: 200,
        body: ''
      });
    }

    const { answerId } = event.pathParameters || {};
    
    if (!answerId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Answer ID is required' })
      });
    }

    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      });
    }
    
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
    const answerResult = await dynamodb.get({
      TableName: answersTable,
      Key: { id: answerId }
    }).promise();

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

    await dynamodb.put({
      TableName: commentsTable,
      Item: comment
    }).promise();

    // Update answer interaction count
    await dynamodb.update({
      TableName: answersTable,
      Key: { id: answerId },
      UpdateExpression: 'SET interaction_count = COALESCE(interaction_count, :zero) + :one',
      ExpressionAttributeValues: {
        ':zero': 0,
        ':one': 1
      }
    }).promise();

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