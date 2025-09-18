const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const sqlite3 = require('sqlite3').verbose();
const { deepseek } = require('@ai-sdk/deepseek');
const { streamText } = require('ai');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true
}));
app.use(express.json());

// Serve static files and handle root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Ainigama Backend Server',
    status: 'running',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      threads: '/api/threads',
      conversations: '/api/conversations/:userId'
    }
  });
});

// Database setup
const db = new sqlite3.Database('./ainigama.db');

// Initialize database tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    avatar TEXT,
    handle TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Private conversations
  db.run(`CREATE TABLE IF NOT EXISTS private_conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Messages
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    content TEXT NOT NULL,
    sender TEXT NOT NULL CHECK (sender IN ('user', 'ai')),
    user_id TEXT,
    thinking TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES private_conversations (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Public threads
  db.run(`CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    category TEXT,
    is_public BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creator_id) REFERENCES users (id)
  )`);

  // Questions
  db.run(`CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    content TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (thread_id) REFERENCES threads (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Answers
  db.run(`CREATE TABLE IF NOT EXISTS answers (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL,
    content TEXT NOT NULL,
    user_id TEXT,
    is_ai BOOLEAN DEFAULT 0,
    is_pinned BOOLEAN DEFAULT 0,
    interaction_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (question_id) REFERENCES questions (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Comments
  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    answer_id TEXT NOT NULL,
    content TEXT NOT NULL,
    user_id TEXT NOT NULL,
    parent_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (answer_id) REFERENCES answers (id),
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (parent_id) REFERENCES comments (id)
  )`);

  // WebSocket connections tracking
  db.run(`CREATE TABLE IF NOT EXISTS connections (
    connection_id TEXT PRIMARY KEY,
    user_id TEXT,
    thread_id TEXT,
    connected_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Store active connections
const activeConnections = new Map();

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Store connection
  activeConnections.set(socket.id, {
    socket,
    userId: null,
    threadId: null
  });

  // Handle user authentication
  socket.on('authenticate', (data) => {
    const connection = activeConnections.get(socket.id);
    if (connection) {
      connection.userId = data.userId;
      activeConnections.set(socket.id, connection);
    }
  });

  // Save conversation (both user and AI messages)
  socket.on('save_conversation', async (data) => {
    const { conversationId, messages } = data;
    
    console.log('💾 Saving conversation:', conversationId);
    console.log('📝 Messages to save:', messages.map(m => ({
      id: m.id,
      sender: m.sender,
      hasThinking: !!m.thinking,
      thinkingLength: m.thinking ? m.thinking.length : 0
    })));
    
    try {
      // First, ensure the conversation exists
      db.get('SELECT id FROM private_conversations WHERE id = ?', [conversationId], (err, row) => {
        if (err) {
          console.error('Error checking conversation:', err);
          return;
        }
        
        if (!row) {
          console.error('❌ Conversation not found:', conversationId);
          socket.emit('conversation_saved', {
            conversationId,
            success: false,
            error: 'Conversation not found'
          });
          return;
        }
        
        console.log('✅ Conversation exists:', conversationId);
        
        // Save messages one by one to ensure proper conversation association
        const saveMessage = (message, callback) => {
          console.log(`💾 Saving message ${message.id} to conversation ${conversationId}`);
          console.log(`📝 Message details: sender=${message.sender}, timestamp=${message.timestamp}`);
          
          db.run(
            'INSERT OR REPLACE INTO messages (id, conversation_id, content, sender, thinking, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [
              message.id,
              conversationId, // Ensure we use the correct conversation ID
              message.content,
              message.sender,
              message.thinking || null,
              message.timestamp || new Date().toISOString()
            ],
            function(err) {
              if (err) {
                console.error(`❌ Failed to save message ${message.id}:`, err);
                callback(err);
              } else {
                console.log(`✅ Saved message ${message.id} to conversation ${conversationId}`);
                callback(null);
              }
            }
          );
        };
        
        // Save all messages sequentially
        let savedCount = 0;
        let hasError = false;
        
        messages.forEach((message, index) => {
          saveMessage(message, (err) => {
            if (err && !hasError) {
              hasError = true;
              socket.emit('conversation_saved', {
                conversationId,
                success: false,
                error: err.message
              });
              return;
            }
            
            savedCount++;
            if (savedCount === messages.length && !hasError) {
              // Update conversation timestamp
              db.run(
                'UPDATE private_conversations SET updated_at = ? WHERE id = ?',
                [new Date().toISOString(), conversationId],
                (updateErr) => {
                  if (updateErr) {
                    console.error('Failed to update conversation timestamp:', updateErr);
                  }
                  
                  // Confirm save to client
                  socket.emit('conversation_saved', {
                    conversationId,
                    success: true
                  });
                  
                  console.log(`✅ Successfully saved ${messages.length} messages to conversation ${conversationId}`);
                }
              );
            }
          });
        });
      });
      

    } catch (error) {
      console.error('Save conversation error:', error);
      socket.emit('conversation_saved', {
        conversationId,
        success: false,
        error: error.message
      });
    }
  });

  // Thread management
  socket.on('join_thread', (data) => {
    const { threadId } = data;
    socket.join(threadId);
    
    const connection = activeConnections.get(socket.id);
    if (connection) {
      connection.threadId = threadId;
      activeConnections.set(socket.id, connection);
    }
    
    console.log(`Socket ${socket.id} joined thread ${threadId}`);
  });

  socket.on('leave_thread', (data) => {
    const { threadId } = data;
    socket.leave(threadId);
    
    const connection = activeConnections.get(socket.id);
    if (connection) {
      connection.threadId = null;
      activeConnections.set(socket.id, connection);
    }
    
    console.log(`Socket ${socket.id} left thread ${threadId}`);
  });

  socket.on('add_answer', async (data) => {
    const { threadId, questionId, content } = data;
    const answerId = uuidv4();
    const connection = activeConnections.get(socket.id);
    const userId = connection?.userId || 'anonymous';

    db.run(
      'INSERT INTO answers (id, question_id, content, user_id, created_at) VALUES (?, ?, ?, ?, ?)',
      [answerId, questionId, content, userId, new Date().toISOString()],
      function(err) {
        if (err) {
          console.error('Database error:', err);
          socket.emit('error', { message: 'Failed to add answer' });
          return;
        }

        const answer = {
          id: answerId,
          questionId,
          content,
          userId,
          isAI: false,
          isPinned: false,
          interactionCount: 0,
          timestamp: new Date()
        };

        // Broadcast to all sockets in the thread
        io.to(threadId).emit('new_answer', { threadId, answer });
      }
    );
  });

  socket.on('add_comment', async (data) => {
    const { answerId, content, parentId } = data;
    const commentId = uuidv4();
    const connection = activeConnections.get(socket.id);
    const userId = connection?.userId || 'anonymous';

    db.run(
      'INSERT INTO comments (id, answer_id, content, user_id, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [commentId, answerId, content, userId, parentId || null, new Date().toISOString()],
      function(err) {
        if (err) {
          console.error('Database error:', err);
          socket.emit('error', { message: 'Failed to add comment' });
          return;
        }

        const comment = {
          id: commentId,
          answerId,
          content,
          userId,
          parentId: parentId || null,
          timestamp: new Date()
        };

        // Broadcast to all connected sockets
        io.emit('new_comment', { answerId, comment });
      }
    );
  });

  // Typing indicators
  socket.on('typing_start', (data) => {
    const { threadId, type, targetId } = data;
    const connection = activeConnections.get(socket.id);
    if (connection && connection.userId) {
      socket.to(threadId).emit('user_typing', {
        userId: connection.userId,
        type,
        targetId
      });
    }
  });

  socket.on('typing_stop', (data) => {
    const { threadId, type, targetId } = data;
    const connection = activeConnections.get(socket.id);
    if (connection && connection.userId) {
      socket.to(threadId).emit('user_stop_typing', {
        userId: connection.userId,
        type,
        targetId
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    activeConnections.delete(socket.id);
  });
});

// REST API endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Add OPTIONS handler for CORS preflight requests
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:5173');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(200);
});

app.get('/api/threads', (req, res) => {
  const { filter = 'recent' } = req.query;
  
  let orderBy = 'created_at DESC';
  if (filter === 'trending') {
    orderBy = 'updated_at DESC';
  }

  db.all(
    `SELECT t.*, u.name as creator_name, u.avatar as creator_avatar, u.handle as creator_handle,
     (SELECT COUNT(*) FROM questions WHERE thread_id = t.id) as question_count,
     (SELECT COUNT(*) FROM answers a JOIN questions q ON a.question_id = q.id WHERE q.thread_id = t.id) as answer_count
     FROM threads t 
     LEFT JOIN users u ON t.creator_id = u.id 
     WHERE t.is_public = 1 
     ORDER BY ${orderBy} 
     LIMIT 20`,
    (err, threads) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to fetch threads' });
      }
      
      // Transform the data to match frontend expectations
      const transformedThreads = threads.map(thread => ({
        id: thread.id,
        title: thread.title,
        creator: {
          id: thread.creator_id,
          name: thread.creator_name || 'Unknown User',
          avatar: thread.creator_avatar || '/img-5.svg',
          handle: thread.creator_handle || '@user'
        },
        isPublic: Boolean(thread.is_public),
        createdAt: new Date(thread.created_at),
        updatedAt: new Date(thread.updated_at),
        questionCount: thread.question_count || 0,
        answerCount: thread.answer_count || 0,
        interactionCount: (thread.question_count || 0) + (thread.answer_count || 0),
        questions: [],
        category: thread.category
      }));
      
      // Return consistent format with threads wrapped in an object
      res.json({ threads: transformedThreads });
    }
  );
});

app.get('/api/users/:userId/conversations', (req, res) => {
  const { userId } = req.params;
  
  db.all(
    `SELECT c.*, 
     (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
     (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
     FROM private_conversations c 
     WHERE c.user_id = ? 
     ORDER BY c.updated_at DESC`,
    [userId],
    (err, conversations) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to fetch conversations' });
      }
      
      // Transform the data to match frontend expectations
      const transformedConversations = conversations.map(conv => ({
        id: conv.id,
        userId: conv.user_id,
        title: conv.title,
        createdAt: new Date(conv.created_at),
        updatedAt: new Date(conv.updated_at),
        messages: [] // Messages will be loaded separately when needed
      }));
      
      res.json(transformedConversations);
    }
  );
});

app.get('/api/conversations/:conversationId/messages', (req, res) => {
  const { conversationId } = req.params;
  
  console.log('🔍 Loading messages for conversation:', conversationId);
  
  db.all(
    'SELECT id, conversation_id, content, sender, user_id, thinking, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
    [conversationId],
    (err, messages) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to fetch messages' });
      }
      
      console.log('📨 Loaded messages for conversation:', conversationId, {
        messageCount: messages.length,
        messagesWithThinking: messages.filter(m => m.thinking).length,
        messageIds: messages.map(m => m.id)
      });
      
      // Transform the data to match frontend expectations
      const transformedMessages = messages.map(msg => ({
        id: msg.id,
        content: msg.content,
        timestamp: new Date(msg.created_at),
        sender: msg.sender,
        userId: msg.user_id,
        thinking: msg.thinking ? msg.thinking : undefined
      }));
      
      console.log('📤 Sending transformed messages:', transformedMessages.map(m => ({
        id: m.id,
        sender: m.sender,
        hasThinking: !!m.thinking,
        conversationId: conversationId
      })));
      
      res.json(transformedMessages);
    }
  );
});

app.post('/api/conversations', (req, res) => {
  const { userId, title } = req.body;
  const conversationId = uuidv4();
  
  db.run(
    'INSERT INTO private_conversations (id, user_id, title, created_at,