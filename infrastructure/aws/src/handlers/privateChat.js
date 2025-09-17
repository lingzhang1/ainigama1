const AWS = require('aws-sdk');
const { deepseek } = require('@ai-sdk/deepseek');
const crypto = require('crypto');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const apigateway = new AWS.ApiGatewayManagementApi({
  endpoint: process.env.WEBSOCKET_ENDPOINT
});

const conversationsTable = process.env.DYNAMODB_TABLE_CONVERSATIONS;
const messagesTable = process.env.DYNAMODB_TABLE_MESSAGES;
const connectionsTable = process.env.DYNAMODB_TABLE_CONNECTIONS || 'ainigama-dev-connections';

exports.sendMessage = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const { conversationId, message } = JSON.parse(event.body);

  console.log('📨 Received message for conversation:', conversationId);

  try {
    // Get user info from connection
    const connection = await dynamodb.get({
      TableName: connectionsTable,
      Key: { connectionId }
    }).promise();

    const userId = connection.Item?.userId;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    // Validate conversation exists and belongs to user
    const conversation = await dynamodb.get({
      TableName: conversationsTable,
      Key: { id: conversationId }
    }).promise();

    if (!conversation.Item || conversation.Item.userId !== userId) {
      throw new Error('Conversation not found or access denied');
    }

    // Save user message
    const { v4: uuidv4 } = await import('uuid');
    const userMessage = {
      id: crypto.randomUUID(),
      conversationId,
      content: message,
      sender: 'user',
      userId,
      timestamp: new Date().toISOString()
    };

    await dynamodb.put({
      TableName: messagesTable,
      Item: userMessage
    }).promise();

    console.log('✅ Saved user message:', userMessage.id);

    // Get conversation history for AI context
    const messagesResult = await dynamodb.query({
      TableName: messagesTable,
      IndexName: 'ConversationIdIndex',
      KeyConditionExpression: 'conversationId = :conversationId',
      ExpressionAttributeValues: {
        ':conversationId': conversationId
      },
      ScanIndexForward: true
    }).promise();

    // Prepare messages for AI
    const chatMessages = messagesResult.Items
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));

    console.log('🤖 Sending to AI with context:', chatMessages.length, 'messages');

    // Stream AI response
    let fullContent = '';
    let fullThinking = '';

    try {
      const result = await streamText({
        model: deepseek('deepseek-reasoner'),
        system: "You are a helpful assistant that provides thoughtful and accurate responses.",
        messages: chatMessages,
      });

      // Stream response back to client
      for await (const delta of result.fullStream) {
        switch (delta.type) {
          case 'text-delta':
            if (delta.textDelta) {
              fullContent += delta.textDelta;
              await sendToConnection(connectionId, {
                type: 'ai_content_delta',
                conversationId,
                content: delta.textDelta
              });
            }
            break;
          case 'reasoning-delta':
            if (delta.text) {
              fullThinking += delta.text;
              await sendToConnection(connectionId, {
                type: 'ai_thinking_delta',
                conversationId,
                thinking: delta.text
              });
            }
            break;
          case 'step-delta':
            if (delta.stepDelta) {
              if (delta.stepDelta.type === 'reasoning-delta' && delta.stepDelta.reasoningDelta) {
                fullThinking += delta.stepDelta.reasoningDelta;
                await sendToConnection(connectionId, {
                  type: 'ai_thinking_delta',
                  conversationId,
                  thinking: delta.stepDelta.reasoningDelta
                });
              } else if (delta.stepDelta.type === 'reasoning' && delta.stepDelta.reasoning) {
                fullThinking += delta.stepDelta.reasoning;
                await sendToConnection(connectionId, {
                  type: 'ai_thinking_delta',
                  conversationId,
                  thinking: delta.stepDelta.reasoning
                });
              }
            }
            break;
        }
      }

      console.log('🧠 AI thinking captured:', fullThinking.length, 'characters');
      console.log('💬 AI response captured:', fullContent.length, 'characters');

      // Save AI response with thinking process
      const aiMessage = {
        id: crypto.randomUUID(),
        conversationId,
        content: fullContent,
        sender: 'ai',
        userId: null, // AI messages don't have a userId
        thinking: fullThinking || null, // Store thinking process
        timestamp: new Date().toISOString()
      };

      await dynamodb.put({
        TableName: messagesTable,
        Item: aiMessage
      }).promise();

      console.log('✅ Saved AI message with thinking:', aiMessage.id);

      // Update conversation timestamp
      await dynamodb.update({
        TableName: conversationsTable,
        Key: { id: conversationId },
        UpdateExpression: 'SET updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':updatedAt': new Date().toISOString()
        }
      }).promise();

      // Send completion
      await sendToConnection(connectionId, {
        type: 'ai_response_complete',
        conversationId,
        message: aiMessage
      });

      console.log('🎉 Message processing complete for conversation:', conversationId);

    } catch (aiError) {
      console.error('AI processing error:', aiError);
      
      // Save error message
      const { v4: uuidv4 } = await import('uuid');
      const errorMessage = {
        id: crypto.randomUUID(),
        conversationId,
        content: `Sorry, I encountered an error: ${aiError.message}`,
        sender: 'ai',
        userId: null,
        thinking: null,
        timestamp: new Date().toISOString()
      };

      await dynamodb.put({
        TableName: messagesTable,
        Item: errorMessage
      }).promise();

      await sendToConnection(connectionId, {
        type: 'ai_response_complete',
        conversationId,
        message: errorMessage
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('Send message error:', error);
    
    await sendToConnection(connectionId, {
      type: 'error',
      message: error.message || 'Failed to process message'
    });

    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Failed to send message' })
    };
  }
};

