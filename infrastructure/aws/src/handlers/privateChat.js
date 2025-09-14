const AWS = require('aws-sdk');
const { deepseek } = require('@ai-sdk/deepseek');
const { streamText } = require('ai');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const apigateway = new AWS.ApiGatewayManagementApi({
  endpoint: process.env.WEBSOCKET_ENDPOINT
});

const conversationsTable = process.env.DYNAMODB_TABLE_CONVERSATIONS;
const messagesTable = process.env.DYNAMODB_TABLE_MESSAGES;

exports.sendMessage = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const { conversationId, message } = JSON.parse(event.body);

  try {
    // Save user message
    const userMessage = {
      id: uuidv4(),
      conversationId,
      content: message,
      sender: 'user',
      timestamp: new Date().toISOString()
    };

    await dynamodb.put({
      TableName: messagesTable,
      Item: userMessage
    }).promise();

    // Get conversation history
    const messages = await dynamodb.query({
      TableName: messagesTable,
      IndexName: 'ConversationIdIndex',
      KeyConditionExpression: 'conversationId = :conversationId',
      ExpressionAttributeValues: {
        ':conversationId': conversationId
      }
    }).promise();

    // Prepare messages for AI
    const chatMessages = messages.Items
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));

    // Stream AI response
    const result = await streamText({
      model: deepseek('deepseek-reasoner'),
      system: "You are a helpful assistant that provides thoughtful and accurate responses.",
      messages: chatMessages,
    });

    let fullContent = '';
    let thinking = '';

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
            thinking += delta.text;
            await sendToConnection(connectionId, {
              type: 'ai_thinking_delta',
              conversationId,
              thinking: delta.text
            });
          }
          break;
      }
    }

    // Save AI response
    const aiMessage = {
      id: uuidv4(),
      conversationId,
      content: fullContent,
      sender: 'ai',
      timestamp: new Date().toISOString()
    };

    await dynamodb.put({
      TableName: messagesTable,
      Item: aiMessage
    }).promise();

    // Send completion
    await sendToConnection(connectionId, {
      type: 'ai_response_complete',
      conversationId,
      message: aiMessage
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('Send message error:', error);
    
    await sendToConnection(connectionId, {
      type: 'error',
      message: 'Failed to process message'
    });

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to send message' })
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
    console.error('Failed to send to connection:', error);
  }
}