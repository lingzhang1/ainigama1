import React, { useEffect, useState } from 'react';
import { SearchIcon, TrendingUpIcon, ClockIcon, PlusIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Thread } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { awsService } from '../../services/aws';
import { formatDistanceToNow } from 'date-fns';

interface ForumFeedProps {
  onLogout: () => void;
}

const mockThreads: Thread[] = [
  {
    id: '1',
    title: 'How to maintain healthy long-term relationships?',
    creator: {
      id: '1',
      name: 'Sarah Johnson',
      avatar: '/img-4.svg',
      handle: '@sarahjohnson'
    },
    isPublic: true,
    createdAt: new Date('2025-02-15'),
    updatedAt: new Date('2025-02-15'),
    questionCount: 8,
    answerCount: 23,
    interactionCount: 45,
    questions: [],
    category: 'Relationships'
  },
  {
    id: '2',
    title: 'The psychology of emotional intelligence in friendships',
    creator: {
      id: '2',
      name: 'David Chen',
      avatar: '/img-1.svg',
      handle: '@davidchen'
    },
    isPublic: true,
    createdAt: new Date('2025-03-02'),
    updatedAt: new Date('2025-03-02'),
    questionCount: 5,
    answerCount: 17,
    interactionCount: 32,
    questions: [],
    category: 'Friendship'
  },
  {
    id: '3',
    title: 'Navigating intimacy issues in modern relationships',
    creator: {
      id: '3',
      name: 'Dr. Emily Rodriguez',
      avatar: '/img-3.svg',
      handle: '@emilyrodriguez'
    },
    isPublic: true,
    createdAt: new Date('2025-01-28'),
    updatedAt: new Date('2025-01-28'),
    questionCount: 12,
    answerCount: 34,
    interactionCount: 67,
    questions: [],
    category: 'Intimacy'
  }
];

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
  const [searchQuery, setSearchQuery] = useState('');
  const [threads, setThreads] = useState<Thread[]>(mockThreads);

  useEffect(() => {
    const loadThreads = async () => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });
        const loadedThreads = await awsService.getPublicThreads(state.feedFilter);
        if (loadedThreads.length === 0) {
          setThreads(mockThreads); // Use mock data for demo
        } else {
          setThreads(loadedThreads);
        }
        dispatch({ type: 'SET_THREADS', payload: threads });
      } catch (error) {
        console.error('Failed to load threads:', error);
        setThreads(mockThreads); // Fallback to mock data
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
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

  const filteredThreads = threads.filter(thread =>
    thread.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    thread.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex w-full h-screen bg-gray-50">
      {/* Left Sidebar */}
      <aside className="w-64 h-full bg-white border-r flex flex-col">
        <div className="p-4">
          <Button 
            onClick={handleNewThread}
            className="w-full bg-gray-800 hover:bg-gray-700 text-white h-auto py-3"
          >
            <PlusIcon className="w-4 h-4 mr-3" />
            New Thread
          </Button>
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
                onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'private' })}
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
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b p-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-normal text-gray-800">Knowledge Feed</h1>
            <div className="flex gap-2">
              <Button
                variant={state.feedFilter === 'recent' ? 'default' : 'outline'}
                size="sm"
                onClick={() => dispatch({ type: 'SET_FEED_FILTER', payload: 'recent' })}
                className="flex items-center gap-2"
              >
                <ClockIcon className="w-4 h-4" />
                Recent
              </Button>
              <Button
                variant={state.feedFilter === 'trending' ? 'default' : 'outline'}
                size="sm"
                onClick={() => dispatch({ type: 'SET_FEED_FILTER', payload: 'trending' })}
                className="flex items-center gap-2"
              >
                <TrendingUpIcon className="w-4 h-4" />
                Trending
              </Button>
            </div>
          </div>

          <div className="relative">
            <SearchIcon className="absolute w-4 h-4 top-1/2 left-3 transform -translate-y-1/2 text-gray-400" />
            <Input
              className="w-full pl-10"
              placeholder="Search topics, questions, and answers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </header>

        {/* Thread List */}
        <div className="p-6 overflow-y-auto">
          <div className="space-y-4">
            {filteredThreads.map((thread) => (
              <Card 
                key={thread.id} 
                className="border border-gray-200 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleThreadClick(thread.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-lg font-normal text-gray-800 leading-7 flex-1 mr-4">
                      {thread.title}
                    </h3>
                    {thread.category && (
                      <Badge variant="secondary" className="bg-gray-100 text-gray-600 text-xs">
                        {thread.category}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center text-sm text-gray-500 space-x-4">
                    <div className="flex items-center">
                      <Avatar className="w-5 h-5 mr-2">
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
        </div>
      </main>

      {/* Right Sidebar */}
      <aside className="w-72 h-full bg-white border-l overflow-y-auto">
        <div className="p-4">
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
    </div>
  );
};