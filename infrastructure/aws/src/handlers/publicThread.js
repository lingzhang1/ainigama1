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

    // Broadcast to all connections
    await broadcastToAll({
      type: 'new_comment',
      answerId,
      comment
    });

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
    // Get all active connections
    const connections = await dynamodb.scan({
      TableName: connectionsTable
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