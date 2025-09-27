const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
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
    alias TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar TEXT,
    handle TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Create index on alias for fast lookups
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_alias ON users(alias)`);

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
    thinking TEXT,
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
      
      // Store or update user information in database
      if (data.user) {
        console.log('👤 Storing user info:', data.user.name, data.user.email);
        db.run(
          'INSERT OR REPLACE INTO users (id, name, email, alias, avatar, handle, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [data.user.id, data.user.name, data.user.email, data.user.alias, data.user.avatar, data.user.handle, new Date().toISOString()],
          function(err) {
            if (err) {
              console.error('Failed to store user info:', err);
            } else {
              console.log('✅ Successfully stored user info for:', data.user.name);
            }
          }
        );
      }
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
          timestamp: new Date().toISOString()
        };

        console.log('📤 Broadcasting new comment:', commentId, 'for answer:', answerId);
        
        // Broadcast to all connected sockets with delay to prevent race conditions
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

// Check if user exists
app.post('/api/check-user-exists', (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  
  db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to check user existence' });
    }
    
    res.json({ exists: !!row });
  });
});

// User registration
app.post('/api/register', async (req, res) => {
  const { name, email, alias, password } = req.body;
  
  if (!name || !email || !alias || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  
  try {
    // Check if user already exists
    const existingUser = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM users WHERE email = ? OR alias = ?', [email.toLowerCase(), alias.toLowerCase()], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email or username already exists' });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create user
    const userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const handle = `@${alias}`;
    
    db.run(
      'INSERT INTO users (id, name, email, alias, password_hash, avatar, handle, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, name, email.toLowerCase(), alias.toLowerCase(), passwordHash, '/img-5.svg', handle, new Date().toISOString()],
      function(err) {
        if (err) {
          console.error('Failed to create user:', err);
          return res.status(500).json({ error: 'Failed to create user account' });
        }
        
        const user = {
          id: userId,
          name,
          email: email.toLowerCase(),
          alias: alias.toLowerCase(),
          avatar: '/img-5.svg',
          handle
        };
        
        console.log('✅ User registered successfully:', email);
        res.json({ user });
      }
    );
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// User login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  
  try {
    db.get(
      'SELECT id, name, email, alias, password_hash, avatar, handle FROM users WHERE email = ?',
      [email.toLowerCase()],
      async (err, user) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Login failed' });
        }
        
        if (!user) {
          return res.status(401).json({ error: 'Invalid email or password' });
        }
        
        // Verify password
        const passwordValid = await bcrypt.compare(password, user.password_hash);
        if (!passwordValid) {
          return res.status(401).json({ error: 'Invalid email or password' });
        }
        
        // Return user data (without password hash)
        const userData = {
          id: user.id,
          name: user.name,
          email: user.email,
          alias: user.alias,
          avatar: user.avatar,
          handle: user.handle
        };
        
        console.log('✅ User logged in successfully:', email);
        res.json({ user: userData });
      }
    );
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Check alias availability
app.get('/api/check-alias/:alias', (req, res) => {
  const { alias } = req.params;
  
  if (!alias || alias.length < 3) {
    return res.status(400).json({ error: 'Alias must be at least 3 characters' });
  }
  
  if (!/^[a-z0-9_]+$/.test(alias)) {
    return res.status(400).json({ error: 'Alias can only contain lowercase letters, numbers, and underscores' });
  }
  
  db.get('SELECT id FROM users WHERE alias = ?', [alias], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to check alias availability' });
    }
    
    res.json({ available: !row });
  });
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
    `SELECT t.*, 
     COALESCE(u.name, 'Unknown User') as creator_name,
     COALESCE(u.alias, 'unknown') as creator_alias,
     COALESCE(u.avatar, '/img-5.svg') as creator_avatar, 
     COALESCE(u.handle, '@unknown') as creator_handle,
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
          name: thread.creator_name,
          alias: thread.creator_alias,
          avatar: thread.creator_avatar || '/img-5.svg',
          handle: thread.creator_handle || '@unknown'
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

