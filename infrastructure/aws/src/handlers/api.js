const AWS = require('aws-sdk');
const { deepseek } = require('@ai-sdk/deepseek');
const { streamText } = require('ai');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();

// CORS headers that need to be included in ALL responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Credentials': 'false'
};

// Helper function to create response with CORS headers
const createResponse = (statusCode, body, additionalHeaders = {}) => ({
  statusCode,
  headers: {
    ...corsHeaders,
    ...additionalHeaders
  },
  body: typeof body === 'string' ? body : JSON.stringify(body)
});

// Health check endpoint
exports.healthCheck = async (event) => {
  try {
    return createResponse(200, {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'ainigama-backend'
    });
  } catch (error) {
    console.error('Health check error:', error);
    return createResponse(500, { error: 'Health check failed' });
  }
};

// Get all threads
exports.getThreads = async (event) => {
  try {
    const { filter = 'recent' } = event.queryStringParameters || {};
    
    // Mock data for now - replace with DynamoDB queries
    const mockThreads = [
      {
        id: '1',
        title: 'How to maintain healthy long-term relationships?',
        creator: {
          id: '1',
          name: 'Sarah Johnson',
          avatar: '/img-4.svg',
          handle: '@sarahjohnson'
        },
        isPublic: true,
        createdAt: new Date('2025-02-15'),
        updatedAt: new Date('2025-02-15'),
        questionCount: 3,
        answerCount: 8,
        interactionCount: 23,
        category: 'Relationships',
        questions: []
      }
    ];

    return createResponse(200, { threads: mockThreads });
  } catch (error) {
    console.error('Get threads error:', error);
    return createResponse(500, { error: 'Failed to fetch threads' });
  }
};

// Get specific thread
exports.getThread = async (event) => {
  try {
    const { id } = event.pathParameters;
    
    // Mock data - replace with DynamoDB query
    const mockThread = {
      id,
      title: 'How to maintain healthy long-term relationships?',
      creator: {
        id: '1',
        name: 'Sarah Johnson',
        avatar: '/img-4.svg',
        handle: '@sarahjohnson'
      },
      isPublic: true,
      createdAt: new Date('2025-02-15'),
      updatedAt: new Date('2025-02-15'),
      questionCount: 3,
      answerCount: 8,
      interactionCount: 23,
      category: 'Relationships',
      questions: [
        {
          id: 'q1',
          content: 'How to maintain healthy long-term relationships?',
          timestamp: new Date('2025-02-15T10:00:00'),
          userId: '1',
          threadId: id
        }
      ]
    };

    return createResponse(200, mockThread);
  } catch (error) {
    console.error('Get thread error:', error);
    return createResponse(500, { error: 'Failed to fetch thread' });
  }
};

// Get user conversations
exports.getConversations = async (event) => {
  try {
    const { userId } = event.pathParameters;
    
    // Mock data - replace with DynamoDB query
    const mockConversations = [
      {
        id: uuidv4(),
        userId,
        title: 'Sample Conversation',
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: []
      }
    ];

    return createResponse(200, mockConversations);
  } catch (error) {
    console.error('Get conversations error:', error);
    return createResponse(500, { error: 'Failed to fetch conversations' });
  }
};

// Get user conversations (alternative endpoint)
exports.getUserConversations = async (event) => {
  try {
    const { userId } = event.pathParameters;
    
    // Mock data - replace with DynamoDB query
    const mockConversations = [
      {
        id: uuidv4(),
        userId,
        title: 'Sample Conversation',
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: []
      }
    ];

    return createResponse(200, mockConversations);
  } catch (error) {
    console.error('Get user conversations error:', error);
    return createResponse(500, { error: 'Failed to fetch conversations' });
  }
};

// Get conversation messages
exports.getConversationMessages = async (event) => {
  try {
    const { conversationId } = event.pathParameters;
    
    // Mock data - replace with DynamoDB query
    const mockMessages = [
      {
        id: uuidv4(),
        content: 'Hello, how can I help you today?',
        timestamp: new Date(),
        sender: 'ai',
        userId: null
      }
    ];

    return createResponse(200, mockMessages);
  } catch (error) {
    console.error('Get conversation messages error:', error);
    return createResponse(500, { error: 'Failed to fetch messages' });
  }
};

