// Main API handler file - now imports from domain-specific modules
const auth = require('./auth');
const threads = require('./threads');
const conversations = require('./conversations');
const questions = require('./questions');
const metrics = require('./metrics');

// Re-export all handlers for serverless.yml compatibility
module.exports = {
  // Authentication handlers
  checkUserExists: auth.checkUserExists,
  registerUser: auth.registerUser,
  loginUser: auth.loginUser,
  checkAlias: auth.checkAlias,
  getUserById: auth.getUserById,
  updatePassword: auth.updatePassword,

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
  getAnswerById: questions.getAnswerById,
  getAnswerComments: questions.getAnswerComments,
  addAnswerComment: questions.addAnswerComment,

  // Metrics handlers
  trackView: metrics.trackView,
  toggleLike: metrics.toggleLike,
  getLikes: metrics.getLikes,
  toggleSave: metrics.toggleSave,
  trackShare: metrics.trackShare,
  getShares: metrics.getShares,
  getUserInteractionsForThread: metrics.getUserInteractionsForThread,
  getUserSaves: metrics.getUserSaves,
  getUserLikes: metrics.getUserLikes,
  getUserReplies: metrics.getUserReplies,
  getUserDashboard: metrics.getUserDashboard,
  getUserStats: metrics.getUserStats
};