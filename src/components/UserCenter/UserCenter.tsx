import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { CompactMetricDisplay } from '../ui/MetricDisplay';
import { useAppContext } from '../../context/AppContext';
import { MessageSquare, Users, ArrowLeft, Calendar, MessageCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { metricsService } from '../../services/metrics';

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
    saves: number;
    shares: number;
  };
  status: 'published' | 'draft' | 'archived';
  threadId?: string;
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
  const [filter, setFilter] = useState<'my-posts' | 'replied' | 'liked' | 'saved'>('my-posts');
  const [loading, setLoading] = useState(true);
  
  // Separate states for different types of posts
  const [myPosts, setMyPosts] = useState<UserPost[]>([]);
  const [repliedPosts, setRepliedPosts] = useState<UserPost[]>([]);
  const [likedPosts, setLikedPosts] = useState<UserPost[]>([]);
  const [savedPosts, setSavedPosts] = useState<UserPost[]>([]);

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
        
        // Fetch user's threads
        const threadsResponse = await fetch(`${apiUrl}/threads`);
        const threadsData = await threadsResponse.json();
        const userThreads: Thread[] = (threadsData.threads || []).filter((thread: any) => {
          // Check both creator_id and nested creator.id
          const creatorId = thread.creator_id || thread.creatorId || thread.creator?.id;
          return creatorId === userId;
        });
        

        // Note: Questions and answers are fetched per thread, not globally
        // For now, we'll skip these until we implement proper endpoints
        const userQuestions: Question[] = [];
        const userAnswers: Answer[] = [];

        // Transform data to UserPost format
        // For "My Posts", only show published threads (public threads)
        // Private conversations are not considered "posts" - they are private chats
        const posts: UserPost[] = [
          ...userThreads.map((thread): UserPost => ({
            id: thread.id,
            type: 'question',
            title: thread.title,
            content: thread.title,
            createdAt: new Date(thread.created_at || thread.createdAt || new Date()),
            stats: { views: 0, replies: 0, likes: 0, saves: 0, shares: 0 },
            status: 'published',
            threadId: thread.id  // For threads, the ID is the thread ID
          })),
          ...userQuestions.map((question): UserPost => ({
            id: question.id,
            type: 'question',
            title: question.content.substring(0, 50) + (question.content.length > 50 ? '...' : ''),
            content: question.content,
            createdAt: new Date(question.createdAt),
            stats: { views: 0, replies: 0, likes: 0, saves: 0, shares: 0 },
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
              likes: answer.interactionCount || 0,
              saves: 0,
              shares: 0
            },
            status: 'published',
            threadId: answer.threadId || answer.id
          }))
        ];

        // Set my posts (posts created by me)
        setMyPosts(posts);
        
        // Fetch user's saved posts
        try {
          const savesData = await metricsService.getUserSaves(userId);
          
          // Transform saves to UserPost format
          const savedPostsArray: UserPost[] = (savesData.saves || [])
            .map((save: any) => {
              // For threads, use contentId as threadId
              // For answers/questions, use the provided threadId (if backend updated)
              const threadId = save.threadId || (save.contentType === 'thread' ? save.contentId : undefined);
              
              return {
                id: save.contentId,
                type: save.contentType === 'thread' ? 'question' : save.contentType,
                title: save.content?.title || 'Saved Content',
                content: save.content?.preview || '',
                createdAt: new Date(save.timestamp),
                stats: { views: 0, replies: 0, likes: 0, saves: 0, shares: 0 },
                status: 'published' as const,
                threadId: threadId
              };
            })
            .filter((post: UserPost) => post.threadId !== undefined); // Only show posts with valid threadId
          
          setSavedPosts(savedPostsArray);
        } catch (error) {
          console.error('Failed to fetch saved posts:', error);
          setSavedPosts([]);
        }
        
        // Fetch user's replies (answers and comments)
        try {
          const repliesData = await metricsService.getUserReplies(userId);
          
          const repliedPostsArray: UserPost[] = (repliesData.replies || [])
            .map((reply: any) => ({
              id: reply.contentId,
              type: reply.contentType as 'answer' | 'comment',
              title: reply.content?.title || 'Reply',
              content: reply.content?.preview || '',
              createdAt: new Date(reply.timestamp),
              stats: { views: 0, replies: 0, likes: 0, saves: 0, shares: 0 },
              status: 'published' as const,
              threadId: reply.threadId
            }))
            .filter((post: UserPost) => post.threadId !== undefined); // Only show posts with valid threadId
          
          setRepliedPosts(repliedPostsArray);
        } catch (error) {
          console.error('Failed to fetch replied posts:', error);
          setRepliedPosts([]);
        }
        
        // Fetch user's liked posts
        try {
          const likesData = await metricsService.getUserLikes(userId);
          
          const likedPostsArray: UserPost[] = ((likesData as any).likes || [])
            .map((like: any) => ({
              id: like.contentId,
              type: like.contentType === 'thread' ? 'question' : like.contentType,
              title: like.content?.title || 'Liked Content',
              content: like.content?.preview || '',
              createdAt: new Date(like.timestamp),
              stats: { views: 0, replies: 0, likes: 0, saves: 0, shares: 0 },
              status: 'published' as const,
              threadId: like.threadId
            }))
            .filter((post: UserPost) => post.threadId !== undefined); // Only show posts with valid threadId
          
          setLikedPosts(likedPostsArray);
        } catch (error) {
          console.error('Failed to fetch liked posts:', error);
          setLikedPosts([]);
        }
        
      } catch (error) {
        console.error('Failed to fetch user posts:', error);
        // Fallback to empty array if API fails
        setMyPosts([]);
        setRepliedPosts([]);
        setLikedPosts([]);
        setSavedPosts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchUserPosts();
  }, [state.currentUser?.id]);

  const filteredPosts = (() => {
    switch (filter) {
      case 'my-posts':
        return myPosts;
      case 'replied':
        return repliedPosts;
      case 'liked':
        return likedPosts;
      case 'saved':
        return savedPosts;
      default:
        return myPosts;
    }
  })();

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

  const handleStatClick = (statType: string) => {
    // Map stat types to filters
    switch (statType) {
      case 'posts':
        setFilter('my-posts');
        break;
      case 'replies':
        setFilter('replied');
        break;
      case 'likes':
        setFilter('liked');
        break;
      case 'saves':
        setFilter('saved');
        break;
    }
  };

  const handleViewPost = (post: UserPost) => {
    console.log('🎯 handleViewPost called:', {
      type: post.type,
      threadId: post.threadId,
      title: post.title
    });
    
    switch (post.type) {
      case 'conversation':
        // Navigate to private chat to view the conversation
        if (post.threadId) {
          console.log('✅ Setting conversation ID:', post.threadId);
          dispatch({ type: 'SET_CURRENT_CONVERSATION', payload: post.threadId });
          console.log('✅ Setting view mode to private');
          dispatch({ type: 'SET_VIEW_MODE', payload: 'private' });
        } else {
          alert(`Cannot view this conversation.\n\nConversation ID is not available.`);
        }
        break;
      case 'question':
        // Navigate to the thread containing this question
        if (post.threadId) {
          dispatch({ type: 'SET_CURRENT_THREAD', payload: post.threadId });
          dispatch({ type: 'SET_VIEW_MODE', payload: 'public-thread' });
        } else {
          alert(`Cannot view this post.\n\nThread ID is not available.`);
        }
        break;
      case 'answer':
        // Navigate to the thread/answer to view the answer
        if (post.threadId) {
          dispatch({ type: 'SET_CURRENT_THREAD', payload: post.threadId });
          dispatch({ type: 'SET_VIEW_MODE', payload: 'public-thread' });
        } else {
          alert(`Cannot view this answer.\n\nThread ID is not available.`);
        }
        break;
      default:
        alert(`View functionality for ${post.type} is not yet implemented.`);
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card 
            className={`cursor-pointer transition-all ${
              filter === 'my-posts' 
                ? 'bg-green-50 border-green-500 shadow-md' 
                : 'bg-white hover:shadow-md hover:border-green-300'
            }`}
            onClick={() => handleStatClick('posts')}
          >
            <CardContent className="p-4 text-center">
              <div className={`text-2xl font-bold ${filter === 'my-posts' ? 'text-green-700' : 'text-gray-800'}`}>
                {myPosts.length}
              </div>
              <div className={`text-sm ${filter === 'my-posts' ? 'text-green-600' : 'text-gray-600'}`}>
                My Posts
              </div>
            </CardContent>
          </Card>
          <Card 
            className={`cursor-pointer transition-all ${
              filter === 'replied' 
                ? 'bg-green-50 border-green-500 shadow-md' 
                : 'bg-white hover:shadow-md hover:border-green-300'
            }`}
            onClick={() => handleStatClick('replies')}
          >
            <CardContent className="p-4 text-center">
              <div className={`text-2xl font-bold ${filter === 'replied' ? 'text-green-700' : 'text-gray-800'}`}>
                {repliedPosts.length}
              </div>
              <div className={`text-sm ${filter === 'replied' ? 'text-green-600' : 'text-gray-600'}`}>
                Replied
              </div>
            </CardContent>
          </Card>
          <Card 
            className={`cursor-pointer transition-all ${
              filter === 'liked' 
                ? 'bg-green-50 border-green-500 shadow-md' 
                : 'bg-white hover:shadow-md hover:border-green-300'
            }`}
            onClick={() => handleStatClick('likes')}
          >
            <CardContent className="p-4 text-center">
              <div className={`text-2xl font-bold ${filter === 'liked' ? 'text-green-700' : 'text-gray-800'}`}>
                {likedPosts.length}
              </div>
              <div className={`text-sm ${filter === 'liked' ? 'text-green-600' : 'text-gray-600'}`}>
                Liked
              </div>
            </CardContent>
          </Card>
          <Card 
            className={`cursor-pointer transition-all ${
              filter === 'saved' 
                ? 'bg-green-50 border-green-500 shadow-md' 
                : 'bg-white hover:shadow-md hover:border-green-300'
            }`}
            onClick={() => handleStatClick('saves')}
          >
            <CardContent className="p-4 text-center">
              <div className={`text-2xl font-bold ${filter === 'saved' ? 'text-green-700' : 'text-gray-800'}`}>
                {savedPosts.length}
              </div>
              <div className={`text-sm ${filter === 'saved' ? 'text-green-600' : 'text-gray-600'}`}>
                Saved
              </div>
            </CardContent>
          </Card>
        </div>


        {/* Posts List */}
        <div className="space-y-4">
          {filteredPosts.length === 0 ? (
            <Card className="bg-white">
              <CardContent className="p-8 text-center">
                <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-800 mb-2">No posts found</h3>
                <p className="text-gray-600">
                  {filter === 'my-posts' 
                    ? "You haven't created any posts yet." 
                    : filter === 'replied' 
                      ? "You haven't replied to any posts yet."
                      : filter === 'liked'
                        ? "You haven't liked any posts yet."
                        : filter === 'saved'
                          ? "You haven't saved any posts yet."
                          : "No posts found."
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
                    <CompactMetricDisplay
                      views={post.stats.views}
                      likes={post.stats.likes}
                      saves={post.stats.saves}
                      shares={post.stats.shares}
                      comments={post.stats.replies}
                      disabled={true}
                      size="sm"
                    />
                    
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
