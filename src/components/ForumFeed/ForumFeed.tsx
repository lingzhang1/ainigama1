import React, { useEffect, useState } from 'react';
import { Search as SearchIcon, TrendingUp as TrendingUpIcon, Clock as ClockIcon, Plus as PlusIcon, ChevronDown, Lock, Globe, Menu, X, Loader as Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Card, CardContent } from '../ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { FloatingActionButton } from '../ui/FloatingActionButton';
import { NewThreadModal } from './NewThreadModal';
import { Thread } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { formatDistanceToNow } from 'date-fns';
import { useMobileDrawer } from '../../hooks/useMobileDrawer';
import { useSwipeGesture } from '../../hooks/useSwipeGesture';

interface ForumFeedProps {
  onLogout: () => void;
}

const suggestedTopics = [
  'Trust in long-distance relationships',
  'Boundaries in friendships',
  'Emotional vulnerability',
  'Conflict resolution in marriage',
  'Dating after divorce'
];

const popularQuestions = [
  {
    question: 'How do you rebuild trust after it\'s been broken?',
    answers: '15 answers',
    category: 'Relationships'
  },
  {
    question: 'What are signs of emotional manipulation in relationships?',
    answers: '23 answers',
    category: 'Psychology'
  },
  {
    question: 'How important is physical intimacy in a long-term relationship?',
    answers: '31 answers',
    category: 'Intimacy'
  }
];

