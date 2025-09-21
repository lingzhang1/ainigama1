import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Clock, 
  Plus,
  ChevronDown,
  ChevronUp,
  X,
  Pin,
  Bot,
  ArrowLeft
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Thread, Question, Answer, Comment } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { usePublicThread } from '../../hooks/useWebSocket';
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
    },
    (updatedThread: Thread) => {
      setThread(updatedThread);
    }
  );

  const handleAddAnswer = (questionId: string) => {
    const content = newAnswerContent[questionId];
    if (!content?.trim()) return;

    addAnswer(questionId, content);
    setNewAnswerContent(prev => ({ ...prev, [questionId]: '' }));
  };

  const handleAddComment = () => {
    if (!newCommentContent.trim() || !selectedAnswer) return;

    addComment(selectedAnswer.id, newCommentContent);
    setNewCommentContent('');
  };

  const handleAddQuestion = () => {
    if (!newQuestionContent.trim()) return;

    const newQuestion: Question = {
      id: uuidv4(),
      content: newQuestionContent,
      timestamp: new Date(),
      userId: state.currentUser?.id || '',
      threadId: thread?.id || ''
    };

    setThread(prev => prev ? ({
      ...prev,
      questions: [...prev.questions, newQuestion],
      questionCount: prev.questionCount + 1
    }) : null);

    setNewQuestionContent('');
  };

  const toggleAnswersExpanded = (questionId: string) => {
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
              <h1 className="text-2xl font-semibold text-gray-800 mb-2">{thread.title}</h1>
              <div className="flex items-center space-x-4 text-sm text-gray-500">
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
        </header>

        {/* Questions and Answers */}
        <div className="p-6 space-y-8">
          {thread.questions.map((question) => {
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
                            Question
                          </Badge>
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
                          {pinnedAnswer.interactionCount}
                        </Button>
                      </div>
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
                                  {answer.interactionCount}
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

                {/* Add Answer (for public users) */}
                {!isOriginalUser && (
                  <Card className="border-dashed border-2 border-gray-300 bg-gray-50 hover:bg-gray-100 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center mb-3">
                        <Plus className="w-4 h-4 text-gray-500 mr-2" />
                        <span className="text-sm font-medium text-gray-700">Add your answer</span>
                      </div>
                      <Textarea
                        placeholder="Share your thoughts and insights on this question..."
                        value={newAnswerContent[question.id] || ''}
                        onChange={(e) => setNewAnswerContent(prev => ({
                          ...prev,
                          [question.id]: e.target.value
                        }))}
                        className="mb-3 bg-white"
                        rows={3}
                      />
                      <Button
                        onClick={() => handleAddAnswer(question.id)}
                        disabled={!newAnswerContent[question.id]?.trim()}
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Post Answer
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })}

          {/* Add Follow-up Question (for original user) */}
          {isOriginalUser && (
            <Card className="border-dashed border-2 border-indigo-300 bg-gradient-to-r from-indigo-50 to-blue-50">
              <CardContent className="p-4">
                <div className="flex items-center mb-3">
                  <Plus className="w-4 h-4 text-indigo-600 mr-2" />
                  <h4 className="font-semibold text-indigo-800">Add a follow-up question</h4>
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
              onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'forum' })}
              variant="ghost"
              size="sm"
              className="text-gray-500 hover:text-gray-700"
            >
              Back to Forum
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