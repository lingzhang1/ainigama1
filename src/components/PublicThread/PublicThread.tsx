import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, MessageSquare, Users, Clock, Brain, Loader2, Plus, ArrowUpDown, MessageCircle, X, Send, ChevronDown, Lock, Globe } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Card, CardContent } from '../ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Thread, Question, Answer, Comment } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { usePublicThread } from '../../hooks/useWebSocket';
import { deepSeekService, ChatMessage } from '../../services/deepseek';
import { formatDistanceToNow } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

interface PublicThreadProps {
  onLogout: () => void;
}

export const PublicThread: React.FC<PublicThreadProps> = ({ onLogout }) => {
  const { state, dispatch } = useAppContext();
  const isGuest = state.isGuestMode && !state.isAuthenticated;
  const [thread, setThread] = useState<Thread | null>(null);
  const [answers, setAnswers] = useState<{ [questionId: string]: Answer[] }>({});
  const [comments, setComments] = useState<{ [answerId: string]: Comment[] }>({});
  const [newAnswer, setNewAnswer] = useState<{ [questionId: string]: string }>({});
  const [newComment, setNewComment] = useState<{ [answerId: string]: string }>({});
  const [newQuestion, setNewQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [commentPanelOpen, setCommentPanelOpen] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // New thread modal state
  const [showNewThreadModal, setShowNewThreadModal] = useState(false);
  const [showNewThreadDropdown, setShowNewThreadDropdown] = useState(false);
  const [newThreadData, setNewThreadData] = useState({
    title: '',
    category: 'Relationships',
    question: ''
  });
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  
  // AI streaming state management using refs (like PrivateChat)
  const [isAIAnswering, setIsAIAnswering] = useState<{ [questionId: string]: boolean }>({});
  const streamingRefs = React.useRef<{ [questionId: string]: {
    thinking: string;
    content: string;
    isActive: boolean;
    thinkingElement: HTMLDivElement | null;
    contentElement: HTMLDivElement | null;
    streamingContainer: HTMLDivElement | null;
  } }>({});

  // WebSocket hook for real-time updates
  const { addAnswer, addComment } = usePublicThread(
    state.currentThreadId || '',
    (answer: Answer) => {
      setAnswers(prev => ({
        ...prev,
        [answer.questionId]: [...(prev[answer.questionId] || []), answer]
      }));
    },
    (comment: Comment) => {
      setComments(prev => ({
        ...prev,
        [comment.answerId]: [...(prev[comment.answerId] || []), comment]
      }));
    },
    (updatedThread: Thread) => {
      setThread(updatedThread);
    }
  );

  // Load thread data
  useEffect(() => {
    const loadThread = async () => {
      if (!state.currentThreadId) return;
      
      try {
        setIsLoading(true);
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
        
        // Load thread details
        const threadResponse = await fetch(`${apiUrl}/threads/${state.currentThreadId}`);
        if (threadResponse.ok) {
          const threadData = await threadResponse.json();
          setThread(threadData);
        }
        
        // Load answers for all questions
        const answersResponse = await fetch(`${apiUrl}/threads/${state.currentThreadId}/answers`);
        if (answersResponse.ok) {
          const answersData = await answersResponse.json();
          setAnswers(answersData);
        }
        
      } catch (error) {
        console.error('Failed to load thread:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadThread();
  }, [state.currentThreadId]);

  // Load comments for answers
  useEffect(() => {
    const loadComments = async () => {
      const allAnswers = Object.values(answers).flat();
      
      for (const answer of allAnswers) {
        if (!comments[answer.id]) {
          try {
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
            const response = await fetch(`${apiUrl}/answers/${answer.id}/comments`);
            if (response.ok) {
              const answerComments = await response.json();
              setComments(prev => ({
                ...prev,
                [answer.id]: answerComments
              }));
            }
          } catch (error) {
            console.error('Failed to load comments for answer:', answer.id, error);
          }
        }
      }
    };

    if (Object.keys(answers).length > 0) {
      loadComments();
    }
  }, [answers]);

  const handleNewThread = () => {
    dispatch({ type: 'SET_VIEW_MODE', payload: 'private' });
  };

  const handleAddQuestion = async () => {
    if (!newQuestion.trim() || !thread || !state.currentUser) return;
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
      const response = await fetch(`${apiUrl}/threads/${thread.id}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newQuestion.trim(),
          userId: state.currentUser.id
        })
      });
      
      if (response.ok) {
        const newQuestionData = await response.json();
        setThread(prev => prev ? {
          ...prev,
          questions: [...prev.questions, newQuestionData],
          questionCount: prev.questionCount + 1
        } : null);
        setNewQuestion('');
      }
    } catch (error) {
      console.error('Failed to add question:', error);
    }
  };

  const handleAddAnswer = async (questionId: string) => {
    const content = newAnswer[questionId]?.trim();
    if (!content || !state.currentUser) return;

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
      const response = await fetch(`${apiUrl}/questions/${questionId}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          userId: state.currentUser.id,
          isAI: false,
          isPinned: false
        })
      });

      if (response.ok) {
        const newAnswerData = await response.json();
        setAnswers(prev => ({
          ...prev,
          [questionId]: [...(prev[questionId] || []), newAnswerData.answer]
        }));
        setNewAnswer(prev => ({ ...prev, [questionId]: '' }));
        
        // Also send via WebSocket for real-time updates
        addAnswer(questionId, content);
      }
    } catch (error) {
      console.error('Failed to add answer:', error);
    }
  };

  const handleAIAnswer = async (questionId: string) => {
    if (isAIAnswering[questionId]) return;
    
    const question = thread?.questions.find(q => q.id === questionId);
    if (!question) return;

    // Set AI answering state
    setIsAIAnswering(prev => ({ ...prev, [questionId]: true }));
    
    // Initialize streaming refs for this question
    streamingRefs.current[questionId] = {
      thinking: '',
      content: '',
      isActive: true,
      thinkingElement: null,
      contentElement: null,
      streamingContainer: null,
    };

    try {
      // Prepare context for AI
      const chatMessages: ChatMessage[] = [
        {
          role: 'user',
          content: question.content
        }
      ];

      // Add existing answers as context
      const existingAnswers = answers[questionId] || [];
      existingAnswers.forEach(answer => {
        chatMessages.push({
          role: 'assistant',
          content: answer.content
        });
      });

      // Show streaming UI
      const showStreamingUI = (qId: string) => {
        const container = streamingRefs.current[qId]?.streamingContainer;
        if (container) {
          container.style.display = 'block';
        }
      };

      const hideStreamingUI = (qId: string) => {
        const container = streamingRefs.current[qId]?.streamingContainer;
        if (container) {
          container.style.display = 'none';
        }
      };

      const updateStreamingDisplay = (qId: string) => {
        const refs = streamingRefs.current[qId];
        if (!refs) return;
        
        showStreamingUI(qId);
        if (refs.thinkingElement) {
          refs.thinkingElement.textContent = refs.thinking;
        }
        if (refs.contentElement) {
          refs.contentElement.textContent = refs.content;
        }
      };

      // Stream AI response
      await deepSeekService.streamChat(chatMessages, {
        onThinking: (thinking) => {
          if (streamingRefs.current[questionId]?.isActive) {
            streamingRefs.current[questionId].thinking += thinking;
            updateStreamingDisplay(questionId);
          }
        },
        onContent: (content) => {
          if (streamingRefs.current[questionId]?.isActive) {
            streamingRefs.current[questionId].content += content;
            updateStreamingDisplay(questionId);
          }
        },
        onComplete: async (fullContent) => {
          if (!streamingRefs.current[questionId]?.isActive) return;
          
          streamingRefs.current[questionId].isActive = false;
          hideStreamingUI(questionId);
          
          const finalThinking = streamingRefs.current[questionId].thinking;
          
          // Save AI answer to backend
          try {
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
            const response = await fetch(`${apiUrl}/questions/${questionId}/answers`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: fullContent,
                userId: null,
                isAI: true,
                isPinned: true,
                thinking: finalThinking || undefined
              })
            });

            if (response.ok) {
              const newAnswerData = await response.json();
              setAnswers(prev => ({
                ...prev,
                [questionId]: [...(prev[questionId] || []), newAnswerData.answer]
              }));
              
              // Also send via WebSocket
              addAnswer(questionId, fullContent);
            }
          } catch (error) {
            console.error('Failed to save AI answer:', error);
          }
          
          setIsAIAnswering(prev => ({ ...prev, [questionId]: false }));
        },
        onError: (error) => {
          console.error('AI answer error:', error);
          streamingRefs.current[questionId].isActive = false;
          hideStreamingUI(questionId);
          setIsAIAnswering(prev => ({ ...prev, [questionId]: false }));
        }
      });

    } catch (error) {
      console.error('Failed to get AI answer:', error);
      setIsAIAnswering(prev => ({ ...prev, [questionId]: false }));
    }
  };

  const handleAddComment = async (answerId: string) => {
    const content = newComment[answerId]?.trim();
    if (!content || !state.currentUser) return;

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
      const response = await fetch(`${apiUrl}/answers/${answerId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          userId: state.currentUser.id
        })
      });

      if (response.ok) {
        const newCommentData = await response.json();
        setComments(prev => ({
          ...prev,
          [answerId]: [...(prev[answerId] || []), newCommentData]
        }));
        setNewComment(prev => ({ ...prev, [answerId]: '' }));
        
        // Also send via WebSocket
        addComment(answerId, content);
      }
    } catch (error) {
      console.error('Failed to add comment:', error);
    }
  };

  // Handle creating new public thread
  const handleCreatePublicThread = async () => {
    if (!newThreadData.title.trim() || !newThreadData.question.trim() || !state.currentUser) {
      return;
    }

    try {
      setIsCreatingThread(true);
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
      
      const threadData = {
        title: newThreadData.title.trim(),
        creatorId: state.currentUser.id,
        category: newThreadData.category,
        questions: [{
          id: uuidv4(),
          content: newThreadData.question.trim(),
          userId: state.currentUser.id,
          timestamp: new Date().toISOString()
        }],
        initialAnswers: []
      };

      const response = await fetch(`${apiUrl}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(threadData)
      });

      if (response.ok) {
        const newThread = await response.json();
        
        // Update app state
        dispatch({ type: 'ADD_THREAD', payload: newThread });
        dispatch({ type: 'SET_CURRENT_THREAD', payload: newThread.id });
        
        // Reset modal state
        setShowNewThreadModal(false);
        setNewThreadData({ title: '', category: 'Relationships', question: '' });
        
        // Refresh the current view to show the new thread
        window.location.reload();
      } else {
        console.error('Failed to create thread:', response.statusText);
      }
    } catch (error) {
      console.error('Error creating thread:', error);
    } finally {
      setIsCreatingThread(false);
    }
  };

  // Sort questions based on timestamp
  const getSortedQuestions = () => {
    if (!thread) return [];
    return [...thread.questions].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  };

  // Sort answers: pinned first, then by timestamp
  const getSortedAnswers = (questionId: string) => {
    const questionAnswers = answers[questionId] || [];
    return [...questionAnswers].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });
  };

  if (!thread) {
    return (
      <div className="flex w-full h-screen bg-gray-50">
        <aside className="w-64 h-full bg-white border-r flex flex-col">
          <div className="p-4">
            <div className="relative">
              <Button 
                onClick={() => setShowNewThreadDropdown(!showNewThreadDropdown)}
                className="w-full bg-gray-800 hover:bg-gray-700 text-white h-auto py-3 flex items-center justify-between"
              >
                <div className="flex items-center">
                  <Plus className="w-4 h-4 mr-3" />
                  New Thread
                </div>
                <ChevronDown className="w-4 h-4" />
              </Button>
              
              {/* Dropdown Menu */}
              {showNewThreadDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                  <button
                    onClick={() => {
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
                      if (isGuest) {
                        dispatch({ type: 'SET_GUEST_MODE', payload: false });
                      } else {
                        setShowNewThreadModal(true);
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
              )}
            </div>
          </div>
        </aside>
        
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-800 mb-2">No thread selected</h3>
            <p className="text-gray-500 mb-4">Select a thread from the forum to view the discussion</p>
            <Button onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'forum' })}>
              Back to Forum
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex w-full h-screen bg-gray-50">
      {/* Left Sidebar */}
      <aside className="w-64 h-full bg-white border-r flex flex-col">
        <div className="p-4">
          <div className="relative">
            <Button 
              onClick={() => setShowNewThreadDropdown(!showNewThreadDropdown)}
              className="w-full bg-gray-800 hover:bg-gray-700 text-white h-auto py-3 flex items-center justify-between"
            >
              <div className="flex items-center">
                <Plus className="w-4 h-4 mr-3" />
                New Thread
              </div>
              <ChevronDown className="w-4 h-4" />
            </Button>
            
            {/* Dropdown Menu */}
            {showNewThreadDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                <button
                  onClick={() => {
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
                    if (isGuest) {
                      dispatch({ type: 'SET_GUEST_MODE', payload: false });
                    } else {
                      setShowNewThreadModal(true);
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
            )}
          </div>
        </div>

        <div className="flex-1 px-3">
          <div className="mb-6">
            <div className="text-xs text-gray-500 font-normal tracking-[0.60px] mb-2 px-3">
              Navigation
            </div>
            <nav className="space-y-1">
              <div 
                className="flex items-center px-3 py-2 rounded-md text-base text-gray-700 hover:bg-gray-50 cursor-pointer"
                onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'forum' })}
              >
                <ArrowLeft className="w-5 h-4 mr-3" />
                Back to Forum
              </div>
              <div 
                className="flex items-center px-3 py-2 rounded-md text-base text-gray-700 hover:bg-gray-50 cursor-pointer"
                onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'private' })}
              >
                <MessageSquare className="w-5 h-4 mr-3" />
                My Threads
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
        <header className="bg-white border-b p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <h1 className="text-xl font-normal text-gray-800 mr-4">{thread.title}</h1>
              {thread.category && (
                <Badge variant="secondary" className="bg-gray-100 text-gray-600 text-xs">
                  {thread.category}
                </Badge>
              )}
            </div>
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
              <Clock className="w-3.5 h-3.5 mr-2" />
              <span>Created {formatDistanceToNow(thread.createdAt)} ago</span>
            </div>
            <span>{thread.questionCount} questions</span>
            <span>{thread.answerCount} answers</span>
          </div>
        </header>

        {/* Questions and Answers */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {getSortedQuestions().map((question, questionIndex) => (
            <div key={question.id} className="space-y-4">
              {/* Question */}
              <Card className="border border-gray-200">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-800">
                      Question {questionIndex + 1}
                    </h3>
                    <div className="text-sm text-gray-500">
                      {formatDistanceToNow(question.timestamp)} ago
                    </div>
                  </div>
                  <div className="text-gray-700 whitespace-pre-wrap mb-4">
                    {question.content}
                  </div>
                  
                  {/* AI Answer Button */}
                  {!isGuest && (
                    <div className="flex items-center space-x-2">
                      <Button
                        onClick={() => handleAIAnswer(question.id)}
                        disabled={isAIAnswering[question.id]}
                        size="sm"
                        variant="outline"
                        className="flex items-center gap-2"
                      >
                        {isAIAnswering[question.id] ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            AI is thinking...
                          </>
                        ) : (
                          <>
                            <Brain className="w-4 h-4" />
                            Get AI Answer
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Streaming AI Response */}
              <div 
                ref={(el) => {
                  if (streamingRefs.current[question.id]) {
                    streamingRefs.current[question.id].streamingContainer = el;
                  }
                }}
                className="space-y-4"
                style={{ display: 'none' }}
              >
                <Card className="border border-blue-200 bg-blue-50">
                  <CardContent className="p-4">
                    <div className="flex items-center mb-3">
                      <Brain className="w-5 h-5 text-blue-600 mr-2" />
                      <span className="font-medium text-blue-800">AI is thinking...</span>
                      <div className="ml-2">
                        <div className="flex space-x-1">
                          <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                          <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                          <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-blue-700 whitespace-pre-wrap font-mono bg-blue-100 p-3 rounded text-xs">
                      <div 
                        ref={(el) => {
                          if (streamingRefs.current[question.id]) {
                            streamingRefs.current[question.id].thinkingElement = el;
                          }
                        }}
                        className="min-h-[1em]"
                      />
                      <span className="animate-pulse text-blue-500">▋</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border border-gray-200">
                  <CardContent className="p-4">
                    <div className="flex items-center mb-3">
                      <MessageSquare className="w-5 h-5 text-gray-600 mr-2" />
                      <span className="font-medium text-gray-800">AI Response</span>
                      <div className="ml-2">
                        <div className="flex space-x-1">
                          <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                          <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                          <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                      </div>
                    </div>
                    <div className="text-gray-700 whitespace-pre-wrap">
                      <div 
                        ref={(el) => {
                          if (streamingRefs.current[question.id]) {
                            streamingRefs.current[question.id].contentElement = el;
                          }
                        }}
                        className="min-h-[1em]"
                      />
                      <span className="animate-pulse text-blue-500">▋</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Answers */}
              <div className="space-y-4">
                {getSortedAnswers(question.id).map((answer, answerIndex) => (
                  <Card key={answer.id} className={`border ${answer.isPinned ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <Avatar className="w-6 h-6">
                            {answer.isAI ? (
                              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                                <span className="text-white text-xs font-bold">AI</span>
                              </div>
                            ) : (
                              <>
                                <AvatarImage src="/img-5.svg" />
                                <AvatarFallback>U</AvatarFallback>
                              </>
                            )}
                          </Avatar>
                          <span className="text-sm font-medium text-gray-800">
                            {answer.isAI ? 'AI Assistant' : 'User'}
                          </span>
                          {answer.isPinned && (
                            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                              Pinned
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">
                          {formatDistanceToNow(answer.timestamp)} ago
                        </div>
                      </div>

                      {/* Show AI thinking process if available */}
                      {answer.isAI && answer.thinking && (
                        <Card className="mb-4 bg-gray-50 border-gray-200">
                          <CardContent className="p-3">
                            <div className="flex items-center mb-2">
                              <Brain className="w-4 h-4 text-gray-500 mr-2" />
                              <span className="text-xs font-medium text-gray-600">
                                AI Thought Process
                              </span>
                            </div>
                            <div className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-100 p-2 rounded text-xs">
                              {answer.thinking}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      <div className="text-gray-700 whitespace-pre-wrap mb-4">
                        <ReactMarkdown>{answer.content}</ReactMarkdown>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setCommentPanelOpen(commentPanelOpen === answer.id ? null : answer.id)}
                            className="flex items-center gap-2 text-gray-500 hover:text-gray-700"
                          >
                            <MessageCircle className="w-4 h-4" />
                            <span>{(comments[answer.id] || []).length} comments</span>
                          </Button>
                        </div>
                      </div>

                      {/* Comments Panel */}
                      {commentPanelOpen === answer.id && (
                        <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
                          {/* Existing Comments */}
                          {(comments[answer.id] || []).map((comment) => (
                            <div key={comment.id} className="flex items-start space-x-3">
                              <Avatar className="w-5 h-5">
                                <AvatarImage src="/img-5.svg" />
                                <AvatarFallback>U</AvatarFallback>
                              </Avatar>
                              <div className="flex-1">
                                <div className="text-sm text-gray-700">{comment.content}</div>
                                <div className="text-xs text-gray-500 mt-1">
                                  {formatDistanceToNow(comment.timestamp)} ago
                                </div>
                              </div>
                            </div>
                          ))}

                          {/* Add Comment */}
                          {!isGuest && (
                            <div className="flex items-start space-x-3">
                              <Avatar className="w-5 h-5">
                                <AvatarImage src={state.currentUser?.avatar} />
                                <AvatarFallback>{state.currentUser?.name?.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <div className="flex-1 flex space-x-2">
                                <Input
                                  placeholder="Add a comment..."
                                  value={newComment[answer.id] || ''}
                                  onChange={(e) => setNewComment(prev => ({ ...prev, [answer.id]: e.target.value }))}
                                  onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                      handleAddComment(answer.id);
                                    }
                                  }}
                                  className="text-sm"
                                />
                                <Button
                                  onClick={() => handleAddComment(answer.id)}
                                  size="sm"
                                  disabled={!newComment[answer.id]?.trim()}
                                >
                                  <Send className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Add Answer */}
              {!isGuest && (
                <Card className="border border-gray-200">
                  <CardContent className="p-4">
                    <div className="flex items-start space-x-3">
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={state.currentUser?.avatar} />
                        <AvatarFallback>{state.currentUser?.name?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-3">
                        <Textarea
                          placeholder="Share your thoughts and insights..."
                          value={newAnswer[question.id] || ''}
                          onChange={(e) => setNewAnswer(prev => ({ ...prev, [question.id]: e.target.value }))}
                          className="min-h-[80px]"
                        />
                        <div className="flex justify-end">
                          <Button
                            onClick={() => handleAddAnswer(question.id)}
                            disabled={!newAnswer[question.id]?.trim()}
                            className="flex items-center gap-2"
                          >
                            <Send className="w-4 h-4" />
                            Add Answer
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ))}

          {/* Add New Question (only for thread creator) */}
          {!isGuest && state.currentUser?.id === thread.creator.id && (
            <Card className="border border-gray-200">
              <CardContent className="p-4">
                <h4 className="font-medium text-gray-800 mb-3">Add Follow-up Question</h4>
                <div className="space-y-3">
                  <Textarea
                    placeholder="What else would you like to ask the community?"
                    value={newQuestion}
                    onChange={(e) => setNewQuestion(e.target.value)}
                    className="min-h-[80px]"
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={handleAddQuestion}
                      disabled={!newQuestion.trim()}
                      className="flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add Question
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Scroll anchor - positioned at the very bottom */}
          <div ref={messagesEndRef} style={{ height: '1px' }} />
        </div>
      </main>

      {/* New Public Thread Modal */}
      {showNewThreadModal && (
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
                    setShowNewThreadModal(false);
                    setNewThreadData({ title: '', category: 'Relationships', question: '' });
                  }}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                <div>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Start a public discussion that the community can engage with immediately.
                  </p>
                </div>

                {/* Thread Title */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Thread Title *
                  </label>
                  <Input
                    placeholder="Give your thread a descriptive title..."
                    value={newThreadData.title}
                    onChange={(e) => setNewThreadData(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full"
                  />
                </div>

                {/* Category Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Category
                  </label>
                  <select 
                    value={newThreadData.category}
                    onChange={(e) => setNewThreadData(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="Relationships">Relationships</option>
                    <option value="Psychology">Psychology</option>
                    <option value="Marriage">Marriage</option>
                    <option value="Friendship">Friendship</option>
                    <option value="Intimacy">Intimacy</option>
                    <option value="General">General</option>
                  </select>
                </div>

                {/* Question Content */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Your Question *
                  </label>
                  <Textarea
                    placeholder="What would you like to ask the community? Be specific and provide context to get better answers..."
                    value={newThreadData.question}
                    onChange={(e) => setNewThreadData(prev => ({ ...prev, question: e.target.value }))}
                    className="w-full min-h-[120px]"
                    rows={5}
                  />
                </div>

                {/* Public Notice */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <Globe className="h-5 w-5 text-blue-600 mt-0.5" />
                    </div>
                    <div className="text-sm">
                      <p className="text-blue-800 font-medium mb-1">
                        This will be public immediately
                      </p>
                      <p className="text-blue-700">
                        Your question will be visible to all community members. Others can add answers and engage in discussions right away.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end space-x-3 p-6 border-t bg-gray-50">
                <Button 
                  onClick={() => {
                    setShowNewThreadModal(false);
                    setNewThreadData({ title: '', category: 'Relationships', question: '' });
                  }}
                  variant="outline"
                  className="px-4 py-2"
                  disabled={isCreatingThread}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreatePublicThread}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={!newThreadData.title.trim() || !newThreadData.question.trim() || isCreatingThread}
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
    </div>
  );
};

export { PublicThread };