// Create new public thread
app.post('/api/threads', (req, res) => {
  const { title, creatorId, category, questions, initialAnswers } = req.body;
  
  if (!title || !creatorId || !questions || questions.length === 0) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const threadId = uuidv4();
  const now = new Date().toISOString();
  
  // Get user information for the creator
  db.get('SELECT name, avatar, handle FROM users WHERE id = ?', [creatorId], (userErr, user) => {
    if (userErr) {
      console.error('Failed to get user info:', userErr);
    }
    
    const creatorInfo = user || {
      name: 'Unknown User',
      alias: 'unknown',
      avatar: '/img-5.svg',
      handle: '@unknown'
    };
    
  // Start transaction
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    // Insert thread
    db.run(
      'INSERT INTO threads (id, title, creator_id, category, is_public, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [threadId, title, creatorId, category || 'General', 1, now, now],
      function(err) {
        if (err) {
          console.error('Failed to create thread:', err);
          db.run('ROLLBACK');
          return res.status(500).json({ error: 'Failed to create thread' });
        }
        
        console.log('✅ Created thread:', threadId);
        
        // Insert questions
        let questionsInserted = 0;
        const totalQuestions = questions.length;
        
        questions.forEach((question, index) => {
          const questionId = question.id || uuidv4();
          
          db.run(
            'INSERT INTO questions (id, thread_id, content, user_id, created_at) VALUES (?, ?, ?, ?, ?)',
            [questionId, threadId, question.content, question.userId, question.timestamp || now],
            function(questionErr) {
              if (questionErr) {
                console.error('Failed to create question:', questionErr);
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Failed to create questions' });
              }
              
              console.log('✅ Created question:', questionId);
              questionsInserted++;
              
              // Insert corresponding AI answer if exists
              const correspondingAnswer = initialAnswers?.find(a => a.questionId === question.id);
              if (correspondingAnswer) {
                const answerId = correspondingAnswer.id || uuidv4();
                
                db.run(
                  'INSERT INTO answers (id, question_id, content, user_id, is_ai, is_pinned, thinking, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                  [answerId, questionId, correspondingAnswer.content, null, 1, 1, correspondingAnswer.thinking || null, correspondingAnswer.timestamp || now],
                  function(answerErr) {
                    if (answerErr) {
                      console.error('Failed to create answer:', answerErr);
                    } else {
                      console.log('✅ Created AI answer:', answerId);
                    }
                    
                    // Check if all questions are processed
                    if (questionsInserted === totalQuestions) {
                      db.run('COMMIT', (commitErr) => {
                        if (commitErr) {
                          console.error('Failed to commit transaction:', commitErr);
                          return res.status(500).json({ error: 'Failed to save thread' });
                        }
                        
                        // Return the created thread
                        const newThread = {
                          id: threadId,
                          title,
                          creator: {
                            id: creatorId,
                            name: creatorInfo.name,
                            alias: creatorInfo.alias,
                            avatar: creatorInfo.avatar,
                            handle: creatorInfo.handle
                          },
                          isPublic: true,
                          createdAt: new Date(now),
                          updatedAt: new Date(now),
                          questionCount: questions.length,
                          answerCount: initialAnswers?.length || 0,
                          interactionCount: questions.length + (initialAnswers?.length || 0),
                          questions: questions.map(q => ({
                            id: q.id || uuidv4(),
                            content: q.content,
                            timestamp: new Date(q.timestamp || now),
                            userId: q.userId,
                            threadId
                          })),
                          category: category || 'General'
                        };
                        
                        console.log('🎉 Successfully created public thread:', threadId);
                        res.json(newThread);
                      });
                    }
                  }
                );
              } else {
                // No corresponding answer, check if all questions are processed
                if (questionsInserted === totalQuestions) {
                  db.run('COMMIT', (commitErr) => {
                    if (commitErr) {
                      console.error('Failed to commit transaction:', commitErr);
                      return res.status(500).json({ error: 'Failed to save thread' });
                    }
                    
                    // Return the created thread
                    const newThread = {
                      id: threadId,
                      title,
                      creator: {
                        id: creatorId,
                        name: creatorInfo.name,
                        avatar: creatorInfo.avatar,
                        handle: creatorInfo.handle
                      },
                      isPublic: true,
                      createdAt: new Date(now),
                      updatedAt: new Date(now),
                      questionCount: questions.length,
                      answerCount: 0,
                      interactionCount: questions.length,
                      questions: questions.map(q => ({
                        id: q.id || uuidv4(),
                        content: q.content,
                        timestamp: new Date(q.timestamp || now),
                        userId: q.userId,
                        threadId
                      })),
                      category: category || 'General'
                    };
                    
                    console.log('🎉 Successfully created public thread:', threadId);
                    res.json(newThread);
                  });
                }
              }
            }
          );
        });
      }
    );
  });
  });
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
    'INSERT INTO private_conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [conversationId, userId, title || null, new Date().toISOString(), new Date().toISOString()],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to create conversation' });
      }
      
      res.json({
        id: conversationId,
        userId,
        title,
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: []
      });
    }
  );
});