// Handle conversation saving from frontend
exports.saveConversation = async (event) => {
  const connectionId = event.requestContext.connectionId;
  
  let requestData;
  try {
    requestData = JSON.parse(event.body);
  } catch (parseError) {
    console.error('Failed to parse WebSocket message body:', parseError);
    await sendToConnection(connectionId, {
      type: 'conversation_saved',
      success: false,
      error: 'Invalid message format'
    });
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid message format' })
    };
  }

  const { conversationId, messages } = requestData;

  console.log('💾 WebSocket: Saving conversation:', conversationId, 'with', messages?.length || 0, 'messages');

  if (!conversationId || !messages || !Array.isArray(messages)) {
    await sendToConnection(connectionId, {
      type: 'conversation_saved',
      conversationId,
      success: false,
      error: 'Missing conversationId or messages array'
    });
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required data' })
    };
  }

  try {
    // Get user info from connection
    const connection = await dynamodb.get({
      TableName: connectionsTable,
      Key: { connectionId }
    }).promise();

    const userId = connection.Item?.userId;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    // Validate conversation exists and belongs to user
    const conversation = await dynamodb.get({
      TableName: conversationsTable,
      Key: { id: conversationId }
    }).promise();

    if (!conversation.Item || conversation.Item.userId !== userId) {
      await sendToConnection(connectionId, {
        type: 'conversation_saved',
        conversationId,
        success: false,
        error: 'Conversation not found or access denied'
      });
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Access denied' })
      };
    }

    // Save messages sequentially to ensure proper conversation association
    let savedCount = 0;
    for (const message of messages) {
      try {
        const messageItem = {
          id: message.id,
          conversationId: conversationId, // Ensure correct conversation ID
          content: message.content,
          sender: message.sender,
          userId: message.sender === 'user' ? userId : null,
          thinking: message.thinking || null, // Include thinking process
          timestamp: message.timestamp || new Date().toISOString()
        };

        await dynamodb.put({
          TableName: messagesTable,
          Item: messageItem
        }).promise();

        console.log(`✅ Saved message ${message.id} to conversation ${conversationId}`);
        savedCount++;

      } catch (messageError) {
        console.error(`❌ Failed to save message ${message.id}:`, messageError);
        
        await sendToConnection(connectionId, {
          type: 'conversation_saved',
          conversationId,
          success: false,
          error: `Failed to save message: ${messageError.message}`
        });
        
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to save messages' })
        };
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

    // Confirm save to client
    await sendToConnection(connectionId, {
      type: 'conversation_saved',
      conversationId,
      success: true
    });

    console.log(`✅ Successfully saved ${savedCount} messages to conversation ${conversationId}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, savedCount })
    };

  } catch (error) {
    console.error('Save conversation error:', error);
    
    await sendToConnection(connectionId, {
      type: 'conversation_saved',
      conversationId,
      success: false,
      error: error.message
    });

    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

async function sendToConnection(connectionId, data) {
  try {
    await apigateway.postToConnection({
      ConnectionId: connectionId,
      Data: JSON.stringify(data)
    }).promise();
  } catch (error) {
    if (error.statusCode === 410) {
      console.log('Connection is stale, removing:', connectionId);
      // Connection is stale, remove it
      await dynamodb.delete({
        TableName: connectionsTable,
        Key: { connectionId }
      }).promise();
    } else {
      console.error('Failed to send to connection:', error);
    }
  }
}