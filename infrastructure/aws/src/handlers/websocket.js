const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Store WebSocket connections
const connectionsTable = process.env.DYNAMODB_TABLE_CONNECTIONS || 'ainigama-dev-connections';

exports.connect = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const userId = event.queryStringParameters?.userId;

  try {
    await dynamodb.put({
      TableName: connectionsTable,
      Item: {
        connectionId,
        userId,
        connectedAt: new Date().toISOString()
      }
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Connected successfully' })
    };
  } catch (error) {
    console.error('Connection error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to connect' })
    };
  }
};

exports.disconnect = async (event) => {
  const connectionId = event.requestContext.connectionId;

  try {
    await dynamodb.delete({
      TableName: connectionsTable,
      Key: { connectionId }
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Disconnected successfully' })
    };
  } catch (error) {
    console.error('Disconnection error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to disconnect' })
    };
  }
};

// Handle user authentication and store user info
exports.authenticate = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const { userId, user } = JSON.parse(event.body);

  try {
    // Update connection with user info
    await dynamodb.update({
      TableName: connectionsTable,
      Key: { connectionId },
      UpdateExpression: 'SET userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    }).promise();

    // Store or update user information in database
    if (user) {
      await dynamodb.put({
        TableName: process.env.DYNAMODB_TABLE_USERS,
        Item: {
          id: user.id,
          name: user.name,
          email: user.email,
          alias: user.alias,
          avatar: user.avatar,
          handle: user.handle,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      }).promise();

      console.log('✅ AWS: Successfully stored user info for:', user.name, user.email);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Authenticated successfully' })
    };
  } catch (error) {
    console.error('Authentication error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to authenticate' })
    };
  }
};
exports.default = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Default route' })
  };
};

// Subscribe to notifications
exports.subscribeNotifications = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const { userId } = JSON.parse(event.body || '{}');

  try {
    // Update connection to enable notifications
    await dynamodb.update({
      TableName: connectionsTable,
      Key: { connectionId },
      UpdateExpression: 'SET subscribeNotifications = :true, userId = :userId',
      ExpressionAttributeValues: {
        ':true': true,
        ':userId': userId
      }
    }).promise();

    console.log('✅ User subscribed to notifications:', userId);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Subscribed to notifications successfully' })
    };
  } catch (error) {
    console.error('Subscribe notifications error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to subscribe to notifications' })
    };
  }
};