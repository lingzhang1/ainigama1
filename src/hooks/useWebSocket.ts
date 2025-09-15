import { useEffect, useRef } from 'react';
import { wsService } from '../services/websocket';
import { Message, Answer, Comment, Thread } from '../types';

export const useWebSocket = (userId: string) => {
  const isConnected = useRef(false);

  useEffect(() => {
    if (!isConnected.current && userId && userId.trim() !== '') {
      wsService.connect(userId);
      isConnected.current = true;
    }

    return () => {
      if (isConnected.current) {
        wsService.disconnect();
        isConnected.current = false;
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
  onThreadUpdate: (thread: Thread) => void
) => {
  const ws = wsService;

  useEffect(() => {
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

    ws.onNewAnswer(handleNewAnswer);
    ws.onNewComment(handleNewComment);
    ws.onThreadUpdate(handleThreadUpdate);

    return () => {
      ws.leaveThread(threadId);
    };
  }, [threadId, onNewAnswer, onNewComment, onThreadUpdate, ws]);

  const addAnswer = (questionId: string, content: string) => {
    ws.addAnswer(threadId, questionId, content);
  };

  const addComment = (answerId: string, content: string, parentId?: string) => {
    ws.addComment(answerId, content, parentId);
  };

  return { addAnswer, addComment };
};