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

exports.default = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Default route' })
  };
};