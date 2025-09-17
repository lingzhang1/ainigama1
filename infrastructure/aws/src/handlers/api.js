
const AWS = require('aws-sdk');
const crypto = require('crypto');
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
  // Handle OPTIONS request for CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

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
  // Handle OPTIONS request for CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

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
  // Handle OPTIONS request for CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

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
  // Handle OPTIONS request for CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

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
  // Handle OPTIONS request for CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

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

// Handle OPTIONS requests for CORS
exports.options = async (event) => {
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: ''
  };
};