app.get('/api/threads/:threadId', (req, res) => {
  const { threadId } = req.params;
  
  // Get thread with questions and answers
  db.get(
    `SELECT t.*, 
     COALESCE(u.name, 'Unknown User') as creator_name, 
     COALESCE(u.avatar, '/img-5.svg') as creator_avatar, 
     COALESCE(u.handle, '@unknown') as creator_handle
     FROM threads t 
     LEFT JOIN users u ON t.creator_id = u.id 
     WHERE t.id = ?`,
    [threadId],
    (err, thread) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to fetch thread' });
      }
      
      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }
      
      // Get questions for this thread
      db.all(
        'SELECT * FROM questions WHERE thread_id = ? ORDER BY datetime(created_at) DESC',
        [threadId],
        (err, questions) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Failed to fetch questions' });
          }
          
          const transformedThread = {
            id: thread.id,
            title: thread.title,
            creator: {
              id: thread.creator_id,
              name: thread.creator_name,
              avatar: thread.creator_avatar || '/img-5.svg',
              handle: thread.creator_handle || '@user'
            },
            isPublic: Boolean(thread.is_public),
            createdAt: new Date(thread.created_at),
            updatedAt: new Date(thread.updated_at),
            questionCount: questions.length,
            answerCount: 0, // Will be calculated
            interactionCount: 0, // Will be calculated
            questions: questions.map(q => ({
              id: q.id,
              content: q.content,
              timestamp: new Date(q.created_at),
              userId: q.user_id,
              threadId: q.thread_id
            })),
            category: thread.category
          };
          
          res.json(transformedThread);
        }
      );
    }
  );
});

// Get answers for a specific thread
app.get('/api/threads/:threadId/answers', (req, res) => {
  const { threadId } = req.params;
  
  db.all(
    `SELECT a.*, q.thread_id, a.thinking
     FROM answers a 
     JOIN questions q ON a.question_id = q.id 
     WHERE q.thread_id = ? 
     ORDER BY a.is_pinned DESC, a.created_at ASC`,
    [threadId],
    (err, answers) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to fetch answers' });
      }
      
      // Group answers by question ID
      const answersByQuestion = {};
      answers.forEach(answer => {
        if (!answersByQuestion[answer.question_id]) {
          answersByQuestion[answer.question_id] = [];
        }
        
        answersByQuestion[answer.question_id].push({
          id: answer.id,
          content: answer.content,
          timestamp: new Date(answer.created_at),
          userId: answer.user_id,
          questionId: answer.question_id,
          isPinned: Boolean(answer.is_pinned),
          isAI: Boolean(answer.is_ai),
          thinking: answer.thinking || null,
          interactionCount: answer.interaction_count || 0
        });
      });
      
      res.json(answersByQuestion);
    }
  );
});

// Get comments for a specific answer
app.get('/api/answers/:answerId/comments', (req, res) => {
  // Allow guest access - no authentication required
  const { answerId } = req.params;
  
  db.all(
    `SELECT c.*, 
     (SELECT json_group_array(
       json_object(
         'id', r.id,
         'content', r.content,
         'userId', r.user_id,
         'parentId', r.parent_id,
         'timestamp', r.created_at
       )
     ) FROM comments r WHERE r.parent_id = c.id) as replies_json
     FROM comments c 
     WHERE c.answer_id = ? AND c.parent_id IS NULL 
     ORDER BY c.created_at ASC`,
    [answerId],
    (err, comments) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to fetch comments' });
      }
      
      // Transform the data to include nested replies
      const transformedComments = comments.map(comment => {
        let replies = [];
        try {
          if (comment.replies_json && comment.replies_json !== '[null]') {
            replies = JSON.parse(comment.replies_json).filter(r => r.id !== null);
          }
        } catch (parseError) {
          console.error('Error parsing replies:', parseError);
        }
        
        return {
          id: comment.id,
          content: comment.content,
          timestamp: new Date(comment.created_at),
          userId: comment.user_id,
          answerId: comment.answer_id,
          parentId: comment.parent_id,
          replies: replies.map(reply => ({
            ...reply,
            timestamp: new Date(reply.timestamp)
          }))
        };
      });
      
      res.json(transformedComments);
    }
  );
});

