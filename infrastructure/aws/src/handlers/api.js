// Main API handler file - now imports from domain-specific modules
const auth = require('./auth');
const threads = require('./threads');
const conversations = require('./conversations');
const questions = require('./questions');

// Re-export all handlers for serverless.yml compatibility
module.exports = {
  // Authentication handlers
  checkUserExists: auth.checkUserExists,
  registerUser: auth.registerUser,
  loginUser: auth.loginUser,
  checkAlias: auth.checkAlias,

  // Thread handlers
  getThreads: threads.getThreads,
  createThread: threads.createThread,
  getThread: threads.getThread,
  getThreadAnswers: threads.getThreadAnswers,

  // Conversation handlers
  getUserConversations: conversations.getUserConversations,
  getMessages: conversations.getMessages,
  createNewConversation: conversations.createNewConversation,
  saveMessages: conversations.saveMessages,
  updateConversationTitle: conversations.updateConversationTitle,
  deleteConversation: conversations.deleteConversation,

  // Question and Answer handlers
  addQuestion: questions.addQuestion,
  addAnswer: questions.addAnswer,
  getAnswerComments: questions.getAnswerComments,
  addAnswerComment: questions.addAnswerComment
};