import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import { UserPost } from '../../types';
import { metricsService } from '../../services/metrics';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { ArrowLeft, MessageSquare, Heart, Bookmark, Reply, Eye, Calendar, TrendingUp } from 'lucide-react';

interface UserCenterOptimizedProps {
  onBack: () => void;
}

// Cache for user dashboard data
const dashboardCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export default function UserCenterOptimized({ onBack }: UserCenterOptimizedProps) {
  const { currentUser, dispatch } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Dashboard data
  const [dashboardData, setDashboardData] = useState<{
    myPosts: UserPost[];
    saved: UserPost[];
    liked: UserPost[];
    replied: UserPost[];
  }>({
    myPosts: [],
    saved: [],
    liked: [],
    replied: []
  });
  
  // UI state
  const [filter, setFilter] = useState<'my-posts' | 'replied' | 'liked' | 'saved'>('my-posts');
  const [selectedStat, setSelectedStat] = useState<string | null>(null);

  // Load dashboard data with caching
  const loadDashboardData = useCallback(async (userId: string, forceRefresh = false) => {
    const cacheKey = `dashboard_${userId}`;
    const cached = dashboardCache.get(cacheKey);
    
    // Check cache first
    if (!forceRefresh && cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log('Using cached dashboard data');
      setDashboardData(cached.data);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      console.log('Fetching fresh dashboard data...');
      const data = await metricsService.getUserDashboard(userId);
      
      // Transform data to UserPost format
      const transformedData = {
        myPosts: data.myPosts || [],
        saved: data.saved || [],
        liked: data.liked || [],
        replied: data.replied || []
      };
      
      // Cache the data
      dashboardCache.set(cacheKey, {
        data: transformedData,
        timestamp: Date.now()
      });
      
      setDashboardData(transformedData);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setError('Failed to load user data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load data on mount
  useEffect(() => {
    if (currentUser?.id) {
      loadDashboardData(currentUser.id);
    }
  }, [currentUser?.id, loadDashboardData]);

  // Handle stat card clicks
  const handleStatClick = (statType: 'my-posts' | 'replied' | 'liked' | 'saved') => {
    setFilter(statType);
    setSelectedStat(statType);
  };

  // Handle post view
  const handleViewPost = (post: UserPost) => {
    if (post.type === 'conversation') {
      dispatch({ type: 'SET_CURRENT_CONVERSATION', payload: post.id });
      dispatch({ type: 'SET_VIEW_MODE', payload: 'private' });
    } else {
      dispatch({ type: 'SET_CURRENT_THREAD', payload: post.threadId || post.id });
      dispatch({ type: 'SET_VIEW_MODE', payload: 'public-thread' });
    }
  };

  // Get filtered posts
  const getFilteredPosts = () => {
    switch (filter) {
      case 'my-posts':
        return dashboardData.myPosts;
      case 'replied':
        return dashboardData.replied;
      case 'liked':
        return dashboardData.liked;
      case 'saved':
        return dashboardData.saved;
      default:
        return [];
    }
  };

  // Get stat counts
  const getStatCounts = () => ({
    myPosts: dashboardData.myPosts.length,
    replied: dashboardData.replied.length,
    liked: dashboardData.liked.length,
    saved: dashboardData.saved.length
  });

  const statCounts = getStatCounts();
  const filteredPosts = getFilteredPosts();

  // Refresh data
  const handleRefresh = () => {
    if (currentUser?.id) {
      loadDashboardData(currentUser.id, true);
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
      <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-white">
        <div className="flex items-center space-x-4">
          <Button
            onClick={onBack}
            variant="ghost"
            size="sm"
            className="text-gray-600 hover:text-gray-800"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center space-x-3">
            <Avatar className="w-10 h-10">
              <AvatarImage src={currentUser.avatar} alt={currentUser.name} />
              <AvatarFallback>{currentUser.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-xl font-semibold text-gray-800">{currentUser.name}</h1>
              <p className="text-sm text-gray-600">User Center</p>
            </div>
          </div>
        </div>
        <Button
          onClick={handleRefresh}
          variant="outline"
          size="sm"
          disabled={loading}
          className="text-gray-600 hover:text-gray-800"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading your data...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-red-600 mb-4">{error}</p>
              <Button onClick={handleRefresh} variant="outline">
                Try Again
              </Button>
            </div>
          </div>
        ) : (
          <div className="h-full flex">
            {/* Stats Cards */}
            <div className="w-80 p-6 border-r border-gray-200 bg-white overflow-y-auto">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Your Activity</h2>
              
              <div className="space-y-3">
                {/* My Posts */}
                <Card 
                  className={`p-4 cursor-pointer transition-all hover:border-green-300 ${
                    selectedStat === 'my-posts' ? 'border-green-500 bg-green-50' : 'border-gray-200'
                  }`}
                  onClick={() => handleStatClick('my-posts')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <MessageSquare className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">My Posts</p>
                        <p className="text-sm text-gray-600">Threads you created</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-800">{statCounts.myPosts}</p>
                    </div>
                  </div>
                </Card>

                {/* Replied */}
                <Card 
                  className={`p-4 cursor-pointer transition-all hover:border-green-300 ${
                    selectedStat === 'replied' ? 'border-green-500 bg-green-50' : 'border-gray-200'
                  }`}
                  onClick={() => handleStatClick('replied')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <Reply className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">Replied</p>
                        <p className="text-sm text-gray-600">Posts you replied to</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-800">{statCounts.replied}</p>
                    </div>
                  </div>
                </Card>

                {/* Liked */}
                <Card 
                  className={`p-4 cursor-pointer transition-all hover:border-green-300 ${
                    selectedStat === 'liked' ? 'border-green-500 bg-green-50' : 'border-gray-200'
                  }`}
                  onClick={() => handleStatClick('liked')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                        <Heart className="w-5 h-5 text-red-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">Liked</p>
                        <p className="text-sm text-gray-600">Posts you liked</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-800">{statCounts.liked}</p>
                    </div>
                  </div>
                </Card>

                {/* Saved */}
                <Card 
                  className={`p-4 cursor-pointer transition-all hover:border-green-300 ${
                    selectedStat === 'saved' ? 'border-green-500 bg-green-50' : 'border-gray-200'
                  }`}
                  onClick={() => handleStatClick('saved')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                        <Bookmark className="w-5 h-5 text-yellow-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">Saved</p>
                        <p className="text-sm text-gray-600">Posts you saved</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-800">{statCounts.saved}</p>
                    </div>
                  </div>
                </Card>
              </div>
            </div>

            {/* Posts List */}
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-800">
                  {filter === 'my-posts' && 'My Posts'}
                  {filter === 'replied' && 'Posts I Replied To'}
                  {filter === 'liked' && 'Posts I Liked'}
                  {filter === 'saved' && 'Posts I Saved'}
                </h2>
                <Badge variant="outline" className="text-gray-600">
                  {filteredPosts.length} posts
                </Badge>
              </div>

              {filteredPosts.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <MessageSquare className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-800 mb-2">No posts found</h3>
                  <p className="text-gray-600">
                    {filter === 'my-posts' && "You haven't created any public threads yet."}
                    {filter === 'replied' && "You haven't replied to any posts yet."}
                    {filter === 'liked' && "You haven't liked any posts yet."}
                    {filter === 'saved' && "You haven't saved any posts yet."}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredPosts.map((post) => (
                    <Card key={post.id} className="p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <Badge 
                              variant="outline" 
                              className={
                                post.type === 'question' ? 'bg-blue-100 text-blue-800' :
                                post.type === 'answer' ? 'bg-green-100 text-green-800' :
                                post.type === 'conversation' ? 'bg-teal-100 text-teal-800' :
                                'bg-gray-100 text-gray-800'
                              }
                            >
                              {post.type}
                            </Badge>
                            <span className="text-sm text-gray-500">
                              {new Date(post.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <h3 className="font-medium text-gray-800 mb-2">{post.title}</h3>
                          <p className="text-gray-600 text-sm line-clamp-2">{post.content}</p>
                        </div>
                        <Button
                          onClick={() => handleViewPost(post)}
                          variant="outline"
                          size="sm"
                          className="ml-4 text-green-600 border-green-300 hover:bg-green-50"
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
        )}
      </div>
    </div>
  );
}