// Add comment to answer
app.post('/api/answers/:answerId/comments', (req, res) => {
  const { answerId } = req.params;
  const { content, userId, parentId } = req.body;
  
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Comment content is required' });
  }
  
  // Require authentication for all comments
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  
  // Verify answer exists
  db.get('SELECT id FROM answers WHERE id = ?', [answerId], (err, answer) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to verify answer' });
    }
    
    if (!answer) {
      return res.status(404).json({ error: 'Answer not found' });
    }
    
    const commentId = uuidv4();
    const now = new Date().toISOString();
    
    db.run(
      'INSERT INTO comments (id, answer_id, content, user_id, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [commentId, answerId, content.trim(), userId, parentId || null, now],
      function(err) {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to add comment' });
        }
        
        // Update answer interaction count
        db.run(
          'UPDATE answers SET interaction_count = interaction_count + 1 WHERE id = ?',
          [answerId],
          (updateErr) => {
            if (updateErr) {
              console.error('Failed to update interaction count:', updateErr);
            }
            
            const newComment = {
              id: commentId,
              content: content.trim(),
              timestamp: now,
              userId: userId,
              answerId: answerId,
              parentId: parentId || null,
              replies: []
            };
            
            console.log('✅ Created comment:', commentId, 'for answer:', answerId);
            res.json(newComment);
          }
        );
      }
    );
  });
});

app.get('/api/user-conversations/:userId', (req, res) => {
  const { userId } = req.params;
  
  db.all(
    `SELECT c.*, 
     (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
     (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
     FROM private_conversations c 
     WHERE c.user_id = ? 
     ORDER BY datetime(c.updated_at) DESC`,
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

app.post('/api/new-conversation', (req, res) => {
  const { userId, title } = req.body;
  const conversationId = uuidv4();
  
  db.run(
    'INSERT INTO private_conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [conversationId, userId, title || null, new Date().toISOString(), new Date().toISOString()],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to create conversation' });
      }
      
      res.json({
        id: conversationId,
        userId,
        title,
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: []
      });
    }
  );
});

app.get('/api/messages/:conversationId', (req, res) => {
  const { conversationId } = req.params;
  
  console.log('🔍 Loading messages for conversation:', conversationId);
  
  db.all(
    'SELECT id, conversation_id, content, sender, user_id, thinking, created_at FROM messages WHERE conversation_id = ? ORDER BY datetime(created_at) ASC, id ASC',
    [conversationId],
    (err, messages) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to fetch messages' });
      }
      
      console.log('📨 Loaded messages for conversation:', conversationId, {
        messageCount: messages.length,
        messagesWithThinking: messages.filter(m => m.thinking).length,
        messageIds: messages.map(m => m.id),
        messageOrder: messages.map(m => ({ id: m.id, sender: m.sender, timestamp: m.created_at }))
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
        conversationId: conversationId,
        timestamp: m.timestamp
      })));
      
      res.json(transformedMessages);
    }
  );
});

// Update conversation title
app.put('/api/conversations/:conversationId/title', (req, res) => {
  // Add CORS headers
  const origin = req.headers.origin;
  if (origin && (origin.includes('.webcontainer-api.io') || origin.includes('.bolt.host') || origin === (process.env.FRONTEND_URL || 'http://localhost:5173') || origin === 'https://ainigama-bixt.bolt.host')) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  const { conversationId } = req.params;
  const { title } = req.body;
  
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }
  
  db.run(
    'UPDATE private_conversations SET title = ?, updated_at = ? WHERE id = ?',
    [title, new Date().toISOString(), conversationId],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to update title' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      
      console.log('✅ Updated conversation title:', conversationId, title);
      res.json({ success: true, title });
    }
  );
});

