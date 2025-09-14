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
app.use(cors());
app.use(express.json());

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
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Private message handling
  socket.on('private_message', async (data) => {
    const { conversationId, message } = data;
    
    try {
      // Save user message
      const userMessageId = uuidv4();
      const userMessage = {
        id: userMessageId,
        conversationId,
        content: message,
        sender: 'user',
        timestamp: new Date().toISOString()
      };

      db.run(
        'INSERT INTO messages (id, conversation_id, content, sender, created_at) VALUES (?, ?, ?, ?, ?)',
        [userMessageId, conversationId, message, 'user', new Date().toISOString()]
      );

      // Get conversation history
      db.all(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
        [conversationId],
        async (err, messages) => {
          if (err) {
            console.error('Database error:', err);
            return;
          }

          // Prepare messages for AI
          const chatMessages = messages.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.content
          }));

          try {
            // Stream AI response
            const result = await streamText({
              model: deepseek('deepseek-reasoner'),
              system: "You are a helpful assistant that provides thoughtful and accurate responses.",
              messages: chatMessages,
            });

            let fullContent = '';
            let thinking = '';

            // Stream response back to client
            for await (const delta of result.fullStream) {
              switch (delta.type) {
                case 'text-delta':
                  if (delta.textDelta) {
                    fullContent += delta.textDelta;
                    socket.emit('ai_content_delta', {
                      conversationId,
                      content: delta.textDelta
                    });
                  }
                  break;
                case 'reasoning-delta':
                  if (delta.text) {
                    thinking += delta.text;
                    socket.emit('ai_thinking_delta', {
                      conversationId,
                      thinking: delta.text
                    });
                  }
                  break;
              }
            }

            // Save AI response
            const aiMessageId = uuidv4();
            db.run(
              'INSERT INTO messages (id, conversation_id, content, sender, created_at) VALUES (?, ?, ?, ?, ?)',
              [aiMessageId, conversationId, fullContent, 'ai', new Date().toISOString()]
            );

            // Send completion
            socket.emit('ai_response_complete', {
              conversationId,
              message: {
                id: aiMessageId,
                content: fullContent,
                sender: 'ai',
                timestamp: new Date().toISOString()
              }
            });

          } catch (aiError) {
            console.error('AI error:', aiError);
            socket.emit('error', { message: 'Failed to get AI response' });
          }
        }
      );

    } catch (error) {
      console.error('Message handling error:', error);
      socket.emit('error', { message: 'Failed to process message' });
    }
  });

  // Thread management
  socket.on('join_thread', (data) => {
    socket.join(data.threadId);
  });

  socket.on('leave_thread', (data) => {
    socket.leave(data.threadId);
  });

  socket.on('add_answer', async (data) => {
    const { threadId, questionId, content } = data;
    const answerId = uuidv4();

    db.run(
      'INSERT INTO answers (id, question_id, content, user_id, created_at) VALUES (?, ?, ?, ?, ?)',
      [answerId, questionId, content, socket.userId, new Date().toISOString()],
      function(err) {
        if (err) {
          console.error('Database error:', err);
          return;
        }

        const answer = {
          id: answerId,
          questionId,
          content,
          userId: socket.userId,
          isAI: false,
          isPinned: false,
          interactionCount: 0,
          timestamp: new Date()
        };

        io.to(threadId).emit('new_answer', { threadId, answer });
      }
    );
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// REST API endpoints
app.get('/api/threads', (req, res) => {
  const { filter = 'recent' } = req.query;
  
  let orderBy = 'created_at DESC';
  if (filter === 'trending') {
    orderBy = 'updated_at DESC';
  }

  db.all(
    `SELECT t.*, u.name as creator_name, u.avatar as creator_avatar, u.handle as creator_handle
     FROM threads t 
     JOIN users u ON t.creator_id = u.id 
     WHERE t.is_public = 1 
     ORDER BY ${orderBy} 
     LIMIT 20`,
    (err, threads) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to fetch threads' });
      }
      res.json(threads);
    }
  );
});

app.get('/api/conversations/:userId', (req, res) => {
  const { userId } = req.params;
  
  db.all(
    'SELECT * FROM private_conversations WHERE user_id = ? ORDER BY updated_at DESC',
    [userId],
    (err, conversations) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to fetch conversations' });
      }
      res.json(conversations);
    }
  );
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Ainigama server running on port ${PORT}`);
});