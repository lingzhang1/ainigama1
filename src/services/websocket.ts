import { io, Socket } from 'socket.io-client';
import { Message, Answer, Comment, Thread } from '../types';

class WebSocketService {
  public socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(userId: string) {
    if (this.socket?.connected) return;

    // Get WebSocket URL from environment variable
    const wsUrl = import.meta.env.VITE_WEBSOCKET_URL;
    
    // Don't attempt to connect if no WebSocket URL is configured
    if (!wsUrl) {
      console.log('WebSocket URL not configured, skipping connection');
      return;
    }

    this.socket = io(wsUrl, {
      auth: { userId },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('Connected to WebSocket server');
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
    });

    this.socket.on('reconnect_failed', () => {
      console.log('Failed to reconnect to WebSocket server');
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Private chat events
  sendPrivateMessage(conversationId: string, message: string) {
    if (this.socket?.connected) {
      this.socket.emit('private_message', { conversationId, message });
    }
  }

  onPrivateMessage(callback: (data: { conversationId: string; message: Message }) => void) {
    this.socket?.on('private_message_response', callback);
  }

  onAIResponse(callback: (data: { conversationId: string; message: Message }) => void) {
    this.socket?.on('ai_response', callback);
  }

  // Public thread events
  joinThread(threadId: string) {
    this.socket?.emit('join_thread', { threadId });
  }

  leaveThread(threadId: string) {
    this.socket?.emit('leave_thread', { threadId });
  }

  addAnswer(threadId: string, questionId: string, content: string) {
    this.socket?.emit('add_answer', { threadId, questionId, content });
  }

  onNewAnswer(callback: (data: { threadId: string; answer: Answer }) => void) {
    this.socket?.on('new_answer', callback);
  }

  addComment(answerId: string, content: string, parentId?: string) {
    this.socket?.emit('add_comment', { answerId, content, parentId });
  }

  onNewComment(callback: (data: { answerId: string; comment: Comment }) => void) {
    this.socket?.on('new_comment', callback);
  }

  // Thread updates
  onThreadUpdate(callback: (data: { thread: Thread }) => void) {
    this.socket?.on('thread_updated', callback);
  }

  // Typing indicators
  startTyping(threadId: string, type: 'answer' | 'comment', targetId: string) {
    this.socket?.emit('typing_start', { threadId, type, targetId });
  }

  stopTyping(threadId: string, type: 'answer' | 'comment', targetId: string) {
    this.socket?.emit('typing_stop', { threadId, type, targetId });
  }

  onTyping(callback: (data: { userId: string; type: 'answer' | 'comment'; targetId: string }) => void) {
    this.socket?.on('user_typing', callback);
  }

  onStopTyping(callback: (data: { userId: string; type: 'answer' | 'comment'; targetId: string }) => void) {
    this.socket?.on('user_stop_typing', callback);
  }
}

export const wsService = new WebSocketService();