// Delete conversation
app.delete('/api/conversations/:conversationId', (req, res) => {
  const { conversationId } = req.params;
  
  if (!conversationId) {
    return res.status(400).json({ error: 'Conversation ID is required' });
  }
  
  // Start transaction to delete conversation and all its messages
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    // First, delete all messages in the conversation
    db.run(
      'DELETE FROM messages WHERE conversation_id = ?',
      [conversationId],
      function(err) {
        if (err) {
          console.error('Failed to delete messages:', err);
          db.run('ROLLBACK');
          return res.status(500).json({ error: 'Failed to delete conversation messages' });
        }
        
        console.log('✅ Deleted', this.changes, 'messages for conversation:', conversationId);
        
        // Then delete the conversation itself
        db.run(
          'DELETE FROM private_conversations WHERE id = ?',
          [conversationId],
          function(err) {
            if (err) {
              console.error('Failed to delete conversation:', err);
              db.run('ROLLBACK');
              return res.status(500).json({ error: 'Failed to delete conversation' });
            }
            
            if (this.changes === 0) {
              db.run('ROLLBACK');
              return res.status(404).json({ error: 'Conversation not found' });
            }
            
            // Commit the transaction
            db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                console.error('Failed to commit transaction:', commitErr);
                return res.status(500).json({ error: 'Failed to delete conversation' });
              }
              
              console.log('✅ Successfully deleted conversation:', conversationId);
              res.json({ success: true, message: 'Conversation deleted successfully' });
            });
          }
        );
      }
    );
  });
});

// Add question to thread
app.post('/api/threads/:threadId/questions', (req, res) => {
  const { threadId } = req.params;
  const { content, userId } = req.body;
  
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Question content is required' });
  }
  
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  
  // Verify thread exists
  db.get('SELECT id FROM threads WHERE id = ?', [threadId], (err, thread) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to verify thread' });
    }
    
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }
    
    const questionId = uuidv4();
    const now = new Date().toISOString();
    
    db.run(
      'INSERT INTO questions (id, thread_id, content, user_id, created_at) VALUES (?, ?, ?, ?, ?)',
      [questionId, threadId, content.trim(), userId, now],
      function(err) {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to add question' });
        }
        
        // Update thread timestamp and question count
        db.run(
          'UPDATE threads SET updated_at = ?, question_count = COALESCE(question_count, 0) + 1 WHERE id = ?',
          [now, threadId],
          (updateErr) => {
            if (updateErr) {
              console.error('Failed to update thread:', updateErr);
            }
            
            const newQuestion = {
              id: questionId,
              content: content.trim(),
              timestamp: now,
              userId: userId,
              threadId: threadId
            };
            
            console.log('✅ Created question:', questionId, 'for thread:', threadId);
            res.json(newQuestion);
          }
        );
      }
    );
  });
});

