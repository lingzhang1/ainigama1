import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { useAppContext } from '../../context/AppContext';
import { MessageSquare, Users, ArrowLeft, Calendar, Eye, MessageCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';

interface UserCenterProps {
  onBack: () => void;
}

interface UserPost {
  id: string;
  type: 'conversation' | 'question' | 'answer' | 'comment';
  title: string;
  content: string;
  createdAt: Date;
  stats: {
    views: number;
    replies: number;
    likes: number;
  };
  status: 'published' | 'draft' | 'archived';
  threadId?: string;
}

interface Conversation {
  id: string;
  title?: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

interface Thread {
  id: string;
  title: string;
  category?: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  creator_id?: string;
  creatorId?: string;
}

interface Question {
  id: string;
  threadId: string;
  content: string;
  createdAt: string;
}

interface Answer {
  id: string;
  questionId: string;
  content: string;
  isAi: boolean;
  isPinned: boolean;
  interactionCount: number;
  createdAt: string;
  threadId?: string;
}

export const UserCenter: React.FC<UserCenterProps> = ({ onBack }) => {
  const { state, dispatch } = useAppContext();
  const [userPosts, setUserPosts] = useState<UserPost[]>([]);
  const [filter, setFilter] = useState<'all' | 'conversations' | 'questions' | 'answers'>('all');
  const [loading, setLoading] = useState(true);

  // Fetch real user data
  useEffect(() => {
    const fetchUserPosts = async () => {
      if (!state.currentUser?.id) {
        setLoading(false);
        return;
      }

      try {
        const userId = state.currentUser.id;
        const apiUrl = (import.meta as any).env?.VITE_API_URL || 'https://t9ir58i9z9.execute-api.us-east-1.amazonaws.com/dev';
        
        // Fetch user's conversations
        const conversationsResponse = await fetch(`${apiUrl}/user-conversations/${userId}`);
        const conversationsData = await conversationsResponse.json();
        const conversations: Conversation[] = conversationsData.conversations || [];

        // Fetch user's threads
        const threadsResponse = await fetch(`${apiUrl}/threads`);
        const threadsData = await threadsResponse.json();
        const userThreads: Thread[] = (threadsData.threads || []).filter((thread: any) => 
          thread.creator_id === userId || thread.creatorId === userId
        );

        // Note: Questions and answers are fetched per thread, not globally
        // For now, we'll skip these until we implement proper endpoints
        const userQuestions: Question[] = [];
        const userAnswers: Answer[] = [];

        // Transform data to UserPost format
        const posts: UserPost[] = [
          ...conversations.map((conv): UserPost => ({
            id: conv.id,
            type: 'conversation',
            title: conv.title || 'Private Conversation',
            content: 'Private conversation with AI',
            createdAt: new Date(conv.created_at || conv.createdAt || new Date()),
            stats: { views: 0, replies: 0, likes: 0 },
            status: 'published',
            threadId: conv.id  // For conversations, the ID is the conversation ID
          })),
          ...userThreads.map((thread): UserPost => ({
            id: thread.id,
            type: 'question',
            title: thread.title,
            content: thread.title,
            createdAt: new Date(thread.created_at || thread.createdAt || new Date()),
            stats: { views: 0, replies: 0, likes: 0 },
            status: 'published',
            threadId: thread.id  // For threads, the ID is the thread ID
          })),
          ...userQuestions.map((question): UserPost => ({
            id: question.id,
            type: 'question',
            title: question.content.substring(0, 50) + (question.content.length > 50 ? '...' : ''),
            content: question.content,
            createdAt: new Date(question.createdAt),
            stats: { views: 0, replies: 0, likes: 0 },
            status: 'published',
            threadId: question.threadId || question.id
          })),
          ...userAnswers.map((answer): UserPost => ({
            id: answer.id,
            type: 'answer',
            title: 'Answer: ' + answer.content.substring(0, 50) + (answer.content.length > 50 ? '...' : ''),
            content: answer.content,
            createdAt: new Date(answer.createdAt),
            stats: { 
              views: 0, 
              replies: 0, 
              likes: answer.interactionCount || 0 
            },
            status: 'published',
            threadId: answer.threadId || answer.id
          }))
        ];

        setUserPosts(posts);
      } catch (error) {
        console.error('Failed to fetch user posts:', error);
        // Fallback to empty array if API fails
        setUserPosts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchUserPosts();
  }, [state.currentUser?.id]);

  const filteredPosts = userPosts.filter(post => {
    if (filter === 'all') return true;
    if (filter === 'conversations') return post.type === 'conversation';
    if (filter === 'questions') return post.type === 'question';
    if (filter === 'answers') return post.type === 'answer';
    return true;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'conversation': return <MessageSquare className="w-4 h-4" />;
      case 'question': return <Users className="w-4 h-4" />;
      case 'answer': return <MessageCircle className="w-4 h-4" />;
      default: return <MessageSquare className="w-4 h-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'conversation': return 'bg-teal-100 text-teal-800';
      case 'question': return 'bg-green-100 text-green-800';
      case 'answer': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published': return 'bg-green-100 text-green-800';
      case 'draft': return 'bg-yellow-100 text-yellow-800';
      case 'archived': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleViewPost = (post: UserPost) => {
    switch (post.type) {
      case 'conversation':
        // Navigate to private chat to view the conversation
        if (post.threadId) {
          dispatch({ type: 'SET_VIEW_MODE', payload: 'private' });
          dispatch({ type: 'SET_CURRENT_CONVERSATION', payload: post.threadId });
        } else {
          alert(`View conversation: ${post.title}\n\nConversation ID not available for viewing.`);
        }
        break;
      case 'question':
        // Navigate to the thread containing this question
        if (post.threadId) {
          dispatch({ type: 'SET_VIEW_MODE', payload: 'public-thread' });
          dispatch({ type: 'SET_CURRENT_THREAD', payload: post.threadId });
        } else {
          alert(`View question: ${post.title}\n\nThread ID not available for viewing.`);
        }
        break;
      case 'answer':
        // Navigate to the thread/answer to view the answer
        if (post.threadId) {
          dispatch({ type: 'SET_VIEW_MODE', payload: 'public-thread' });
          dispatch({ type: 'SET_CURRENT_THREAD', payload: post.threadId });
        } else {
          alert(`View answer: ${post.title}\n\nThread ID not available for viewing.`);
        }
        break;
      default:
        alert(`View ${post.type}: ${post.title}\n\nView functionality not yet implemented.`);
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading your posts...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b px-4 md:px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              onClick={onBack}
              variant="outline"
              size="sm"
              className="border-green-300 text-green-600 hover:bg-green-50"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-green-800">User Center</h1>
              <p className="text-sm text-green-600">Manage your posts and contributions</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Avatar className="w-8 h-8">
              <AvatarImage src={state.currentUser?.avatar} alt={state.currentUser?.name} />
              <AvatarFallback className="bg-gradient-to-r from-green-400 to-green-600 text-white text-sm font-bold">
                {state.currentUser?.name?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <span className="text-green-700 font-medium">{state.currentUser?.name || 'User'}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-white">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-gray-800">{userPosts.length}</div>
              <div className="text-sm text-gray-600">Total Posts</div>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-gray-800">
                {userPosts.reduce((sum, post) => sum + post.stats.views, 0)}
              </div>
              <div className="text-sm text-gray-600">Total Views</div>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-gray-800">
                {userPosts.reduce((sum, post) => sum + post.stats.replies, 0)}
              </div>
              <div className="text-sm text-gray-600">Total Replies</div>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-gray-800">
                {userPosts.reduce((sum, post) => sum + post.stats.likes, 0)}
              </div>
              <div className="text-sm text-gray-600">Total Likes</div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {[
            { key: 'all', label: 'All Posts' },
            { key: 'conversations', label: 'Private Conversations' },
            { key: 'questions', label: 'Questions' },
            { key: 'answers', label: 'Answers' }
          ].map((tab) => (
            <Button
              key={tab.key}
              onClick={() => setFilter(tab.key as any)}
              variant={filter === tab.key ? 'default' : 'outline'}
              size="sm"
              className={
                filter === tab.key
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'border-green-300 text-green-600 hover:bg-green-50'
              }
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Posts List */}
        <div className="space-y-4">
          {filteredPosts.length === 0 ? (
            <Card className="bg-white">
              <CardContent className="p-8 text-center">
                <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-800 mb-2">No posts found</h3>
                <p className="text-gray-600">
                  {filter === 'all' 
                    ? "You haven't created any posts yet." 
                    : filter === 'conversations' 
                      ? "You haven't started any private conversations yet."
                      : filter === 'questions'
                        ? "You haven't asked any questions yet."
                        : filter === 'answers'
                          ? "You haven't provided any answers yet."
                          : `You haven't created any ${filter} yet.`
                  }
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredPosts.map((post) => (
              <Card key={post.id} className="bg-white hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <Badge className={`${getTypeColor(post.type)} flex items-center space-x-1`}>
                        {getTypeIcon(post.type)}
                        <span className="capitalize">{post.type}</span>
                      </Badge>
                      <Badge className={getStatusColor(post.status)}>
                        {post.status}
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-1 text-sm text-gray-500">
                      <Calendar className="w-4 h-4" />
                      <span>{post.createdAt.toLocaleDateString()}</span>
                    </div>
                  </div>
                  
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">{post.title}</h3>
                  <p className="text-gray-600 mb-4 line-clamp-2">{post.content}</p>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <div className="flex items-center space-x-1">
                        <Eye className="w-4 h-4" />
                        <span>{post.stats.views}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <MessageCircle className="w-4 h-4" />
                        <span>{post.stats.replies}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span>❤️</span>
                        <span>{post.stats.likes}</span>
                      </div>
                    </div>
                    
                    <div className="flex space-x-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="border-green-300 text-green-600 hover:bg-green-50"
                        onClick={() => handleViewPost(post)}
                      >
                        View
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  );
};
