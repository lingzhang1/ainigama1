const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

const threadsTable = process.env.DYNAMODB_TABLE_THREADS;
const conversationsTable = process.env.DYNAMODB_TABLE_CONVERSATIONS;
const messagesTable = process.env.DYNAMODB_TABLE_MESSAGES;

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
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

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        threads: result.Items || [],
        count: result.Count || 0
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
      ScanIndexForward: true
    };

    const result = await dynamodb.query(params).promise();

    // Transform messages to include thinking process
    const messages = result.Items.map(msg => ({
      id: msg.id,
      content: msg.content,
      timestamp: msg.timestamp,
      sender: msg.sender,
      userId: msg.userId,
      thinking: msg.thinking || undefined // Include thinking process
    }));

    console.log(`📥 Loaded ${messages.length} messages for conversation ${conversationId}`);
    console.log(`🧠 Messages with thinking: ${messages.filter(m => m.thinking).length}`);

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
    // Dynamic import for UUID
    const { v4: uuidv4 } = await import('uuid');
    
    const { userId, title } = JSON.parse(event.body || '{}');
    
    if (!userId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User ID is required' })
      };
    }

    const conversationId = uuidv4();
    const now = new Date().toISOString();

    const conversation = {
      id: conversationId,
      userId,
      title: title || null,
      createdAt: now,
      updatedAt: now
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

// Handle OPTIONS requests for CORS
exports.options = async (event) => {
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: ''
  };
};