import { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import { metricsService } from '../../services/metrics';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { ArrowLeft, MessageSquare, Heart, Bookmark, Reply, Loader2 } from 'lucide-react';

interface UserPost {
  id: string;
  type: 'question' | 'answer' | 'conversation' | 'comment';
  title: string;
  content: string;
  createdAt: Date;
  stats: { views: number; replies: number; likes: number; saves: number; shares: number };
  status: 'published' | 'draft';
  threadId?: string;
}

interface UserCenterUltraFastProps {
  onBack: () => void;
}

// 超轻量级缓存 - 只缓存必要数据
const tabCache = new Map<string, { data: UserPost[]; timestamp: number }>();
const CACHE_DURATION = 10 * 60 * 1000; // 10分钟缓存

// 统计缓存 - 只缓存数字
const statsCache = new Map<string, { counts: any; timestamp: number }>();
const STATS_CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

export default function UserCenterUltraFast({ onBack }: UserCenterUltraFastProps) {
  const { state, dispatch } = useAppContext();
  const currentUser = state.currentUser;
  
  // 只管理当前选中的tab
  const [activeTab, setActiveTab] = useState<'my-posts' | 'replied' | 'liked' | 'saved'>('my-posts');
  const [currentPosts, setCurrentPosts] = useState<UserPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 统计数据 - 轻量级
  const [stats, setStats] = useState({
    myPosts: 0,
    replied: 0,
    liked: 0,
    saved: 0
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // 快速加载统计数据（只获取数量，不获取内容）
  const loadStats = useCallback(async (userId: string) => {
    const cacheKey = `stats_${userId}`;
    const cached = statsCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < STATS_CACHE_DURATION) {
      setStats(cached.counts);
      setStatsLoading(false);
      return;
    }

    try {
      setStatsLoading(true);
      
      // 使用超快的 stats API
      const statsData = await metricsService.getUserStats(userId);
      
      const counts = {
        myPosts: statsData.myPosts,
        replied: statsData.replied,
        liked: statsData.liked,
        saved: statsData.saved
      };

      // 缓存统计
      statsCache.set(cacheKey, {
        counts,
        timestamp: Date.now()
      });

      setStats(counts);
    } catch (error) {
      console.error('Failed to load stats:', error);
      setStats({ myPosts: 0, replied: 0, liked: 0, saved: 0 });
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // 懒加载tab数据
  const loadTabData = useCallback(async (tabType: string, userId: string) => {
    const cacheKey = `${tabType}_${userId}`;
    const cached = tabCache.get(cacheKey);
    
    // 检查缓存
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      setCurrentPosts(cached.data);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      let data: UserPost[] = [];
      
      switch (tabType) {
        case 'my-posts':
          const threadsResponse = await fetch(`${(import.meta as any).env?.VITE_API_URL}/threads`);
          const threadsData = await threadsResponse.json();
          const userThreads = (threadsData.threads || []).filter((t: any) => t.creator?.id === userId);
          data = userThreads.map((thread: any) => ({
            id: thread.id,
            type: 'question' as const,
            title: thread.title,
            content: thread.title,
            createdAt: new Date(thread.createdAt),
            stats: { views: 0, replies: 0, likes: 0, saves: 0, shares: 0 },
            status: 'published' as const,
            threadId: thread.id
          }));
          break;
          
        case 'saved':
          const savesData = await metricsService.getUserSaves(userId);
          data = (savesData.saves || []).map((save: any) => ({
            id: save.contentId,
            type: save.contentType === 'thread' ? 'question' : save.contentType,
            title: save.content?.title || 'Saved Content',
            content: save.content?.preview || '',
            createdAt: new Date(save.timestamp),
            stats: { views: 0, replies: 0, likes: 0, saves: 0, shares: 0 },
            status: 'published' as const,
            threadId: save.threadId || save.contentId
          })).filter((post: UserPost) => post.threadId);
          break;
          
        case 'liked':
          const likesData = await metricsService.getUserLikes(userId);
          data = ((likesData as any).likes || []).map((like: any) => ({
            id: like.contentId,
            type: like.contentType === 'thread' ? 'question' : like.contentType,
            title: like.content?.title || 'Liked Content',
            content: like.content?.preview || '',
            createdAt: new Date(like.timestamp),
            stats: { views: 0, replies: 0, likes: 0, saves: 0, shares: 0 },
            status: 'published' as const,
            threadId: like.threadId
          })).filter((post: UserPost) => post.threadId);
          break;
          
        case 'replied':
          const repliesData = await metricsService.getUserReplies(userId);
          data = (repliesData.replies || []).map((reply: any) => ({
            id: reply.contentId,
            type: reply.contentType as 'answer' | 'comment',
            title: reply.content?.title || 'Reply',
            content: reply.content?.preview || '',
            createdAt: new Date(reply.timestamp),
            stats: { views: 0, replies: 0, likes: 0, saves: 0, shares: 0 },
            status: 'published' as const,
            threadId: reply.threadId
          })).filter((post: UserPost) => post.threadId);
          break;
      }
      
      // 缓存数据
      tabCache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });
      
      setCurrentPosts(data);
    } catch (error) {
      console.error(`Failed to load ${tabType} data:`, error);
      setError(`Failed to load ${tabType} data`);
      setCurrentPosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始化 - 只加载统计
  useEffect(() => {
    if (currentUser?.id) {
      loadStats(currentUser.id);
    }
  }, [currentUser?.id, loadStats]);

  // 切换tab时懒加载数据
  useEffect(() => {
    if (currentUser?.id && activeTab) {
      loadTabData(activeTab, currentUser.id);
    }
  }, [activeTab, currentUser?.id, loadTabData]);

  // 处理tab切换
  const handleTabClick = (tabType: 'my-posts' | 'replied' | 'liked' | 'saved') => {
    setActiveTab(tabType);
    setError(null);
  };

  // 处理帖子查看
  const handleViewPost = (post: UserPost) => {
    if (post.type === 'conversation') {
      dispatch({ type: 'SET_CURRENT_CONVERSATION', payload: post.id });
      dispatch({ type: 'SET_VIEW_MODE', payload: 'private' });
    } else {
      dispatch({ type: 'SET_CURRENT_THREAD', payload: post.threadId || post.id });
      dispatch({ type: 'SET_VIEW_MODE', payload: 'public-thread' });
    }
  };

  // 刷新当前tab
  const handleRefresh = () => {
    if (currentUser?.id) {
      const cacheKey = `${activeTab}_${currentUser.id}`;
      tabCache.delete(cacheKey);
      loadTabData(activeTab, currentUser.id);
    }
  };

  // 清除所有缓存
  const handleClearCache = () => {
    tabCache.clear();
    statsCache.clear();
    if (currentUser?.id) {
      loadStats(currentUser.id);
      loadTabData(activeTab, currentUser.id);
    }
  };

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Please log in to view your posts</p>
          <Button onClick={onBack} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Forum
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center space-x-3">
          <Button
            onClick={onBack}
            variant="ghost"
            size="sm"
            className="text-gray-600 hover:text-gray-800"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center space-x-2">
            <Avatar className="w-8 h-8">
              <AvatarImage src={currentUser.avatar} alt={currentUser.name} />
              <AvatarFallback>{currentUser.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-lg font-semibold text-gray-800">{currentUser.name}</h1>
              <p className="text-xs text-gray-600">User Center</p>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            onClick={handleRefresh}
            variant="outline"
            size="sm"
            disabled={loading}
            className="text-gray-600 hover:text-gray-800"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
          </Button>
          <Button
            onClick={handleClearCache}
            variant="ghost"
            size="sm"
            className="text-gray-500 hover:text-gray-700"
          >
            Clear Cache
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full flex">
          {/* Stats Cards - 轻量级 */}
          <div className="w-72 p-4 border-r border-gray-200 bg-white overflow-y-auto">
            <h2 className="text-md font-semibold text-gray-800 mb-3">Your Activity</h2>
            
            <div className="space-y-2">
              {/* My Posts */}
              <Card 
                className={`p-3 cursor-pointer transition-all hover:border-green-300 ${
                  activeTab === 'my-posts' ? 'border-green-500 bg-green-50' : 'border-gray-200'
                }`}
                onClick={() => handleTabClick('my-posts')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                      <MessageSquare className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-800 text-sm">My Posts</p>
                      <p className="text-xs text-gray-600">Your threads</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {statsLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    ) : (
                      <p className="text-lg font-bold text-gray-800">{stats.myPosts}</p>
                    )}
                  </div>
                </div>
              </Card>

              {/* Replied */}
              <Card 
                className={`p-3 cursor-pointer transition-all hover:border-green-300 ${
                  activeTab === 'replied' ? 'border-green-500 bg-green-50' : 'border-gray-200'
                }`}
                onClick={() => handleTabClick('replied')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                      <Reply className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-800 text-sm">Replied</p>
                      <p className="text-xs text-gray-600">Your replies</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {statsLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    ) : (
                      <p className="text-lg font-bold text-gray-800">{stats.replied}</p>
                    )}
                  </div>
                </div>
              </Card>

              {/* Liked */}
              <Card 
                className={`p-3 cursor-pointer transition-all hover:border-green-300 ${
                  activeTab === 'liked' ? 'border-green-500 bg-green-50' : 'border-gray-200'
                }`}
                onClick={() => handleTabClick('liked')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                      <Heart className="w-4 h-4 text-red-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-800 text-sm">Liked</p>
                      <p className="text-xs text-gray-600">Your likes</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {statsLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    ) : (
                      <p className="text-lg font-bold text-gray-800">{stats.liked}</p>
                    )}
                  </div>
                </div>
              </Card>

              {/* Saved */}
              <Card 
                className={`p-3 cursor-pointer transition-all hover:border-green-300 ${
                  activeTab === 'saved' ? 'border-green-500 bg-green-50' : 'border-gray-200'
                }`}
                onClick={() => handleTabClick('saved')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
                      <Bookmark className="w-4 h-4 text-yellow-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-800 text-sm">Saved</p>
                      <p className="text-xs text-gray-600">Your saves</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {statsLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    ) : (
                      <p className="text-lg font-bold text-gray-800">{stats.saved}</p>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* Posts List */}
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-md font-semibold text-gray-800">
                {activeTab === 'my-posts' && 'My Posts'}
                {activeTab === 'replied' && 'Posts I Replied To'}
                {activeTab === 'liked' && 'Posts I Liked'}
                {activeTab === 'saved' && 'Posts I Saved'}
              </h2>
              <Badge variant="outline" className="text-gray-600">
                {currentPosts.length} posts
              </Badge>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-green-600 mx-auto mb-4" />
                  <p className="text-gray-600">Loading posts...</p>
                </div>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-red-600 mb-4">{error}</p>
                <Button onClick={handleRefresh} variant="outline" size="sm">
                  Try Again
                </Button>
              </div>
            ) : currentPosts.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="w-6 h-6 text-gray-400" />
                </div>
                <h3 className="text-md font-medium text-gray-800 mb-2">No posts found</h3>
                <p className="text-gray-600 text-sm">
                  {activeTab === 'my-posts' && "You haven't created any public threads yet."}
                  {activeTab === 'replied' && "You haven't replied to any posts yet."}
                  {activeTab === 'liked' && "You haven't liked any posts yet."}
                  {activeTab === 'saved' && "You haven't saved any posts yet."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {currentPosts.map((post) => (
                  <Card key={post.id} className="p-3 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${
                              post.type === 'question' ? 'bg-blue-100 text-blue-800' :
                              post.type === 'answer' ? 'bg-green-100 text-green-800' :
                              post.type === 'conversation' ? 'bg-teal-100 text-teal-800' :
                              'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {post.type}
                          </Badge>
                          <span className="text-xs text-gray-500">
                            {new Date(post.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <h3 className="font-medium text-gray-800 text-sm mb-1">{post.title}</h3>
                        <p className="text-gray-600 text-xs line-clamp-2">{post.content}</p>
                      </div>
                      <Button
                        onClick={() => handleViewPost(post)}
                        variant="outline"
                        size="sm"
                        className="ml-3 text-green-600 border-green-300 hover:bg-green-50 text-xs"
                      >
                        View
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
