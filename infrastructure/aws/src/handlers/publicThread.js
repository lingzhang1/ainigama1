const AWS = require('aws-sdk');
const crypto = require('crypto');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const apigateway = new AWS.ApiGatewayManagementApi({
  endpoint: process.env.WEBSOCKET_ENDPOINT
});

const threadsTable = process.env.DYNAMODB_TABLE_THREADS;
const questionsTable = process.env.DYNAMODB_TABLE_QUESTIONS;
const answersTable = process.env.DYNAMODB_TABLE_ANSWERS;
const commentsTable = process.env.DYNAMODB_TABLE_COMMENTS;
const connectionsTable = process.env.DYNAMODB_TABLE_CONNECTIONS;

exports.joinThread = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const { threadId } = JSON.parse(event.body);

  try {
    // Update connection with thread information
    await dynamodb.update({
      TableName: connectionsTable,
      Key: { connectionId },
      UpdateExpression: 'SET threadId = :threadId',
      ExpressionAttributeValues: {
        ':threadId': threadId
      }
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Joined thread successfully' })
    };

  } catch (error) {
    console.error('Join thread error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to join thread' })
    };
  }
};

exports.addAnswer = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const { threadId, questionId, content } = JSON.parse(event.body);

  try {
    // Get user info from connection
    const connection = await dynamodb.get({
      TableName: connectionsTable,
      Key: { connectionId }
    }).promise();

    const userId = connection.Item?.userId;

    // Create new answer
    const answer = {
      id: crypto.randomUUID(),
      questionId,
      content,
      userId,
      isAI: false,
      isPinned: false,
      interactionCount: 0,
      timestamp: new Date().toISOString()
    };

    await dynamodb.put({
      TableName: answersTable,
      Item: answer
    }).promise();

    // Broadcast to all connections in this thread
    await broadcastToThread(threadId, {
      type: 'new_answer',
      threadId,
      answer
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('Add answer error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to add answer' })
    };
  }
};

exports.addComment = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const { answerId, content, parentId } = JSON.parse(event.body);
  
  console.log('🔵 AWS: addComment called for answer:', answerId, 'connection:', connectionId);

  try {
    // Get user info from connection
    const connection = await dynamodb.get({
      TableName: connectionsTable,
      Key: { connectionId }
    }).promise();

    const userId = connection.Item?.userId;

    // Create new comment
    const comment = {
      id: crypto.randomUUID(),
      answerId,
      content,
      userId,
      parentId: parentId || null,
      timestamp: new Date().toISOString()
    };

    await dynamodb.put({
      TableName: commentsTable,
      Item: comment
    }).promise();

    console.log('✅ AWS: Comment saved to DB:', comment.id, 'for answer:', answerId);
    
    // Broadcast only once to prevent duplicates
    const broadcastData = {
      type: 'new_comment',
      answerId,
      comment
    };
    
    console.log('📡 AWS: Broadcasting comment:', comment.id);
    await broadcastToAll(broadcastData);
    console.log('🎉 AWS: Broadcast complete for comment:', comment.id);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('Add comment error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to add comment' })
    };
  }
};

async function broadcastToThread(threadId, data) {
  try {
    // Get all connections for this thread
    const connections = await dynamodb.scan({
      TableName: connectionsTable,
      FilterExpression: 'threadId = :threadId',
      ExpressionAttributeValues: {
        ':threadId': threadId
      }
    }).promise();

    // Send to all connections
    const promises = connections.Items.map(async (connection) => {
      try {
        await apigateway.postToConnection({
          ConnectionId: connection.connectionId,
          Data: JSON.stringify(data)
        }).promise();
      } catch (error) {
        if (error.statusCode === 410) {
          // Connection is stale, remove it
          await dynamodb.delete({
            TableName: connectionsTable,
            Key: { connectionId: connection.connectionId }
          }).promise();
        }
      }
    });

    await Promise.all(promises);
  } catch (error) {
    console.error('Broadcast error:', error);
  }
}

async function broadcastToAll(data) {
  try {
    console.log('📡 AWS: Starting broadcast for:', data.type, 'data:', JSON.stringify(data).substring(0, 100));
    
    // Get all active connections
    const connections = await dynamodb.scan({
      TableName: connectionsTable
    }).promise();

    if (!connections.Items || connections.Items.length === 0) {
      console.log('⚠️ AWS: No active connections to broadcast to');
      return;
    }

    console.log('📊 AWS: Found', connections.Items.length, 'connections to broadcast to');
    
    // Send to all connections
    let successCount = 0;
    let failureCount = 0;
    
    const promises = connections.Items.map(async (connection) => {
      try {
        await apigateway.postToConnection({
          ConnectionId: connection.connectionId,
          Data: JSON.stringify(data)
        }).promise();
        successCount++;
      } catch (error) {
        if (error.statusCode === 410) {
          failureCount++;
          // Connection is stale, remove it
          await dynamodb.delete({
            TableName: connectionsTable,
            Key: { connectionId: connection.connectionId }
          }).promise();
        } else {
          failureCount++;
          console.error('❌ AWS: Failed to send to connection:', connection.connectionId, error.message);
        }
      }
    });

    await Promise.all(promises);
    console.log('🎉 AWS: Broadcast complete - Success:', successCount, 'Failed:', failureCount);
  } catch (error) {
    console.error('Broadcast error:', error);
  }
}

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