// Get messages (alternative endpoint)
exports.getMessages = async (event) => {
  try {
    const { conversationId } = event.pathParameters;
    
    // Mock data - replace with DynamoDB query
    const mockMessages = [
      {
        id: uuidv4(),
        content: 'Hello, how can I help you today?',
        timestamp: new Date(),
        sender: 'ai',
        userId: null
      }
    ];

    return createResponse(200, mockMessages);
  } catch (error) {
    console.error('Get messages error:', error);
    return createResponse(500, { error: 'Failed to fetch messages' });
  }
};

// Create conversation
exports.createConversation = async (event) => {
  try {
    const { userId, title } = JSON.parse(event.body);
    const conversationId = uuidv4();
    
    const newConversation = {
      id: conversationId,
      userId,
      title: title || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: []
    };

    // TODO: Save to DynamoDB
    
    return createResponse(201, newConversation);
  } catch (error) {
    console.error('Create conversation error:', error);
    return createResponse(500, { error: 'Failed to create conversation' });
  }
};

// Create new conversation (alternative endpoint)
exports.createNewConversation = async (event) => {
  try {
    const { userId, title } = JSON.parse(event.body);
    const conversationId = uuidv4();
    
    const newConversation = {
      id: conversationId,
      userId,
      title: title || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: []
    };

    // TODO: Save to DynamoDB
    
    return createResponse(201, newConversation);
  } catch (error) {
    console.error('Create new conversation error:', error);
    return createResponse(500, { error: 'Failed to create conversation' });
  }
};

// Update conversation title
exports.updateConversationTitle = async (event) => {
  try {
    const { conversationId } = event.pathParameters;
    const { title } = JSON.parse(event.body);
    
    if (!title) {
      return createResponse(400, { error: 'Title is required' });
    }

    // TODO: Update in DynamoDB
    
    return createResponse(200, { success: true, title });
  } catch (error) {
    console.error('Update conversation title error:', error);
    return createResponse(500, { error: 'Failed to update title' });
  }
};

// Publish thread
exports.publishThread = async (event) => {
  try {
    const { conversationId, title, category, userId, messages } = JSON.parse(event.body);
    
    if (!conversationId || !title || !userId || !messages) {
      return createResponse(400, { error: 'Missing required fields' });
    }

    const threadId = uuidv4();
    
    // TODO: Save to DynamoDB
    
    return createResponse(201, {
      success: true,
      threadId,
      title,
      category,
      questionCount: Math.floor(messages.length / 2),
      answerCount: Math.floor(messages.length / 2)
    });
  } catch (error) {
    console.error('Publish thread error:', error);
    return createResponse(500, { error: 'Failed to publish thread' });
  }
};

// Generate title
exports.generateTitle = async (event) => {
  try {
    const { message } = JSON.parse(event.body);
    
    if (!message) {
      return createResponse(400, { error: 'Message is required' });
    }

    // Simple title generation - first 6 words
    const title = message.split(' ').slice(0, 6).join(' ');
    
    return createResponse(200, { title });
  } catch (error) {
    console.error('Generate title error:', error);
    return createResponse(500, { error: 'Failed to generate title' });
  }
};

// Chat stream endpoint
exports.chatStream = async (event) => {
  try {
    const { message, conversationId, userId } = JSON.parse(event.body);
    
    if (!message) {
      return createResponse(400, { error: 'Message is required' });
    }

    // For now, return a simple response
    // TODO: Implement actual streaming with DeepSeek
    const response = {
      id: uuidv4(),
      content: `This is a response to: ${message}`,
      sender: 'ai',
      timestamp: new Date()
    };

    return createResponse(200, response, {
      'Content-Type': 'application/json'
    });
  } catch (error) {
    console.error('Chat stream error:', error);
    return createResponse(500, { error: 'Failed to process chat' });
  }
};

// CORS preflight handler
exports.corsHandler = async (event) => {
  return createResponse(200, '', {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Max-Age': '86400'
  });
};