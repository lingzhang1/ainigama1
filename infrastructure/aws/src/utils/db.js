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
  connections: process.env.DYNAMODB_TABLE_CONNECTIONS || 'ainigama-dev-connections'
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