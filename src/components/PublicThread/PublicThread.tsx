import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  Clock, 
  Plus,
  ChevronDown,
  ChevronUp,
  X,
  Pin,
  Bot,
  ArrowLeft,
  SortAsc,
  SortDesc,
  Brain,
  Loader2,
  Send,
  Reply
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
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
  const [thread, setThread] = useState<Thread | null>(null);
  const [answers, setAnswers] = useState<{ [questionId: string]: Answer[] }>({});
  const [comments, setComments] = useState<{ [answerId: string]: Comment[] }>({});
  const [expandedAnswers, setExpandedAnswers] = useState<{ [questionId: string]: boolean }>({});
  const [selectedAnswer, setSelectedAnswer] = useState<Answer | null>(null);
  const [showInteractionPanel, setShowInteractionPanel] = useState(false);
  const [newAnswerContent, setNewAnswerContent] = useState<{ [questionId: string]: string }>({});
  const [newCommentContent, setNewCommentContent] = useState('');
  const [newQuestionContent, setNewQuestionContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [questionSortOrder, setQuestionSortOrder] = useState<'desc' | 'asc'>('desc'); // Latest first by default
  const [aiAnswering, setAiAnswering] = useState<{ [questionId: string]: boolean }>({});
  const [aiThinking, setAiThinking] = useState<{ [questionId: string]: string }>({});
  const [aiContent, setAiContent] = useState<{ [questionId: string]: string }>({});

  // Answer Interaction Panel state
  const [showInteractionPanel, setShowInteractionPanel] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<Answer | null>(null);
  const [newCommentContent, setNewCommentContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);

  // State for collapsed/expanded answer input sections
  const [expandedAnswerInputs, setExpandedAnswerInputs] = useState<{ [questionId: string]: boolean }>({});

  // Refs for AI streaming display
  const aiStreamingRefs = useRef<{ [questionId: string]: {
    thinkingElement: HTMLDivElement | null;
    contentElement: HTMLDivElement | null;
  } }>({});

  // Load thread data from backend
  useEffect(() => {
    const loadThread = async () => {
      if (!state.currentThreadId) return;
      
      try {
        setIsLoading(true);
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
        if (!apiUrl) {
          console.error('VITE_API_URL not configured');
          return;
        }
        
        console.log('Loading thread:', state.currentThreadId);
        const response = await fetch(`${apiUrl}/threads/${state.currentThreadId}`);
        
        if (response.ok) {
          const threadData = await response.json();
          console.log('Loaded thread data:', threadData);
          setThread(threadData);
          
          // Load answers for each question
          const answersResponse = await fetch(`${apiUrl}/threads/${state.currentThreadId}/answers`);
          if (answersResponse.ok) {
            const answersData = await answersResponse.json();
            console.log('Loaded answers data:', answersData);
            setAnswers(answersData);
          }
        } else {
          console.error('Failed to load thread:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('Failed to load thread:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadThread();
  }, [state.currentThreadId]);

  const { addAnswer, addComment } = usePublicThread(
    thread?.id || '',
    (answer: Answer) => {
      setAnswers(prev => ({
        ...prev,
        [answer.questionId]: [...(prev[answer.questionId] || []), answer]
      }));
      
      // Update thread answer count
      setThread(prev => prev ? ({
        ...prev,
        answerCount: prev.answerCount + 1,
        updatedAt: new Date()
      }) : null);
    },
    (comment: Comment) => {
      setComments(prev => ({
        ...prev,
        [comment.answerId]: [...(prev[comment.answerId] || []), comment]
      }));
      
      // Update answer interaction count
      setAnswers(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(questionId => {
          updated[questionId] = updated[questionId].map(answer => 
            answer.id === comment.answerId 
              ? { ...answer, interactionCount: answer.interactionCount + 1 }
              : answer
          );
        });
        return updated;
      });
    },
    (updatedThread: Thread) => {
      setThread(updatedThread);
    }
  );


  // Load comments for selected answer
  const loadCommentsForAnswer = async (answerId: string) => {
    try {
      setLoadingComments(true);
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
      const response = await fetch(`${apiUrl}/answers/${answerId}/comments`);
      
      if (response.ok) {
        const commentsData = await response.json();
        setComments(prev => ({
          ...prev,
          [answerId]: commentsData
        }));
      } else {
        console.error('Failed to load comments:', response.statusText);
      }
    } catch (error) {
      console.error('Error loading comments:', error);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleAddComment = async () => {
    if (!newCommentContent.trim() || !selectedAnswer) return;

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
      const response = await fetch(`${apiUrl}/answers/${selectedAnswer.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: newCommentContent.trim(),
          userId: state.currentUser?.id,
          parentId: replyingTo?.id || null
        })
      });

      if (response.ok) {
        const newComment = await response.json();
        
        // Update local comments state
        setComments(prev => ({
          ...prev,
          [selectedAnswer.id]: [...(prev[selectedAnswer.id] || []), newComment]
        }));
        
        // Update answer interaction count
        setAnswers(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(questionId => {
            updated[questionId] = updated[questionId].map(answer => 
              answer.id === selectedAnswer.id 
                ? { ...answer, interactionCount: answer.interactionCount + 1 }
                : answer
            );
          });
          return updated;
        });
        
        // Also broadcast via WebSocket for real-time updates
        addComment(selectedAnswer.id, newCommentContent.trim(), replyingTo?.id);
        
        // Clear input and reply state
        setNewCommentContent('');
        setReplyingTo(null);
        
        console.log('✅ Comment added successfully');
      } else {
        console.error('Failed to add comment:', response.statusText);
      }
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  };

  const openInteractionPanel = (answer: Answer) => {
    setSelectedAnswer(answer);
    setShowInteractionPanel(true);
    loadCommentsForAnswer(answer.id);
  };

  const closeInteractionPanel = () => {
    setShowInteractionPanel(false);
    setSelectedAnswer(null);
    setNewCommentContent('');
    setReplyingTo(null);
  };

  const handleReplyToComment = (comment: Comment) => {
    setReplyingTo(comment);
    setNewCommentContent(`@${comment.userId || 'User'} `);
  };

  const handleAddQuestion = () => {
    if (!newQuestionContent.trim()) return;

    // Send to backend via API
    const addQuestionToBackend = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
        const response = await fetch(`${apiUrl}/threads/${thread?.id}/questions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: newQuestionContent.trim(),
            userId: state.currentUser?.id
          })
        });

        if (response.ok) {
          const savedQuestion = await response.json();
          // Update local state with saved question
          setThread(prev => prev ? ({
            ...prev,
            questions: [...prev.questions, savedQuestion],
            questionCount: prev.questionCount + 1,
            updatedAt: new Date()
          }) : null);
          setNewQuestionContent('');
          
          // Trigger AI answer for the new question
          generateAIAnswer(savedQuestion);
        } else {
          console.error('Failed to add question:', response.statusText);
        }
      } catch (error) {
        console.error('Error adding question:', error);
      }
    };

    addQuestionToBackend();
  };

  const toggleAnswerInput = (questionId: string) => {
    setExpandedAnswerInputs(prev => ({
      ...prev,
      [questionId]: !prev[questionId]
    }));
  };

  const handleAddAnswer = async (questionId: string) => {
    const content = newAnswerContent[questionId];
    if (!content?.trim()) return;

    console.log('Adding answer to question:', questionId, 'Content:', content.trim());
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
      console.log('API URL:', apiUrl);
      
      const response = await fetch(`${apiUrl}/questions/${questionId}/answers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: content.trim(),
          userId: state.currentUser?.id
        })
      });

      console.log('Response status:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log('Answer creation result:', result);
        const newAnswer = result.answer;
        
        // Update local answers state
        setAnswers(prev => ({
          ...prev,
          [questionId]: [...(prev[questionId] || []), newAnswer]
        }));
        
        // Update thread answer count
        setThread(prev => prev ? ({
          ...prev,
          answerCount: prev.answerCount + 1,
          updatedAt: new Date()
        }) : null);
        
        // Clear input
        setNewAnswerContent(prev => ({ ...prev, [questionId]: '' }));
        
        // Collapse the answer input after successful submission
        setExpandedAnswerInputs(prev => ({ ...prev, [questionId]: false }));
        
        console.log('✅ Answer added successfully');
      } else {
        const errorText = await response.text();
        console.error('Failed to add answer:', response.status, response.statusText, errorText);
      }
    } catch (error) {
      console.error('Error adding answer:', error);
    }
  };

  const toggleAnswersExpanded = (questionId: string) => {
    console.log('Toggling answers for question:', questionId, 'Current state:', expandedAnswers[questionId]);
    setExpandedAnswers(prev => ({
      ...prev,
      [questionId]: !prev[questionId]
    }));
  };

  const openInteractionPanel = (answer: Answer) => {
    setSelectedAnswer(answer);
    setShowInteractionPanel(true);
  };

  const closeInteractionPanel = () => {
    setShowInteractionPanel(false);
    setSelectedAnswer(null);
    setNewCommentContent('');
  };

  const isOriginalUser = state.currentUser?.id === thread?.creator.id;

  // Sort questions based on selected order
  const sortedQuestions = thread?.questions ? [...thread.questions].sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    
    if (questionSortOrder === 'desc') {
      return timeB - timeA; // Latest first
    } else {
      return timeA - timeB; // Oldest first
    }
  }) : [];

  const toggleSortOrder = () => {
    setQuestionSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
  };

  // Generate AI answer for a question
  const generateAIAnswer = async (question: Question) => {
    if (!thread) return;
    
    console.log('🤖 Generating AI answer for question:', question.id);
    
    // Set AI answering state
    setAiAnswering(prev => ({ ...prev, [question.id]: true }));
    setAiThinking(prev => ({ ...prev, [question.id]: '' }));
    setAiContent(prev => ({ ...prev, [question.id]: '' }));
    
    try {
      // Prepare context for AI
      const contextMessages: ChatMessage[] = [
        {
          role: 'system',
          content: `You are an AI assistant helping with a discussion thread titled "${thread.title}". 
          The thread is in the ${thread.category} category. 
          Provide thoughtful, helpful answers based on the context of the conversation.`
        }
      ];
      
      // Add previous questions and answers as context
      const sortedQuestions = [...thread.questions].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      for (const q of sortedQuestions) {
        contextMessages.push({
          role: 'user',
          content: q.content
        });
        
        // Add existing answers as context
        const questionAnswers = answers[q.id] || [];
        const pinnedAnswer = questionAnswers.find(a => a.isPinned);
        if (pinnedAnswer) {
          contextMessages.push({
            role: 'assistant',
            content: pinnedAnswer.content
          });
        }
      }
      
      // Add the new question
      contextMessages.push({
        role: 'user',
        content: question.content
      });
      
      let fullThinking = '';
      let fullContent = '';
      
      // Stream AI response
      await deepSeekService.streamChat(contextMessages, {
        onThinking: (thinking) => {
          fullThinking += thinking;
          setAiThinking(prev => ({ ...prev, [question.id]: fullThinking }));
          
          // Update DOM directly for smooth streaming
          const thinkingElement = aiStreamingRefs.current[question.id]?.thinkingElement;
          if (thinkingElement) {
            thinkingElement.textContent = fullThinking;
          }
        },
        onContent: (content) => {
          fullContent += content;
          setAiContent(prev => ({ ...prev, [question.id]: fullContent }));
          
          // Update DOM directly for smooth streaming
          const contentElement = aiStreamingRefs.current[question.id]?.contentElement;
          if (contentElement) {
            contentElement.textContent = fullContent;
          }
        },
        onComplete: async (finalContent) => {
          console.log('🎉 AI answer complete for question:', question.id);
          
          // Save AI answer to backend
          try {
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
            const response = await fetch(`${apiUrl}/questions/${question.id}/answers`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                content: finalContent,
                userId: null, // AI answers don't have userId
                isAI: true,
                isPinned: true,
                thinking: fullThinking
              })
            });
            
            if (response.ok) {
              const result = await response.json();
              const aiAnswer: Answer = {
                ...result.answer,
                isAI: true,
                isPinned: true,
                thinking: fullThinking
              };
              
              // Update answers state
              setAnswers(prev => ({
                ...prev,
                [question.id]: [aiAnswer, ...(prev[question.id] || [])]
              }));
              
              // Update thread answer count
              setThread(prev => prev ? ({
                ...prev,
                answerCount: prev.answerCount + 1,
                updatedAt: new Date()
              }) : null);
              
              console.log('✅ AI answer saved to backend');
            } else {
              console.error('Failed to save AI answer:', response.statusText);
            }
          } catch (error) {
            console.error('Error saving AI answer:', error);
          }
          
          // Clear AI answering state
          setAiAnswering(prev => ({ ...prev, [question.id]: false }));
          setAiThinking(prev => ({ ...prev, [question.id]: '' }));
          setAiContent(prev => ({ ...prev, [question.id]: '' }));
        },
        onError: (error) => {
          console.error('AI answer error:', error);
          setAiAnswering(prev => ({ ...prev, [question.id]: false }));
          setAiThinking(prev => ({ ...prev, [question.id]: '' }));
          setAiContent(prev => ({ ...prev, [question.id]: '' }));
        }
      });
      
    } catch (error) {
      console.error('Error generating AI answer:', error);
      setAiAnswering(prev => ({ ...prev, [question.id]: false }));
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading thread...</p>
        </div>
      </div>
    );
  }

  // Show error state if no thread loaded
  if (!thread) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 mb-4">Thread not found</p>
          <Button onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'forum' })}>
            Back to Forum
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full h-screen bg-gray-50">
      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {/* Thread Header */}
        <header className="bg-white border-b p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center mb-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'forum' })}
                  className="mr-3 text-gray-500 hover:text-gray-700"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <h1 className="text-2xl font-semibold text-gray-800">{thread.title}</h1>
              </div>
              <div className="flex items-center space-x-4 text-sm text-gray-500 ml-11">
                <div className="flex items-center">
                  <Avatar className="w-6 h-6 mr-2">
                    <AvatarImage src={thread.creator.avatar} alt={thread.creator.name} />
                    <AvatarFallback>{thread.creator.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span>{thread.creator.name}</span>
                </div>
                <div className="flex items-center">
                  <Clock className="w-4 h-4 mr-1" />
                  <span>{formatDistanceToNow(thread.createdAt)} ago</span>
                </div>
                <span>{thread.questionCount} questions</span>
                <span>{thread.answerCount} answers</span>
              </div>
            </div>
            {thread.category && (
              <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                {thread.category}
              </Badge>
            )}
          </div>

          {/* Question Sort Controls */}
          {sortedQuestions.length > 1 && (
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Sort questions:</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleSortOrder}
                  className="flex items-center gap-2"
                >
                  {questionSortOrder === 'desc' ? (
                    <>
                      <SortDesc className="w-4 h-4" />
                      Latest First
                    </>
                  ) : (
                    <>
                      <SortAsc className="w-4 h-4" />
                      Oldest First
                    </>
                  )}
                </Button>
              </div>
              <div className="text-sm text-gray-500">
                {sortedQuestions.length} question{sortedQuestions.length !== 1 ? 's' : ''}
              </div>
            </div>
          )}
        </header>

        {/* Questions and Answers */}
        <div className="p-6 space-y-8">
          {/* Add Follow-up Question (for original user) - Show at top when latest first */}
          {isOriginalUser && questionSortOrder === 'desc' && (
            <Card className="border-dashed border-2 border-indigo-300 bg-gradient-to-r from-indigo-50 to-blue-50">
              <CardContent className="p-4">
                <div className="flex items-center mb-3">
                  <Plus className="w-4 h-4 text-indigo-600 mr-2" />
                  <h4 className="font-semibold text-indigo-800">Add a follow-up question</h4>
                  <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 text-xs ml-2">
                    Latest First
                  </Badge>
                </div>
                <p className="text-sm text-indigo-700 mb-3">
                  Continue the conversation by asking related questions
                </p>
                <Textarea
                  placeholder="What else would you like to know about this topic?"
                  value={newQuestionContent}
                  onChange={(e) => setNewQuestionContent(e.target.value)}
                  className="mb-3 bg-white"
                  rows={2}
                />
                <Button
                  onClick={handleAddQuestion}
                  disabled={!newQuestionContent.trim()}
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Question
                </Button>
              </CardContent>
            </Card>
          )}

          {sortedQuestions.map((question, questionIndex) => {
            const questionAnswers = answers[question.id] || [];
            const pinnedAnswer = questionAnswers.find(a => a.isPinned);
            const otherAnswers = questionAnswers.filter(a => !a.isPinned);
            const isExpanded = expandedAnswers[question.id];

            return (
              <div key={question.id} className="space-y-4">
                {/* Question Card - Highlighted */}
                <Card className="border-l-4 border-l-indigo-500 bg-gradient-to-r from-indigo-50 to-blue-50 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center mb-2">
                          <MessageSquare className="w-5 h-5 text-indigo-600 mr-2" />
                          <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 text-xs">
                            Question #{sortedQuestions.length - questionIndex}
                          </Badge>
                          {questionIndex === 0 && questionSortOrder === 'desc' && (
                            <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">
                              Latest
                            </Badge>
                          )}
                          {questionIndex === sortedQuestions.length - 1 && questionSortOrder === 'asc' && (
                            <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
                              Original
                            </Badge>
                          )}
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-3 leading-relaxed">
                          {question.content}
                        </h3>
                        <div className="flex items-center text-sm text-gray-500">
                          <Avatar className="w-5 h-5 mr-2">
                            <AvatarImage src={thread.creator.avatar} alt={thread.creator.name} />
                            <AvatarFallback>{thread.creator.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span>{thread.creator.name}</span>
                          <span className="mx-2">•</span>
                          <span>{formatDistanceToNow(question.timestamp)} ago</span>
                          <span className="mx-2">•</span>
                          <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                            {new Date(question.timestamp).toLocaleDateString()} {new Date(question.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Pinned Answer - Enhanced */}
                {pinnedAnswer && (
                  <Card className="border-2 border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 shadow-md">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center">
                          <Pin className="w-4 h-4 text-green-600 mr-1" />
                          <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs mr-2 font-medium">
                            Pinned
                          </Badge>
                          {pinnedAnswer.isAI && (
                            <>
                              <Bot className="w-4 h-4 text-blue-600 mr-1" />
                              <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs font-medium">
                                AI
                              </Badge>
                            </>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openInteractionPanel(pinnedAnswer)}
                          className="text-gray-600 hover:text-gray-800"
                        >
                          <MessageSquare className="w-4 h-4 mr-1" />
                          {pinnedAnswer.interactionCount || 0}
                        </Button>
                      </div>
                      
                      {/* Show AI thinking process if available */}
                      {pinnedAnswer.isAI && pinnedAnswer.thinking && (
                        <Card className="bg-gray-50 border-gray-200 mb-3">
                          <CardContent className="p-3">
                            <div className="flex items-center mb-2">
                              <Brain className="w-4 h-4 text-gray-500 mr-2" />
                              <span className="text-xs font-medium text-gray-600">
                                AI Thought Process
                              </span>
                            </div>
                            <div className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-100 p-2 rounded text-xs max-h-32 overflow-y-auto">
                              {pinnedAnswer.thinking}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                      
                      <div className="text-gray-900 whitespace-pre-wrap mb-3 leading-relaxed">
                        {pinnedAnswer.content}
                      </div>
                      <div className="flex items-center text-sm text-gray-500">
                        {!pinnedAnswer.isAI && (
                          <>
                            <Avatar className="w-5 h-5 mr-2">
                              <AvatarFallback>U</AvatarFallback>
                            </Avatar>
                            <span>User</span>
                            <span className="mx-2">•</span>
                          </>
                        )}
                        <span>{formatDistanceToNow(pinnedAnswer.timestamp)} ago</span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* AI Streaming Answer */}
                {aiAnswering[question.id] && (
                  <Card className="border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 shadow-md">
                    <CardContent className="p-4">
                      <div className="flex items-center mb-3">
                        <Bot className="w-4 h-4 text-blue-600 mr-1" />
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs mr-2 font-medium">
                          AI Answering...
                        </Badge>
                        <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                      </div>
                      
                      {/* AI Thinking Process */}
                      {aiThinking[question.id] && (
                        <Card className="bg-gray-50 border-gray-200 mb-3">
                          <CardContent className="p-3">
                            <div className="flex items-center mb-2">
                              <Brain className="w-4 h-4 text-gray-500 mr-2" />
                              <span className="text-xs font-medium text-gray-600">
                                AI Thought Process
                              </span>
                              <Loader2 className="w-3 h-3 text-gray-400 ml-2 animate-spin" />
                            </div>
                            <div className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-100 p-2 rounded text-xs max-h-32 overflow-y-auto">
                              <div 
                                ref={(el) => {
                                  if (!aiStreamingRefs.current[question.id]) {
                                    aiStreamingRefs.current[question.id] = { thinkingElement: null, contentElement: null };
                                  }
                                  aiStreamingRefs.current[question.id].thinkingElement = el;
                                }}
                              >
                                {aiThinking[question.id]}
                              </div>
                              <span className="animate-pulse">|</span>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                      
                      {/* AI Response Content */}
                      <div className="text-gray-900 whitespace-pre-wrap mb-3 leading-relaxed">
                        <div 
                          ref={(el) => {
                            if (!aiStreamingRefs.current[question.id]) {
                              aiStreamingRefs.current[question.id] = { thinkingElement: null, contentElement: null };
                            }
                            aiStreamingRefs.current[question.id].contentElement = el;
                          }}
                        >
                          {aiContent[question.id]}
                        </div>
                        {aiContent[question.id] && <span className="animate-pulse">|</span>}
                      </div>
                      
                      <div className="flex items-center text-sm text-gray-500">
                        <span>AI is generating response...</span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Other Answers - Collapsed/Expanded */}
                {otherAnswers.length > 0 && (
                  <div className="space-y-2">
                    <Button
                      variant="ghost"
                      onClick={() => toggleAnswersExpanded(question.id)}
                      className="text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="w-4 h-4 mr-1" />
                          Hide {otherAnswers.length} other answers
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4 mr-1" />
                          View {otherAnswers.length} more answers
                        </>
                      )}
                    </Button>

                    {isExpanded && (
                      <div className="space-y-3 ml-4">
                        {otherAnswers.map((answer) => (
                          <Card key={answer.id} className="border border-gray-200">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center">
                                  {answer.isAI && (
                                    <>
                                      <Bot className="w-4 h-4 text-blue-600 mr-1" />
                                      <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs font-medium">
                                        AI
                                      </Badge>
                                    </>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openInteractionPanel(answer)}
                                  className="text-gray-600 hover:text-gray-800"
                                >
                                  <MessageSquare className="w-4 h-4 mr-1" />
                                  {answer.interactionCount || 0}
                                </Button>
                              </div>
                              <div className="text-gray-800 whitespace-pre-wrap mb-3 leading-relaxed">
                                {answer.content}
                              </div>
                              <div className="flex items-center text-sm text-gray-500">
                                {!answer.isAI && (
                                  <>
                                    <Avatar className="w-5 h-5 mr-2">
                                      <AvatarFallback>U</AvatarFallback>
                                    </Avatar>
                                    <span>User</span>
                                    <span className="mx-2">•</span>
                                  </>
                                )}
                                <span>{formatDistanceToNow(answer.timestamp)} ago</span>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Add Answer (for all users) */}
                <div className="mt-4">
                  {!expandedAnswerInputs[question.id] ? (
                    // Collapsed state - just a button
                    <Button
                      variant="outline"
                      onClick={() => toggleAnswerInput(question.id)}
                      className="w-full border-dashed border-2 border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700 h-12 transition-colors"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      {isOriginalUser ? 'Add your own answer' : 'Add your answer'}
                    </Button>
                  ) : (
                    // Expanded state - full input form
                    <Card className="border-dashed border-2 border-indigo-300 bg-gradient-to-r from-indigo-50 to-blue-50 shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center">
                            <Plus className="w-4 h-4 text-indigo-600 mr-2" />
                            <span className="text-sm font-medium text-indigo-800">
                              {isOriginalUser ? 'Add your own answer' : 'Add your answer'}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleAnswerInput(question.id)}
                            className="text-gray-500 hover:text-gray-700 h-6 w-6 p-0"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                        <Textarea
                          placeholder="Share your thoughts and insights on this question..."
                          value={newAnswerContent[question.id] || ''}
                          onChange={(e) => setNewAnswerContent(prev => ({
                            ...prev,
                            [question.id]: e.target.value
                          }))}
                          className="mb-3 bg-white border-indigo-200 focus:border-indigo-400"
                          rows={3}
                        />
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleAddAnswer(question.id)}
                            disabled={!newAnswerContent[question.id]?.trim()}
                            size="sm"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            Post Answer
                          </Button>
                          <Button
                            onClick={() => toggleAnswerInput(question.id)}
                            variant="outline"
                            size="sm"
                            className="text-gray-600 hover:text-gray-800"
                          >
                            Cancel
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add Follow-up Question (for original user) - Show at bottom when oldest first */}
          {isOriginalUser && questionSortOrder === 'asc' && (
            <Card className="border-dashed border-2 border-indigo-300 bg-gradient-to-r from-indigo-50 to-blue-50">
              <CardContent className="p-4">
                <div className="flex items-center mb-3">
                  <Plus className="w-4 h-4 text-indigo-600 mr-2" />
                  <h4 className="font-semibold text-indigo-800">Add a follow-up question</h4>
                  <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs ml-2">
                    Oldest First
                  </Badge>
                </div>
                <p className="text-sm text-indigo-700 mb-3">
                  Continue the conversation by asking related questions
                </p>
                <Textarea
                  placeholder="What else would you like to know about this topic?"
                  value={newQuestionContent}
                  onChange={(e) => setNewQuestionContent(e.target.value)}
                  className="mb-3 bg-white"
                  rows={2}
                />
                <Button
                  onClick={handleAddQuestion}
                  disabled={!newQuestionContent.trim()}
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Question
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Right Sidebar */}
      <aside className="w-80 h-full bg-white border-l overflow-y-auto">
        <div className="p-4">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <Avatar className="w-8 h-8 mr-3">
                <AvatarImage src={state.currentUser?.avatar} alt={state.currentUser?.name} />
                <AvatarFallback>{state.currentUser?.name?.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <div className="text-sm font-medium text-gray-800">{state.currentUser?.name}</div>
                <div className="text-xs text-gray-500">{state.currentUser?.handle}</div>
              </div>
            </div>
            <Button
              onClick={onLogout}
              variant="ghost"
              size="sm"
              className="text-gray-500 hover:text-gray-700"
            >
              Sign Out
            </Button>
          </div>

          {/* Thread Stats */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Thread Activity</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Questions:</span>
                <span className="font-medium text-gray-800">{thread.questionCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Answers:</span>
                <span className="font-medium text-gray-800">{thread.answerCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Category:</span>
                <Badge variant="secondary" className="text-xs">{thread.category}</Badge>
              </div>
            </div>
          </div>

          {/* Related Threads */}
          <div>
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Related Threads</h2>
            <div className="space-y-3">
              {[
                { title: 'Building trust in relationships', answers: 12, time: '3 days ago' },
                { title: 'Communication in marriage', answers: 8, time: '1 week ago' },
                { title: 'Dealing with relationship conflicts', answers: 15, time: '2 weeks ago' }
              ].map((item, index) => (
                <div key={index} className="p-3 bg-gray-50 rounded-md hover:bg-gray-100 cursor-pointer transition-colors">
                  <div className="text-sm text-gray-800 font-medium mb-1">{item.title}</div>
                  <div className="text-xs text-gray-500">{item.answers} answers • {item.time}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Answer Interaction Panel */}
      {showInteractionPanel && selectedAnswer && (
        <div className="fixed inset-y-0 right-0 w-96 bg-white border-l shadow-lg z-50 flex flex-col">
          {/* Panel Header */}
          <div className="p-4 border-b bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-800">Answer Discussion</h3>
              <Button variant="ghost" size="sm" onClick={closeInteractionPanel}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center mb-2">
              {selectedAnswer.isPinned && (
                <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs mr-2">
                  <Pin className="w-3 h-3 mr-1" />
                  Pinned
                </Badge>
              )}
              {selectedAnswer.isAI && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
                  <Bot className="w-3 h-3 mr-1" />
                  AI
                </Badge>
              )}
            </div>
            <div className="text-sm text-gray-700 bg-gray-100 p-3 rounded-md">
              {selectedAnswer.content}
            </div>
          </div>

          {/* Comments List */}
          <div className="flex-1 overflow-y-auto p-4">
            {(comments[selectedAnswer.id] || []).length > 0 ? (
              <div className="space-y-4">
                {(comments[selectedAnswer.id] || []).map((comment) => (
                  <div key={comment.id} className="space-y-2">
                    <div className="flex items-start space-x-3">
                      <Avatar className="w-6 h-6">
                        <AvatarFallback>U</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="text-sm text-gray-800 leading-relaxed">{comment.content}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {formatDistanceToNow(comment.timestamp)} ago
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <MessageSquare className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No comments yet</p>
                <p className="text-xs text-gray-400">Be the first to share your thoughts</p>
              </div>
            )}
          </div>

          {/* Comment Input */}
          <div className="p-4 border-t bg-gray-50">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Add a comment</label>
              <Textarea
                placeholder="Share your thoughts on this answer..."
                value={newCommentContent}
                onChange={(e) => setNewCommentContent(e.target.value)}
                rows={3}
                className="bg-white"
              />
              <Button
                onClick={handleAddComment}
                disabled={!newCommentContent.trim()}
                size="sm"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <MessageSquare className="w-4 h-4 mr-1" />
                Post Comment
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};