// Add answer to question
app.post('/api/questions/:questionId/answers', (req, res) => {
  const { questionId } = req.params;
  const { content, userId, isAI, isPinned, thinking } = req.body;
  
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Answer content is required' });
  }
  
  // Require authentication for non-AI answers
  if (!isAI && !userId) {
    return res.status(401).json({ error: 'Authentication required to add answers' });
  }
  
  // Verify question exists and get thread info
  db.get(
    'SELECT q.*, t.id as thread_id FROM questions q JOIN threads t ON q.thread_id = t.id WHERE q.id = ?',
    [questionId],
    (err, question) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to verify question' });
      }
      
      if (!question) {
        return res.status(404).json({ error: 'Question not found' });
      }
      
      // If this is an AI answer, get full thread context
      let aiContent = content;
      let aiThinking = thinking;
      
      if (isAI) {
        try {
          // Get all questions and answers in this thread for context
          const threadContext = await new Promise((resolve, reject) => {
            db.all(`
              SELECT 
                q.id as question_id,
                q.content as question_content,
                q.created_at as question_created_at,
                a.id as answer_id,
                a.content as answer_content,
                a.is_ai as answer_is_ai,
                a.created_at as answer_created_at
              FROM questions q
              LEFT JOIN answers a ON q.id = a.question_id
              WHERE q.thread_id = ?
              ORDER BY q.created_at ASC, a.created_at ASC
            `, [question.thread_id], (err, rows) => {
              if (err) reject(err);
              else resolve(rows);
            });
          });
          
          // Build conversation context
          const contextMessages = [];
          const processedQuestions = new Set();
          
          for (const row of threadContext) {
            // Add question if not already processed
            if (!processedQuestions.has(row.question_id)) {
              contextMessages.push({
                role: 'user',
                content: row.question_content
              });
              processedQuestions.add(row.question_id);
            }
            
            // Add answer if exists
            if (row.answer_id && row.answer_content) {
              contextMessages.push({
                role: 'assistant',
                content: row.answer_content
              });
            }
          }
          
          // Add the current question if not already in context
          if (!processedQuestions.has(questionId)) {
            contextMessages.push({
              role: 'user',
              content: question.content
            });
          }
          
          console.log('🧠 AI answering with thread context:', contextMessages.length, 'messages');
          
          // Generate AI response with full context
          const { deepSeekService } = require('../../../src/services/deepseek');
          
          // Use streaming to get both content and thinking
          let fullContent = '';
          let fullThinking = '';
          
          await new Promise((resolve, reject) => {
            deepSeekService.streamChat(contextMessages, {
              onThinking: (thinkingDelta) => {
                fullThinking += thinkingDelta;
              },
              onContent: (contentDelta) => {
                fullContent += contentDelta;
              },
              onComplete: (finalContent) => {
                aiContent = finalContent;
                aiThinking = fullThinking;
                resolve();
              },
              onError: (error) => {
                console.error('AI generation error:', error);
                aiContent = `I apologize, but I encountered an error while generating a response: ${error.message}`;
                aiThinking = null;
                resolve();
              }
            });
          });
          
        } catch (contextError) {
          console.error('Failed to get thread context for AI:', contextError);
          // Continue with original content if context retrieval fails
        }
      }
      const answerId = uuidv4();
      const now = new Date().toISOString();
      
      console.log('💾 Saving answer with AI data:', {
        answerId,
        isAI: Boolean(isAI),
        isPinned: Boolean(isPinned),
        hasThinking: !!aiThinking
      });
      
      db.run(
        'INSERT INTO answers (id, question_id, content, user_id, is_ai, is_pinned, interaction_count, thinking, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [answerId, questionId, aiContent.trim(), userId || null, Boolean(isAI) ? 1 : 0, Boolean(isPinned) ? 1 : 0, 0, aiThinking || null, now],
        function(err) {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Failed to add answer' });
          }
          
          console.log('✅ Answer saved successfully:', {
            answerId,
            isAI: Boolean(isAI),
            isPinned: Boolean(isPinned),
            thinkingLength: aiThinking ? aiThinking.length : 0
          });
          
          // Update thread timestamp and answer count
          db.run(
            'UPDATE threads SET updated_at = ?, answer_count = COALESCE(answer_count, 0) + 1 WHERE id = ?',
            [now, question.thread_id],
            (updateErr) => {
              if (updateErr) {
                console.error('Failed to update thread:', updateErr);
              }
              
              const newAnswer = {
                id: answerId,
                content: aiContent.trim(),
                timestamp: now,
                userId: userId || null,
                questionId: questionId,
                isPinned: Boolean(isPinned),
                isAI: Boolean(isAI),
                thinking: aiThinking || null,
                interactionCount: 0
              };
              
              console.log('✅ Created answer:', answerId, 'for question:', questionId);
              res.json({
                success: true,
                answer: newAnswer,
                threadId: question.thread_id
              });
            }
          );
        }
      );
    });
  );
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  console.log('404 - Route not found:', req.method, req.url);
  res.status(404).json({ 
    error: 'Route not found',
    method: req.method,
    url: req.url,
    availableRoutes: [
      'GET /',
      'GET /api/health',
      'GET /api/threads',
      'GET /api/conversations/:userId',
      'GET /api/conversations/:conversationId/messages',
      'POST /api/conversations',
      'GET /api/threads/:threadId'
    ]
  });
});

const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
  console.log(`🚀 Ainigama server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`🔑 DeepSeek API configured: ${process.env.DEEPSEEK_API_KEY ? 'Yes' : 'No'}`);
});