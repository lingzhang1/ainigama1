import React, { useState, useEffect } from 'react';
import { ArrowLeft, MessageSquare, Users, Clock, Brain, Loader2, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Card, CardContent } from '../ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Thread, Question, Answer, Comment, User } from '../../types';
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
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);
  const [isAIAnswering, setIsAIAnswering] = useState<{ [questionId: string]: boolean }>({});
  const [aiStreamingContent, setAIStreamingContent] = useState<{ [questionId: string]: { thinking: string; content: string } }>({});

  // Get current thread ID from state
  const currentThreadId = state.currentThreadId;

  // WebSocket hooks for real-time updates
  const { addAnswer, addComment } = usePublicThread(
    currentThreadId || '',
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
      if (!currentThreadId) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
        
        // Load thread details
        const threadResponse = await fetch(`${apiUrl}/threads/${currentThreadId}`);
        if (threadResponse.ok) {
          const threadData = await threadResponse.json();
          setThread(threadData);
        }

        // Load answers for the thread
        const answersResponse = await fetch(`${apiUrl}/threads/${currentThreadId}/answers`);
        let answersData = {};
        if (answersResponse.ok) {
          answersData = await answersResponse.json();
          setAnswers(answersData);
        }

        // Load comments for each answer
        const allAnswers = Object.values(answersData).flat();
        for (const answer of allAnswers) {
          try {
            const commentsResponse = await fetch(`${apiUrl}/answers/${answer.id}/comments`);
            if (commentsResponse.ok) {
              const commentsData = await commentsResponse.json();
              setComments(prev => ({
                ...prev,
                [answer.id]: commentsData
              }));
            }
          } catch (error) {
            console.error('Failed to load comments for answer:', answer.id, error);
          }
        }

      } catch (error) {
        console.error('Failed to load thread:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadThread();
  }, [currentThreadId]);

  // Build context for AI with proper multi-user structure
  const buildThreadContextForAI = (targetQuestionId: string): ChatMessage[] => {
    if (!thread) return [];

    const messages: ChatMessage[] = [];

    // System message explaining the multi-user thread structure
    messages.push({
      role: 'system',
      content: `You are participating in a public discussion thread where multiple users can ask questions and provide answers. The thread creator can ask multiple questions, and each question can have multiple answers from different users and AI.

Structure:
- Original User asks questions (Question 1, Question 2, etc.)
- Multiple users and AI can provide answers to each question
- You should acknowledge the community context and build upon previous answers when relevant
- Address your response to the community, not just the original questioner`
    });

    // Add all questions and their answers in chronological order
    const sortedQuestions = [...thread.questions].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    let questionNumber = 1;
    let targetQuestionNumber = 1;

    for (const question of sortedQuestions) {
      // Add the question
      messages.push({
        role: 'user',
        content: `[Question ${questionNumber} from ${thread.creator.name}]: ${question.content}`
      });

      if (question.id === targetQuestionId) {
        targetQuestionNumber = questionNumber;
      }

      // Add all answers for this question
      const questionAnswers = answers[question.id] || [];
      const sortedAnswers = [...questionAnswers].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      for (const answer of sortedAnswers) {
        if (answer.isAI) {
          messages.push({
            role: 'assistant',
            content: answer.content
          });
        } else {
          // For user answers, we need to get user info
          messages.push({
            role: 'user',
            content: `[Answer from User${answer.userId?.slice(-4) || 'Unknown'}]: ${answer.content}`
          });
        }
      }

      questionNumber++;
    }

    // Find the target question content
    const targetQuestion = sortedQuestions.find(q => q.id === targetQuestionId);
    if (targetQuestion) {
      messages.push({
        role: 'user',
        content: `Now please provide your answer to Question ${targetQuestionNumber}: "${targetQuestion.content}"`
      });
    }

    return messages;
  };

  // Handle AI answer generation
  const handleAskAI = async (questionId: string) => {
    if (!state.currentUser && !isGuest) return;
    
    try {
      setIsAIAnswering(prev => ({ ...prev, [questionId]: true }));
      setAIStreamingContent(prev => ({ ...prev, [questionId]: { thinking: '', content: '' } }));

      // Build context for this specific question
      const contextMessages = buildThreadContextForAI(questionId);

      let fullThinking = '';
      let fullContent = '';

      // Stream AI response
      await deepSeekService.streamChat(contextMessages, {
        onThinking: (thinking) => {
          fullThinking += thinking;
          setAIStreamingContent(prev => ({
            ...prev,
            [questionId]: { ...prev[questionId], thinking: fullThinking }
          }));
        },
        onContent: (content) => {
          fullContent += content;
          setAIStreamingContent(prev => ({
            ...prev,
            [questionId]: { ...prev[questionId], content: fullContent }
          }));
        },
        onComplete: async (finalContent) => {
          // Create AI answer
          const aiAnswer: Answer = {
            id: uuidv4(),
            content: finalContent,
            timestamp: new Date(),
            userId: null,
            questionId: questionId,
            isPinned: true,
            isAI: true,
            interactionCount: 0
          };

          // Add to local state immediately
          setAnswers(prev => ({
            ...prev,
            [questionId]: [...(prev[questionId] || []), aiAnswer]
          }));

          // Save to backend
          try {
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
            await fetch(`${apiUrl}/questions/${questionId}/answers`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: finalContent,
                userId: null,
                isAI: true,
                isPinned: true,
                thinking: fullThinking
              })
            });
          } catch (error) {
            console.error('Failed to save AI answer:', error);
          }

          // Clear streaming state
          setIsAIAnswering(prev => ({ ...prev, [questionId]: false }));
          setAIStreamingContent(prev => {
            const newState = { ...prev };
            delete newState[questionId];
            return newState;
          });
        },
        onError: (error) => {
          console.error('AI streaming error:', error);
          setIsAIAnswering(prev => ({ ...prev, [questionId]: false }));
          setAIStreamingContent(prev => {
            const newState = { ...prev };
            delete newState[questionId];
            return newState;
          });
        }
      });

    } catch (error) {
      console.error('Failed to get AI answer:', error);
      setIsAIAnswering(prev => ({ ...prev, [questionId]: false }));
      setAIStreamingContent(prev => {
        const newState = { ...prev };
        delete newState[questionId];
        return newState;
      });
    }
  };

  // Handle adding user answer
  const handleAddAnswer = async (questionId: string) => {
    const content = newAnswer[questionId]?.trim();
    if (!content || (!state.currentUser && !isGuest)) return;

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
      const response = await fetch(`${apiUrl}/questions/${questionId}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          userId: state.currentUser?.id || 'guest',
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
      }
    } catch (error) {
      console.error('Failed to add answer:', error);
    }
  };

  // Handle adding comment
  const handleAddComment = async (answerId: string) => {
    const content = newComment[answerId]?.trim();
    if (!content || (!state.currentUser && !isGuest)) return;

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
      const response = await fetch(`${apiUrl}/answers/${answerId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          userId: state.currentUser?.id || 'guest'
        })
      });

      if (response.ok) {
        const newCommentData = await response.json();
        setComments(prev => ({
          ...prev,
          [answerId]: [...(prev[answerId] || []), newCommentData]
        }));
        setNewComment(prev => ({ ...prev, [answerId]: '' }));
      }
    } catch (error) {
      console.error('Failed to add comment:', error);
    }
  };

  // Handle adding new question (only thread creator can do this)
  const handleAddQuestion = async () => {
    if (!newQuestion.trim() || !state.currentUser || !thread) return;
    if (state.currentUser.id !== thread.creator.id) return;

    try {
      setIsAddingQuestion(true);
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
    } finally {
      setIsAddingQuestion(false);
    }
  };

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

  if (!thread) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-800 mb-2">Thread not found</h3>
          <p className="text-gray-500 mb-4">The thread you're looking for doesn't exist or has been removed.</p>
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
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'forum' })}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Forum
              </Button>
              <div>
                <h1 className="text-xl font-semibold text-gray-800">{thread.title}</h1>
                <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
                  <div className="flex items-center">
                    <Avatar className="w-5 h-5 mr-2">
                      <AvatarImage src={thread.creator.avatar} />
                      <AvatarFallback>{thread.creator.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span>{thread.creator.name}</span>
                  </div>
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 mr-1" />
                    <span>{formatDistanceToNow(thread.createdAt)} ago</span>
                  </div>
                  <Badge variant="secondary">{thread.category}</Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {isGuest ? (
                <Button
                  onClick={() => dispatch({ type: 'SET_GUEST_MODE', payload: false })}
                  size="sm"
                >
                  Sign In to Participate
                </Button>
              ) : (
                <Button onClick={onLogout} variant="ghost" size="sm">
                  Sign Out
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* Thread Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-8">
            {/* Questions and Answers */}
            {thread.questions.map((question, questionIndex) => (
              <Card key={question.id} className="border border-gray-200">
                <CardContent className="p-6">
                  {/* Question */}
                  <div className="mb-6">
                    <div className="flex items-start space-x-3">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={thread.creator.avatar} />
                        <AvatarFallback>{thread.creator.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="font-medium text-gray-800">{thread.creator.name}</span>
                          <Badge variant="outline" className="text-xs">Question {questionIndex + 1}</Badge>
                          <span className="text-xs text-gray-500">
                            {formatDistanceToNow(question.timestamp)} ago
                          </span>
                        </div>
                        <p className="text-gray-800 leading-relaxed">{question.content}</p>
                      </div>
                    </div>
                  </div>

                  {/* AI Streaming Response */}
                  {isAIAnswering[question.id] && (
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center space-x-2 mb-3">
                        <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs font-bold">AI</span>
                        </div>
                        <span className="font-medium text-blue-800">AI is responding...</span>
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      </div>
                      
                      {/* Thinking Process */}
                      {aiStreamingContent[question.id]?.thinking && (
                        <div className="mb-3">
                          <div className="flex items-center mb-2">
                            <Brain className="w-4 h-4 text-gray-500 mr-2" />
                            <span className="text-xs font-medium text-gray-600">Thought Process</span>
                          </div>
                          <div className="text-xs text-gray-700 whitespace-pre-wrap font-mono bg-gray-100 p-2 rounded">
                            {aiStreamingContent[question.id].thinking}
                            <span className="animate-pulse">|</span>
                          </div>
                        </div>
                      )}

                      {/* Content */}
                      {aiStreamingContent[question.id]?.content && (
                        <div className="text-sm text-gray-800 whitespace-pre-wrap">
                          {aiStreamingContent[question.id].content}
                          <span className="animate-pulse">|</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Answers */}
                  <div className="space-y-4">
                    {(answers[question.id] || []).map((answer) => (
                      <div key={answer.id} className="border-l-2 border-gray-100 pl-4">
                        <div className="flex items-start space-x-3">
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
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <span className="font-medium text-gray-700">
                                {answer.isAI ? 'AI Assistant' : `User${answer.userId?.slice(-4) || 'Unknown'}`}
                              </span>
                              {answer.isPinned && (
                                <Badge variant="secondary" className="text-xs">Pinned</Badge>
                              )}
                              <span className="text-xs text-gray-500">
                                {formatDistanceToNow(answer.timestamp)} ago
                              </span>
                            </div>
                            <p className="text-gray-700 leading-relaxed mb-3">{answer.content}</p>
                            
                            {/* Comments */}
                            <div className="space-y-2">
                              {(comments[answer.id] || []).map((comment) => (
                                <div key={comment.id} className="bg-gray-50 p-3 rounded-lg">
                                  <div className="flex items-center space-x-2 mb-1">
                                    <span className="font-medium text-gray-600 text-sm">
                                      User{comment.userId?.slice(-4) || 'Unknown'}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      {formatDistanceToNow(comment.timestamp)} ago
                                    </span>
                                  </div>
                                  <p className="text-gray-700 text-sm">{comment.content}</p>
                                </div>
                              ))}
                              
                              {/* Add Comment */}
                              {!isGuest && (
                                <div className="flex space-x-2">
                                  <Input
                                    placeholder="Add a comment..."
                                    value={newComment[answer.id] || ''}
                                    onChange={(e) => setNewComment(prev => ({
                                      ...prev,
                                      [answer.id]: e.target.value
                                    }))}
                                    className="text-sm"
                                    onKeyPress={(e) => e.key === 'Enter' && handleAddComment(answer.id)}
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() => handleAddComment(answer.id)}
                                    disabled={!newComment[answer.id]?.trim()}
                                  >
                                    Comment
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add Answer Section */}
                  <div className="mt-6 pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-medium text-gray-700">Add Your Answer</h4>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAskAI(question.id)}
                        disabled={isAIAnswering[question.id]}
                        className="flex items-center space-x-2"
                      >
                        {isAIAnswering[question.id] ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Brain className="w-4 h-4" />
                        )}
                        <span>{isAIAnswering[question.id] ? 'AI Thinking...' : 'Ask AI'}</span>
                      </Button>
                    </div>
                    
                    {!isGuest && (
                      <div className="space-y-3">
                        <Textarea
                          placeholder="Share your thoughts and insights..."
                          value={newAnswer[question.id] || ''}
                          onChange={(e) => setNewAnswer(prev => ({
                            ...prev,
                            [question.id]: e.target.value
                          }))}
                          className="min-h-[100px]"
                        />
                        <div className="flex justify-end">
                          <Button
                            onClick={() => handleAddAnswer(question.id)}
                            disabled={!newAnswer[question.id]?.trim()}
                          >
                            Post Answer
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Add New Question (Only for thread creator) */}
            {state.currentUser && state.currentUser.id === thread.creator.id && (
              <Card className="border border-gray-200">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-2 mb-4">
                    <Plus className="w-5 h-5 text-gray-500" />
                    <h4 className="font-medium text-gray-700">Add Another Question</h4>
                  </div>
                  <div className="space-y-3">
                    <Textarea
                      placeholder="What else would you like to ask the community?"
                      value={newQuestion}
                      onChange={(e) => setNewQuestion(e.target.value)}
                      className="min-h-[100px]"
                    />
                    <div className="flex justify-end">
                      <Button
                        onClick={handleAddQuestion}
                        disabled={!newQuestion.trim() || isAddingQuestion}
                      >
                        {isAddingQuestion ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            Adding...
                          </>
                        ) : (
                          'Add Question'
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};