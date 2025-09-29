import React, { useEffect, useState } from 'react';
import { SearchIcon, TrendingUpIcon, ClockIcon, PlusIcon, ChevronDown, Lock, Globe } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Thread } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { formatDistanceToNow } from 'date-fns';

interface ForumFeedProps {
  onLogout: () => void;
}

export const ForumFeed: React.FC<ForumFeedProps> = ({ onLogout }) => {
  const { state, dispatch } = useAppContext();
  const isGuest = state.isGuestMode && !state.isAuthenticated;
  const [searchQuery, setSearchQuery] = useState('');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showNewThreadDropdown, setShowNewThreadDropdown] = useState(false);

  useEffect(() => {
    const loadThreads = async () => {
      try {
        setIsLoading(true);
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
        const response = await fetch(`${apiUrl}/threads?filter=${state.feedFilter}`);
        
        if (response.ok) {
          const data = await response.json();
          const threadsArray = Array.isArray(data) ? data : data.threads || [];
          setThreads(threadsArray);
        } else {
          console.error('Failed to load threads:', response.statusText);
        }
      } catch (error) {
        console.error('Failed to load threads:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadThreads();
  }, [state.feedFilter]);

  const handleThreadClick = (thread: Thread) => {
    dispatch({ type: 'SET_CURRENT_THREAD', payload: thread.id });
    dispatch({ type: 'SET_VIEW_MODE', payload: 'public-thread' });
  };

  const handleNewThread = () => {
    dispatch({ type: 'SET_VIEW_MODE', payload: 'private' });
  };

  const filteredThreads = threads.filter(thread =>
    thread.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    thread.creator.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex w-full h-screen bg-gray-50">
      {/* Left Sidebar */}
      <aside className="w-64 h-full bg-white border-r flex flex-col">
        <div className="p-4">
          <div className="relative">
            <Button 
              onClick={() => {
                console.log('New Thread button clicked in Forum, current state:', showNewThreadDropdown);
                setShowNewThreadDropdown(!showNewThreadDropdown);
              }}
              className="w-full bg-gray-800 hover:bg-gray-700 text-white h-auto py-3 flex items-center justify-between"
            >
              <div className="flex items-center">
                <PlusIcon className="w-4 h-4 mr-3" />
                New Thread
              </div>
              <ChevronDown className="w-4 h-4" />
            </Button>
            
            {/* Dropdown Menu */}
            {showNewThreadDropdown && (
              <>
                {console.log('Rendering dropdown menu in Forum')}
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50">
                  <button
                    onClick={() => {
                      console.log('Private Chat option clicked');
                      handleNewThread();
                      setShowNewThreadDropdown(false);
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center border-b border-gray-100"
                  >
                    <Lock className="w-4 h-4 mr-3 text-gray-500" />
                    <div>
                      <div className="font-medium text-gray-800">Private Chat</div>
                      <div className="text-xs text-gray-500">Start with AI, publish later</div>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      console.log('Public Thread option clicked');
                      if (isGuest) {
                        dispatch({ type: 'SET_GUEST_MODE', payload: false });
                      } else {
                        // TODO: Add public thread creation modal here
                        console.log('Public thread creation not implemented in Forum yet');
                      }
                      setShowNewThreadDropdown(false);
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center"
                    disabled={isGuest}
                  >
                    <Globe className="w-4 h-4 mr-3 text-gray-500" />
                    <div>
                      <div className="font-medium text-gray-800">Public Thread</div>
                      <div className="text-xs text-gray-500">Start discussion directly</div>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 px-3">
          <div className="mb-6">
            <div className="text-xs text-gray-500 font-normal tracking-[0.60px] mb-2 px-3">
              Feed
            </div>
            <nav className="space-y-1">
              <div 
                className={`flex items-center px-3 py-2 rounded-md text-base cursor-pointer ${
                  state.feedFilter === 'recent' 
                    ? 'bg-gray-100 text-gray-900' 
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => dispatch({ type: 'SET_FEED_FILTER', payload: 'recent' })}
              >
                <ClockIcon className="w-5 h-4 mr-3" />
                Recent
              </div>
              <div 
                className={`flex items-center px-3 py-2 rounded-md text-base cursor-pointer ${
                  state.feedFilter === 'trending' 
                    ? 'bg-gray-100 text-gray-900' 
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => dispatch({ type: 'SET_FEED_FILTER', payload: 'trending' })}
              >
                <TrendingUpIcon className="w-5 h-4 mr-3" />
                Trending
              </div>
            </nav>
          </div>
        </div>

        {/* User Profile */}
        <div className="border-t p-4">
          {isGuest ? (
            <div className="text-center">
              <div className="text-sm text-gray-600 mb-2">Guest Mode</div>
              <Button
                onClick={() => dispatch({ type: 'SET_GUEST_MODE', payload: false })}
                size="sm"
                className="w-full"
              >
                Sign In
              </Button>
            </div>
          ) : (
            <div className="flex items-center">
              <Avatar className="w-8 h-8">
                <AvatarImage src={state.currentUser?.avatar} alt={state.currentUser?.name} />
                <AvatarFallback>{state.currentUser?.name?.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="ml-3 flex-1">
                <div className="text-sm font-normal text-gray-800">
                  {state.currentUser?.name}
                </div>
                <button 
                  onClick={onLogout}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold text-gray-800">Community Forum</h1>
          </div>
          
          {/* Search */}
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search discussions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </header>

        {/* Thread List */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-800"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredThreads.map((thread) => (
                <Card 
                  key={thread.id} 
                  className="cursor-pointer hover:shadow-md transition-shadow border border-gray-200"
                  onClick={() => handleThreadClick(thread)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <h3 className="text-lg font-medium text-gray-800 hover:text-gray-600">
                        {thread.title}
                      </h3>
                      {thread.category && (
                        <Badge variant="secondary" className="bg-gray-100 text-gray-600 text-xs">
                          {thread.category}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center text-sm text-gray-500 space-x-4 mb-3">
                      <div className="flex items-center">
                        <Avatar className="w-5 h-5 mr-2">
                          <AvatarImage src={thread.creator.avatar} alt={thread.creator.name} />
                          <AvatarFallback>{thread.creator.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span>{thread.creator.name}</span>
                      </div>
                      <span>•</span>
                      <span>{formatDistanceToNow(thread.createdAt)} ago</span>
                      <span>•</span>
                      <span>{thread.questionCount} questions</span>
                      <span>•</span>
                      <span>{thread.answerCount} answers</span>
                    </div>
                    
                    {/* Show first question preview */}
                    {thread.questions && thread.questions.length > 0 && (
                      <div className="text-gray-600 text-sm line-clamp-2">
                        {thread.questions[0].content}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              
              {filteredThreads.length === 0 && !isLoading && (
                <div className="text-center py-12">
                  <div className="text-gray-500 mb-4">No threads found</div>
                  <Button onClick={handleNewThread}>
                    Start the first discussion
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};