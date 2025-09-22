export interface User {
  id: string;
  name: string;
  alias: string;
  avatar: string;
  handle: string;
}

export interface Message {
  id: string;
  content: string;
  timestamp: Date;
  sender: 'user' | 'ai';
  userId?: string;
  thinking?: string; // Store AI thinking process with the message
}

export interface Question {
  id: string;
  content: string;
  timestamp: Date;
  userId: string;
  threadId: string;
}

export interface Answer {
  id: string;
  content: string;
  timestamp: Date;
  userId: string;
  questionId: string;
  isPinned: boolean;
  isAI: boolean;
  interactionCount: number;
}

export interface Comment {
  id: string;
  content: string;
  timestamp: Date;
  userId: string;
  answerId: string;
  parentId?: string;
  replies?: Comment[];
}

export interface Thread {
  id: string;
  title: string;
  creator: User;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  questionCount: number;
  answerCount: number;
  interactionCount: number;
  questions: Question[];
  category?: string;
}

export interface PrivateConversation {
  id: string;
  userId: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  title?: string;
}

export type ViewMode = 'forum' | 'private' | 'public-thread';
export type FeedFilter = 'recent' | 'trending';