export const ForumFeed: React.FC<ForumFeedProps> = ({ onLogout }) => {
  const { state, dispatch } = useAppContext();
  const isGuest = state.isGuestMode && !state.isAuthenticated;
  const [searchQuery, setSearchQuery] = useState('');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showNewThreadDropdown, setShowNewThreadDropdown] = useState(false);
  const [showNewThreadModal, setShowNewThreadModal] = useState(false);
  const [showPublicThreadModal, setShowPublicThreadModal] = useState(false);
  const [publicThreadForm, setPublicThreadForm] = useState({
    title: '',
    category: 'General',
    question: ''
  });
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const { isOpen: isLeftDrawerOpen, isMobile, toggle: toggleLeftDrawer, close: closeLeftDrawer, open: openLeftDrawer } = useMobileDrawer();
  const { isOpen: isRightDrawerOpen, toggle: toggleRightDrawer, close: closeRightDrawer, open: openRightDrawer } = useMobileDrawer();

  // Swipe gestures for mobile
  useSwipeGesture({
    onSwipeRight: () => {
      if (isMobile && !isLeftDrawerOpen) {
        openLeftDrawer();
      }
    },
    onSwipeLeft: () => {
      if (isMobile && !isRightDrawerOpen) {
        openRightDrawer();
      }
    },
    enabled: isMobile && !isLeftDrawerOpen && !isRightDrawerOpen,
  });

  // Close dropdown when drawer closes
  useEffect(() => {
    if (!isLeftDrawerOpen && showNewThreadDropdown) {
      setShowNewThreadDropdown(false);
    }
  }, [isLeftDrawerOpen, showNewThreadDropdown]);

  useEffect(() => {
    const loadThreads = async () => {
      try {
        setIsLoading(true);
        // Use local Node.js server for development, AWS for production
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
        console.log('Loading threads from:', apiUrl);
        
        const response = await fetch(`${apiUrl}/threads?filter=${state.feedFilter}`);
        
        if (response.ok) {
          const loadedThreads = await response.json();
          // Extract threads array from response object
          const threadsArray = loadedThreads.threads || loadedThreads;
          console.log('Loaded threads:', threadsArray.length);
          setThreads(threadsArray);
          dispatch({ type: 'SET_THREADS', payload: threadsArray });
        } else {
          console.error('Failed to load threads:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('Failed to load threads:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadThreads();
  }, [state.feedFilter]);

  const handleThreadClick = (threadId: string) => {
    dispatch({ type: 'SET_CURRENT_THREAD', payload: threadId });
    dispatch({ type: 'SET_VIEW_MODE', payload: 'public-thread' });
  };

  const handleNewThread = () => {
    dispatch({ type: 'SET_VIEW_MODE', payload: 'private' });
  };

  const handleCreatePublicThread = async () => {
    if (!publicThreadForm.title.trim() || !publicThreadForm.question.trim() || !state.currentUser) {
      return;
    }

    try {
      setIsCreatingThread(true);
      
      // Create thread data similar to PrivateChat publish functionality
      const threadData = {
        title: publicThreadForm.title.trim(),
        creatorId: state.currentUser.id,
        category: publicThreadForm.category,
        questions: [{
          id: `question-${Date.now()}`,
          content: publicThreadForm.question.trim(),
          userId: state.currentUser.id,
          timestamp: new Date().toISOString()
        }],
        initialAnswers: [] // No initial answers for direct public threads
      };

      // Call API to create public thread
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
      const response = await fetch(`${apiUrl}/threads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(threadData)
      });

      if (response.ok) {
        const newThread = await response.json();
        console.log('✅ Successfully created public thread:', newThread.id);
        
        // Update app state
        dispatch({ type: 'ADD_THREAD', payload: newThread });
        dispatch({ type: 'SET_CURRENT_THREAD', payload: newThread.id });
        dispatch({ type: 'SET_VIEW_MODE', payload: 'public-thread' });
        
        // Reset form and close modal
        setPublicThreadForm({ title: '', category: 'General', question: '' });
        setShowPublicThreadModal(false);
      } else {
        console.error('Failed to create public thread:', response.statusText);
        const errorText = await response.text();
        console.error('Error details:', errorText);
      }
    } catch (error) {
      console.error('Error creating public thread:', error);
    } finally {
      setIsCreatingThread(false);
    }
  };

  const filteredThreads = threads.filter(thread =>
    thread.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    thread.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex w-full h-screen bg-gray-50">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-white border-b z-30 px-4 py-3 flex items-center justify-between">
        <button
          onClick={toggleLeftDrawer}
          className="p-2 hover:bg-gray-100 rounded-lg"
          aria-label="Toggle menu"
        >
          <Menu className="w-6 h-6 text-gray-700" />
        </button>
        <h1 className="text-lg font-semibold text-gray-800">MELON</h1>
        <button
          onClick={toggleRightDrawer}
          className="p-2 hover:bg-gray-100 rounded-lg"
          aria-label="Toggle suggestions"
        >
          <SearchIcon className="w-6 h-6 text-gray-700" />
        </button>
      </div>

      {/* Left Sidebar Backdrop (Mobile) */}
      {isLeftDrawerOpen && isMobile && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={closeLeftDrawer}
        />
      )}

      {/* Left Sidebar */}
      <aside className={`
        w-64 h-full bg-white border-r flex flex-col
        fixed md:relative
        inset-y-0 left-0
        z-50 md:z-auto
        transform transition-transform duration-300 ease-in-out
        ${isLeftDrawerOpen || !isMobile ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0
      `}>
        <div className="p-4">
          {/* Mobile Close Button */}
          <div className="md:hidden flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Menu</h2>
            <button
              onClick={closeLeftDrawer}
              className="p-2 hover:bg-gray-100 rounded-lg"
              aria-label="Close menu"
            >
              <X className="w-5 h-5 text-gray-700" />
            </button>
          </div>

          <div className="relative">
            <Button 
              onClick={() => setShowNewThreadDropdown(!showNewThreadDropdown)}
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
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50">
                <button
                  onClick={() => {
                    dispatch({ type: 'SET_VIEW_MODE', payload: 'private' });
                    setShowNewThreadDropdown(false);
                    closeLeftDrawer();
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
                    if (isGuest) {
                      dispatch({ type: 'SET_GUEST_MODE', payload: false });
                    } else {
                      setShowPublicThreadModal(true);
                    }
                    setShowNewThreadDropdown(false);
                  }}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center"
                >
                  <Globe className="w-4 h-4 mr-3 text-gray-500" />
                  <div>
                    <div className="font-medium text-gray-800">Public Thread</div>
                    <div className="text-xs text-gray-500">
                      {isGuest ? 'Sign in to create public threads' : 'Start discussion directly'}
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 px-3">
          <div className="mb-6">
            <div className="text-xs text-gray-500 font-normal tracking-[0.60px] mb-2 px-3">
              Main
            </div>
            <nav className="space-y-1">
              <div className="flex items-center px-3 py-2 rounded-md text-base bg-gray-100 text-gray-700">
                <SearchIcon className="w-5 h-4 mr-3" />
                Home
              </div>
              <div
                className="flex items-center px-3 py-2 rounded-md text-base text-gray-700 hover:bg-gray-50 cursor-pointer"
                onClick={() => {
                  dispatch({ type: 'SET_VIEW_MODE', payload: 'private' });
                  closeLeftDrawer();
                }}
              >
                <ClockIcon className="w-5 h-4 mr-3" />
                My Threads
              </div>
            </nav>
          </div>

          <div>
            <div className="text-xs text-gray-500 font-normal tracking-[0.60px] mb-2 px-3">
              Categories
            </div>
            <nav className="space-y-1">
              {['Relationships', 'Psychology', 'Marriage', 'Friendship', 'Intimacy'].map((category) => (
                <div
                  key={category}
                  className="flex items-center px-3 py-2 text-gray-700 text-base hover:bg-gray-50 rounded-md cursor-pointer"
                >
                  <div className="w-4 h-4 mr-3 bg-gray-300 rounded-full"></div>
                  {category}
                </div>
              ))}
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
      <main className="flex-1 overflow-hidden md:mt-0 flex flex-col">
        {/* Header - Sticky on scroll */}
        <header className="bg-white border-b p-4 sticky top-14 md:top-0 z-20 shadow-sm">
          <div className="flex flex-col space-y-3 md:space-y-0 md:flex-row md:items-center md:justify-between mb-3 md:mb-4">
            <h1 className="text-lg md:text-xl font-normal text-gray-800 hidden md:block">Knowledge Feed</h1>
            <div className="flex gap-2 w-full md:w-auto">
              <Button
                variant={state.feedFilter === 'recent' ? 'default' : 'outline'}
                size="sm"
                onClick={() => dispatch({ type: 'SET_FEED_FILTER', payload: 'recent' })}
                className="flex items-center gap-2 flex-1 md:flex-none justify-center"
              >
                <ClockIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Recent</span>
              </Button>
              <Button
                variant={state.feedFilter === 'trending' ? 'default' : 'outline'}
                size="sm"
                onClick={() => dispatch({ type: 'SET_FEED_FILTER', payload: 'trending' })}
                className="flex items-center gap-2 flex-1 md:flex-none justify-center"
              >
                <TrendingUpIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Trending</span>
              </Button>
            </div>
          </div>

          <div className="relative">
            <SearchIcon className="absolute w-4 h-4 top-1/2 left-3 transform -translate-y-1/2 text-gray-400" />
            <Input
              className="w-full pl-10 h-12 md:h-10"
              placeholder="Search topics, questions, and answers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </header>

        {/* Thread List */}
        <div className="p-4 md:p-6 overflow-y-auto flex-1 mt-14">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <span className="ml-3 text-gray-600">Loading threads...</span>
            </div>
          ) : threads.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">No threads found</p>
              <Button onClick={handleNewThread}>
                Create the first thread
              </Button>
            </div>
          ) : (
          <div className="space-y-4">
            {filteredThreads.map((thread) => (
              <Card
                key={thread.id}
                className="border border-gray-200 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => {
                  handleThreadClick(thread.id);
                  closeLeftDrawer();
                  closeRightDrawer();
                }}
              >
                <CardContent className="p-3 md:p-4">
                  <div className="flex items-start justify-between mb-2 md:mb-3">
                    <h3 className="text-base md:text-lg font-normal text-gray-800 leading-6 md:leading-7 flex-1 mr-4">
                      {thread.title}
                    </h3>
                    {thread.category && (
                      <Badge variant="secondary" className="bg-gray-100 text-gray-600 text-xs flex-shrink-0">
                        {thread.category}
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center text-xs md:text-sm text-gray-500 gap-2 md:gap-4">
                    <div className="flex items-center">
                      <Avatar className="w-4 h-4 md:w-5 md:h-5 mr-1 md:mr-2">
                        <AvatarImage src={thread.creator.avatar} alt={thread.creator.name} />
                        <AvatarFallback>{thread.creator.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span>{thread.creator.name}</span>
                    </div>

                    <div className="flex items-center">
                      <ClockIcon className="w-3.5 h-3.5 mr-2" />
                      <span>Updated {formatDistanceToNow(thread.updatedAt)} ago</span>
                    </div>

                    <span>{thread.questionCount} questions</span>
                    <span>{thread.answerCount} answers</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          )}
        </div>
      </main>

      {/* Public Thread Creation Modal */}
      {showPublicThreadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg mx-4 bg-white">
            <CardContent className="p-0">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b">
                <h3 className="text-xl font-semibold text-gray-900">Create Public Thread</h3>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    setShowPublicThreadModal(false);
                    setPublicThreadForm({ title: '', category: 'General', question: '' });
                  }}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                <div>
                  <p className="text-gray-600 text-sm leading-relaxed mb-4">
                    Create a new public discussion thread that the community can engage with.
                  </p>
                </div>

                {/* Thread Title */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Thread Title *
                  </label>
                  <Input
                    placeholder="Give your thread a descriptive title..."
                    value={publicThreadForm.title}
                    onChange={(e) => setPublicThreadForm(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full"
                  />
                </div>

                {/* Category Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Category
                  </label>
                  <select 
                    value={publicThreadForm.category}
                    onChange={(e) => setPublicThreadForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="General">General</option>
                    <option value="Relationships">Relationships</option>
                    <option value="Psychology">Psychology</option>
                    <option value="Marriage">Marriage</option>
                    <option value="Friendship">Friendship</option>
                    <option value="Intimacy">Intimacy</option>
                  </select>
                </div>

                {/* Question Content */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Your Question *
                  </label>
                  <Textarea
                    placeholder="What would you like to ask the community? Be specific and provide context to get better responses..."
                    value={publicThreadForm.question}
                    onChange={(e) => setPublicThreadForm(prev => ({ ...prev, question: e.target.value }))}
                    className="min-h-[120px] w-full"
                    rows={5}
                  />
                </div>

                {/* Privacy Notice */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <Globe className="h-5 w-5 text-blue-600 mt-0.5" />
                    </div>
                    <div className="text-sm">
                      <p className="text-blue-800 font-medium mb-1">
                        This will be public
                      </p>
                      <p className="text-blue-700">
                        Your thread will be visible to all community members. Others can add answers and engage in discussions.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end space-x-3 p-6 border-t bg-gray-50">
                <Button 
                  onClick={() => {
                    setShowPublicThreadModal(false);
                    setPublicThreadForm({ title: '', category: 'General', question: '' });
                  }}
                  variant="outline"
                  className="px-4 py-2"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreatePublicThread}
                  disabled={!publicThreadForm.title.trim() || !publicThreadForm.question.trim() || isCreatingThread}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isCreatingThread ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Creating...
                    </>
                  ) : (
                    'Create Thread'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Right Sidebar Backdrop (Mobile) */}
      {isRightDrawerOpen && isMobile && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={closeRightDrawer}
        />
      )}

      {/* Right Sidebar */}
      <aside className={`
        w-72 h-full bg-white border-l overflow-y-auto
        fixed md:relative
        inset-y-0 right-0
        z-50 md:z-auto
        transform transition-transform duration-300 ease-in-out
        ${isRightDrawerOpen || !isMobile ? 'translate-x-0' : 'translate-x-full'}
        md:translate-x-0
        mt-14 md:mt-0
      `}>
        <div className="p-4">
          {/* Mobile Close Button */}
          <div className="md:hidden flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Suggestions</h2>
            <button
              onClick={closeRightDrawer}
              className="p-2 hover:bg-gray-100 rounded-lg"
              aria-label="Close suggestions"
            >
              <X className="w-5 h-5 text-gray-700" />
            </button>
          </div>
          <div className="mb-6">
            <h2 className="text-sm font-normal text-gray-800 mb-4">
              Suggested Topics
            </h2>
            <div className="space-y-2">
              {suggestedTopics.map((topic, index) => (
                <div key={index} className="bg-gray-50 rounded-md p-3 hover:bg-gray-100 cursor-pointer">
                  <div className="text-sm text-gray-800">{topic}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-normal text-gray-800 mb-4">
              Popular Questions
            </h2>
            <div className="space-y-0">
              {popularQuestions.map((item, index) => (
                <div
                  key={index}
                  className={`py-4 hover:bg-gray-50 cursor-pointer px-2 rounded ${
                    index < popularQuestions.length - 1 ? 'border-b border-gray-100' : ''
                  }`}
                >
                  <div className="text-sm text-gray-800 leading-5 mb-2">
                    {item.question}
                  </div>
                  <div className="flex items-center text-xs text-gray-500">
                    <span>{item.answers}</span>
                    <span className="mx-2">•</span>
                    <span>{item.category}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Floating Action Button - Mobile Only */}
      <FloatingActionButton
        onClick={() => setShowNewThreadModal(true)}
        icon={<PlusIcon className="w-6 h-6" />}
        label="New"
      />

      {/* New Thread Selection Modal */}
      <NewThreadModal
        isOpen={showNewThreadModal}
        onClose={() => setShowNewThreadModal(false)}
        onSelectPrivateChat={() => {
          dispatch({ type: 'SET_VIEW_MODE', payload: 'private' });
        }}
        onSelectPublicThread={() => {
          if (isGuest) {
            dispatch({ type: 'SET_GUEST_MODE', payload: false });
          } else {
            setShowPublicThreadModal(true);
          }
        }}
        isGuest={isGuest}
      />
    </div>
  );
};