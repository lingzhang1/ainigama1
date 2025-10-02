const crypto = require('crypto');
const { addCorsHeaders, handleOptionsRequest } = require('../utils/cors');
const { tables, dbOperations, parseRequestBody } = require('../utils/db');

// Get user conversations
exports.getUserConversations = async (event) => {
  try {
    console.log('getUserConversations called with method:', event.httpMethod);
    
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

    const result = await dbOperations.query(
      tables.conversations,
      'userId = :userId',
      { ':userId': userId },
      'UserIdIndex',
      false,
      50
    );

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
    console.log('getMessages called with method:', event.httpMethod);
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    const { conversationId } = event.pathParameters || {};
    
    if (!conversationId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Conversation ID is required' })
      });
    }

    const result = await dbOperations.query(
      tables.messages,
      'conversationId = :conversationId',
      { ':conversationId': conversationId },
      'ConversationIdIndex',
      true
    );

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
    console.log('createNewConversation called with method:', event.httpMethod);
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    const requestBody = parseRequestBody(event.body);
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

    await dbOperations.put(tables.conversations, conversation);

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
    console.log('saveMessages called with method:', event.httpMethod);
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    const requestBody = parseRequestBody(event.body);
    const { conversationId, messages } = requestBody;
    
    if (!conversationId || !messages || !Array.isArray(messages)) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Conversation ID and messages array are required' })
      });
    }

    console.log('💾 Saving', messages.length, 'messages to conversation:', conversationId);

    // Verify conversation exists
    const conversation = await dbOperations.get(tables.conversations, { id: conversationId });

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
        await dbOperations.put(tables.messages, messageItem);

        console.log(`✅ Saved message ${message.id} (${message.sender}) to conversation ${conversationId}`);
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
    await dbOperations.update(
      tables.conversations,
      { id: conversationId },
      'SET updatedAt = :updatedAt',
      { ':updatedAt': new Date().toISOString() }
    );

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
    console.log('updateConversationTitle called with method:', event.httpMethod);
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    const { conversationId } = event.pathParameters || {};
    
    if (!conversationId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Conversation ID is required' })
      });
    }

    const requestBody = parseRequestBody(event.body);
    const { title } = requestBody;
    
    if (!title) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Title is required' })
      });
    }

    // Update conversation title
    await dbOperations.update(
      tables.conversations,
      { id: conversationId },
      'SET title = :title, updatedAt = :updatedAt',
      {
        ':title': title,
        ':updatedAt': new Date().toISOString()
      },
      'attribute_exists(id)'
    );

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
    console.log('deleteConversation called with method:', event.httpMethod);
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling OPTIONS request');
      return handleOptionsRequest();
    }

    const { conversationId } = event.pathParameters || {};
    
    if (!conversationId) {
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ error: 'Conversation ID is required' })
      });
    }

    console.log('🗑️ Deleting conversation:', conversationId);

    // First, delete all messages in the conversation
    const messagesResult = await dbOperations.query(
      tables.messages,
      'conversationId = :conversationId',
      { ':conversationId': conversationId },
      'ConversationIdIndex'
    );

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
        await dbOperations.batchWrite({
          [tables.messages]: batch
        });
      }

      console.log('✅ Deleted', messages.length, 'messages for conversation:', conversationId);
    }

    // Then delete the conversation itself
    await dbOperations.delete(
      tables.conversations,
      { id: conversationId },
      'attribute_exists(id)'
    );

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
        message: error.message
      })
    });
  }
};