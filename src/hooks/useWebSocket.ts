import { useEffect, useRef } from 'react';
import { wsService } from '../services/websocket';
import { Message, Answer, Comment, Thread } from '../types';

export const useWebSocket = (userId: string) => {
  const isConnected = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isConnected.current && userId && userId.trim() !== '') {
      wsService.connect(userId);
      isConnected.current = true;
      
      // Store cleanup function
      cleanupRef.current = () => {
        if (isConnected.current) {
          wsService.disconnect();
          isConnected.current = false;
        }
      };
    }

    return () => {
      // Use cleanup function to prevent multiple disconnections
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [userId]);

  return wsService;
};

export const usePrivateChat = (conversationId: string, onNewMessage: (message: Message) => void) => {
  const sendMessage = (message: string) => {
    wsService.sendPrivateMessage(conversationId, message);
  };

  return { sendMessage };
};

export const usePublicThread = (
  threadId: string,
  onNewAnswer: (answer: Answer) => void,
  onNewComment: (comment: Comment) => void,
  onThreadUpdate: (thread: Thread) => void,
  onTyping?: (data: { userId: string; type: 'answer' | 'comment'; targetId: string }) => void,
  onStopTyping?: (data: { userId: string; type: 'answer' | 'comment'; targetId: string }) => void
) => {
  const ws = wsService;

  useEffect(() => {
    if (!threadId) return;
    
    ws.joinThread(threadId);

    const handleNewAnswer = (data: { threadId: string; answer: Answer }) => {
      if (data.threadId === threadId) {
        onNewAnswer(data.answer);
      }
    };

    const handleNewComment = (data: { answerId: string; comment: Comment }) => {
      onNewComment(data.comment);
    };

    const handleThreadUpdate = (data: { thread: Thread }) => {
      if (data.thread.id === threadId) {
        onThreadUpdate(data.thread);
      }
    };

    const handleTyping = (data: { userId: string; type: 'answer' | 'comment'; targetId: string }) => {
      onTyping?.(data);
    };

    const handleStopTyping = (data: { userId: string; type: 'answer' | 'comment'; targetId: string }) => {
      onStopTyping?.(data);
    };

    ws.onNewAnswer(handleNewAnswer);
    ws.onNewComment(handleNewComment);
    ws.onThreadUpdate(handleThreadUpdate);
    ws.onTyping(handleTyping);
    ws.onStopTyping(handleStopTyping);

    return () => {
      ws.leaveThread(threadId);
    };
  }, [threadId, onNewAnswer, onNewComment, onThreadUpdate, onTyping, onStopTyping, ws]);

  const addAnswer = (questionId: string, content: string) => {
    ws.addAnswer(threadId, questionId, content);
  };

  const addComment = (answerId: string, content: string, parentId?: string) => {
    ws.addComment(answerId, content, parentId);
  };

  const startTyping = (type: 'answer' | 'comment', targetId: string) => {
    ws.startTyping(threadId, type, targetId);
  };

  const stopTyping = (type: 'answer' | 'comment', targetId: string) => {
    ws.stopTyping(threadId, type, targetId);
  };

  return { addAnswer, addComment, startTyping, stopTyping };
};