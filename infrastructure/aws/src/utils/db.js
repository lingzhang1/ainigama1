const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();

// Table names from environment variables
const tables = {
  users: process.env.DYNAMODB_TABLE_USERS,
  conversations: process.env.DYNAMODB_TABLE_CONVERSATIONS,
  messages: process.env.DYNAMODB_TABLE_MESSAGES,
  threads: process.env.DYNAMODB_TABLE_THREADS,
  questions: process.env.DYNAMODB_TABLE_QUESTIONS || 'ainigama-dev-questions',
  answers: process.env.DYNAMODB_TABLE_ANSWERS,
  comments: process.env.DYNAMODB_TABLE_COMMENTS,
  connections: process.env.DYNAMODB_TABLE_CONNECTIONS || 'ainigama-dev-connections',
  // New metrics tables
  threadViews: process.env.DYNAMODB_TABLE_THREAD_VIEWS || 'ainigama-dev-thread-views',
  likes: process.env.DYNAMODB_TABLE_LIKES || 'ainigama-dev-likes',
  saves: process.env.DYNAMODB_TABLE_SAVES || 'ainigama-dev-saves',
  shares: process.env.DYNAMODB_TABLE_SHARES || 'ainigama-dev-shares',
  // Notifications table
  notifications: process.env.DYNAMODB_TABLE_NOTIFICATIONS || 'ainigama-dev-notifications',
  // Recommendation tables
  userInteractions: process.env.DYNAMODB_TABLE_USER_INTERACTIONS || 'ainigama-dev-user-interactions',
  userPreferences: process.env.DYNAMODB_TABLE_USER_PREFERENCES || 'ainigama-dev-user-preferences',
  recommendationCache: process.env.DYNAMODB_TABLE_RECOMMENDATION_CACHE || 'ainigama-dev-recommendation-cache',
  // Unified system tables
  threadMetricsCache: process.env.DYNAMODB_TABLE_THREAD_METRICS_CACHE || 'ainigama-dev-thread-metrics-cache',
  timeTracking: process.env.DYNAMODB_TABLE_TIME_TRACKING || 'ainigama-dev-time-tracking'
};

// Common database operations
const dbOperations = {
  get: (tableName, key) => dynamodb.get({ TableName: tableName, Key: key }).promise(),
  put: (tableName, item) => dynamodb.put({ TableName: tableName, Item: item }).promise(),
  update: (tableName, key, updateExpression, expressionAttributeValues, conditionExpression = null) => {
    const params = {
      TableName: tableName,
      Key: key,
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues
    };
    if (conditionExpression) {
      params.ConditionExpression = conditionExpression;
    }
    return dynamodb.update(params).promise();
  },
  delete: (tableName, key, conditionExpression = null) => {
    const params = {
      TableName: tableName,
      Key: key
    };
    if (conditionExpression) {
      params.ConditionExpression = conditionExpression;
    }
    return dynamodb.delete(params).promise();
  },
  query: (tableName, keyConditionExpression, expressionAttributeValues, indexName = null, scanIndexForward = true, limit = null) => {
    const params = {
      TableName: tableName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ScanIndexForward: scanIndexForward
    };
    if (indexName) {
      params.IndexName = indexName;
    }
    if (limit) {
      params.Limit = limit;
    }
    return dynamodb.query(params).promise();
  },
  scan: (tableName, filterExpression = null, expressionAttributeValues = null, limit = null) => {
    const params = { TableName: tableName };
    if (filterExpression) {
      params.FilterExpression = filterExpression;
    }
    if (expressionAttributeValues) {
      params.ExpressionAttributeValues = expressionAttributeValues;
    }
    if (limit) {
      params.Limit = limit;
    }
    return dynamodb.scan(params).promise();
  },
  batchWrite: (requestItems) => dynamodb.batchWrite({ RequestItems: requestItems }).promise()
};

// Helper function to parse request body safely
const parseRequestBody = (body) => {
  try {
    return JSON.parse(body || '{}');
  } catch (parseError) {
    throw new Error('Invalid JSON in request body');
  }
};

module.exports = {
  dynamodb,
  tables,
  dbOperations,
  parseRequestBody
};