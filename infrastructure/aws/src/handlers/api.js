const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();

const conversationsTable = process.env.DYNAMODB_TABLE_CONVERSATIONS;
const messagesTable = process.env.DYNAMODB_TABLE_MESSAGES;
const threadsTable = process.env.DYNAMODB_TABLE_THREADS;
const questionsTable = process.env.DYNAMODB_TABLE_QUESTIONS;
const answersTable = process.env.DYNAMODB_TABLE_ANSWERS;

// Get threads
exports.getThreads = async (event) => {
  const { filter = 'recent' } = event.queryStringParameters || {};
  
  try {
    const indexName = filter === 'trending' ? 'UpdatedAtIndex' : 'CreatedAtIndex';
    
    const result = await dynamodb.scan({
      TableName: threadsTable,
      IndexName: indexName,
      FilterExpression: 'isPublic = :isPublic',
      ExpressionAttributeValues: {
        ':isPublic': true
      },
      Limit: 20,
      ScanIndexForward: false // Descending order
    }).promise();

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: JSON.stringify({ threads: result.Items })
    };

  } catch (error) {
    console.error('Get threads error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: JSON.stringify({ error: 'Failed to fetch threads' })
    };
  }
};

// Get single thread
exports.getThread = async (event) => {
  const { threadId } = event.pathParameters;
  
  try {
    const thread = await dynamodb.get({
      TableName: threadsTable,
      Key: { id: threadId }
    }).promise();

    if (!thread.Item) {
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
        },
        body: JSON.stringify({ error: 'Thread not found' })
      };
    }

    // Get questions for this thread
    const questions = await dynamodb.query({
      TableName: questionsTable,
      IndexName: 'ThreadIdIndex',
      KeyConditionExpression: 'threadId = :threadId',
      ExpressionAttributeValues: {
        ':threadId': threadId
      },
      ScanIndexForward: true
    }).promise();

    thread.Item.questions = questions.Items;

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: JSON.stringify(thread.Item)
    };

  } catch (error) {
    console.error('Get thread error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: JSON.stringify({ error: 'Failed to fetch thread' })
    };
  }
};

// Get user conversations
exports.getUserConversations = async (event) => {
  const { userId } = event.pathParameters;
  
  try {
    const result = await dynamodb.query({
      TableName: conversationsTable,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      },
      ScanIndexForward: false // Descending order by updatedAt
    }).promise();

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: JSON.stringify(result.Items)
    };

  } catch (error) {
    console.error('Get user conversations error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: JSON.stringify({ error: 'Failed to fetch conversations' })
    };
  }
};

// Get conversation messages
exports.getConversationMessages = async (event) => {
  const { conversationId } = event.pathParameters;
  
  try {
    const result = await dynamodb.query({
      TableName: messagesTable,
      IndexName: 'ConversationIdIndex',
      KeyConditionExpression: 'conversationId = :conversationId',
      ExpressionAttributeValues: {
        ':conversationId': conversationId
      },
      ScanIndexForward: true // Ascending order by timestamp
    }).promise();

    // Sort by timestamp and ID to ensure proper order
    const sortedMessages = result.Items.sort((a, b) => {
      const timeA = new Date(a.timestamp || a.createdAt || 0).getTime();
      const timeB = new Date(b.timestamp || b.createdAt || 0).getTime();
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      return a.id.localeCompare(b.id);
    });

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: JSON.stringify(sortedMessages)
    };

  } catch (error) {
    console.error('Get conversation messages error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: JSON.stringify({ error: 'Failed to fetch messages' })
    };
  }
};

// Create conversation
exports.createConversation = async (event) => {
  const { userId, title } = JSON.parse(event.body);
  const conversationId = uuidv4();
  const now = new Date().toISOString();
  
  try {
    await dynamodb.put({
      TableName: conversationsTable,
      Item: {
        id: conversationId,
        userId,
        title: title || null,
        createdAt: now,
        updatedAt: now
      }
    }).promise();

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: JSON.stringify({
        id: conversationId,
        userId,
        title,
        createdAt: now,
        updatedAt: now,
        messages: []
      })
    };

  } catch (error) {
    console.error('Create conversation error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: JSON.stringify({ error: 'Failed to create conversation' })
    };
  }
};

// Update conversation title
exports.updateConversationTitle = async (event) => {
  const { conversationId } = event.pathParameters;
  const { title } = JSON.parse(event.body);
  
  if (!title) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: JSON.stringify({ error: 'Title is required' })
    };
  }
  
  try {
    await dynamodb.update({
      TableName: conversationsTable,
      Key: { id: conversationId },
      UpdateExpression: 'SET title = :title, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':title': title,
        ':updatedAt': new Date().toISOString()
      }
    }).promise();

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: JSON.stringify({ success: true, title })
    };

  } catch (error) {
    console.error('Update conversation title error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: JSON.stringify({ error: 'Failed to update title' })
    };
  }
};

// Publish thread from private conversation
exports.publishThread = async (event) => {
  const { conversationId, title, category, userId, messages } = JSON.parse(event.body);
  
  if (!conversationId || !title || !userId || !messages) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: JSON.stringify({ error: 'Missing required fields' })
    };
  }

  console.log('📢 Publishing thread from conversation:', conversationId);

  const threadId = uuidv4();
  const now = new Date().toISOString();

  try {
    // Create the thread
    await dynamodb.put({
      TableName: threadsTable,
      Item: {
        id: threadId,
        title,
        creatorId: userId,
        category: category || 'general',
        isPublic: true,
        createdAt: now,
        updatedAt: now
      }
    }).promise();

    console.log('✅ Created thread:', threadId);

    // Group messages into Q&A pairs
    const qaPairs = [];
    for (let i = 0; i < messages.length; i += 2) {
      const userMessage = messages[i];
      const aiMessage = messages[i + 1];
      
      if (userMessage && userMessage.sender === 'user') {
        qaPairs.push({
          question: userMessage,
          answer: aiMessage && aiMessage.sender === 'ai' ? aiMessage : null
        });
      }
    }

    console.log('📝 Creating', qaPairs.length, 'Q&A pairs');

    // Create questions and answers
    const promises = [];
    
    qaPairs.forEach((pair, index) => {
      const questionId = uuidv4();
      
      // Create question
      promises.push(
        dynamodb.put({
          TableName: questionsTable,
          Item: {
            id: questionId,
            threadId,
            content: pair.question.content,
            userId,
            createdAt: pair.question.timestamp || now
          }
        }).promise()
      );

      // Create AI answer if exists
      if (pair.answer) {
        const answerId = uuidv4();
        
        promises.push(
          dynamodb.put({
            TableName: answersTable,
            Item: {
              id: answerId,
              questionId,
              content: pair.answer.content,
              userId: null,
              isAI: true,
              isPinned: true,
              interactionCount: 0,
              createdAt: pair.answer.timestamp || now
            }
          }).promise()
        );
      }
    });

    // Execute all promises
    await Promise.all(promises);

    console.log('🎉 Successfully published thread:', threadId);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: JSON.stringify({
        success: true,
        threadId,
        title,
        category: category || 'general',
        questionCount: qaPairs.length,
        answerCount: qaPairs.filter(p => p.answer).length
      })
    };

  } catch (error) {
    console.error('Publish thread error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: JSON.stringify({ error: 'Failed to publish thread' })
    };
  }
};