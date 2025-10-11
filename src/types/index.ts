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
  isSummary?: boolean; // Indicates if this is an AI-generated summary question
  // New metrics
  likeCount: number;
  saveCount: number;
  shareCount: number;
  // User-specific states
  isLiked?: boolean;
  isSaved?: boolean;
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
  commentCount: number;
  thinking?: string; // AI thinking process
  // New metrics
  likeCount: number;
  saveCount: number;
  shareCount: number;
  // User-specific states
  isLiked?: boolean;
  isSaved?: boolean;
}

export interface Comment {
  id: string;
  content: string;
  timestamp: Date;
  userId: string;
  answerId: string;
  parentId?: string;
  replies?: Comment[];
  // New metrics
  likeCount: number;
  saveCount: number;
  shareCount: number;
  // User-specific states
  isLiked?: boolean;
  isSaved?: boolean;
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
  // New metrics
  viewCount: number;
  likeCount: number;
  saveCount: number;
  shareCount: number;
  // User-specific states
  isLiked?: boolean;
  isSaved?: boolean;
  questions: Question[];
  category?: string;
  // Top answer preview (for forum feed)
  topAnswer?: Answer;
}

export interface PrivateConversation {
  id: string;
  userId: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  title?: string;
}

export type ViewMode = 'forum' | 'private' | 'public-thread' | 'user-center' | 'account';
export type FeedFilter = 'recent' | 'trending';

// Metrics API Response Types
export interface MetricResponse {
  success: boolean;
  message?: string;
}

export interface ViewResponse extends MetricResponse {
  viewCount: number;
}

export interface LikeResponse extends MetricResponse {
  action: 'liked' | 'unliked';
  likeCount: number;
  isLiked: boolean;
}

export interface SaveResponse extends MetricResponse {
  action: 'saved' | 'unsaved';
  saveCount: number;
  isSaved: boolean;
}

export interface ShareResponse extends MetricResponse {
  shareCount: number;
  shareUrl: string;
}

export interface LikesData {
  likeCount: number;
  isLiked: boolean;
  recentLikes: Array<{
    userId: string;
    userName: string;
    userAvatar: string;
    timestamp: string;
  }>;
}

export interface SavesData {
  saves: Array<{
    contentType: string;
    contentId: string;
    content: {
      title: string;
      preview: string;
      creator: string;
    };
    timestamp: string;
  }>;
}

export interface SharesData {
  shareCount: number;
  shareMethods: Record<string, number>;
  recentShares: Array<{
    userId: string;
    shareMethod: string;
    timestamp: string;
  }>;
}