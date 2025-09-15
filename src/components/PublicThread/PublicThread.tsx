import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Clock, 
  ThumbsUp, 
  MoreHorizontal, 
  Plus,
  ChevronDown,
  ChevronUp,
  X
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Thread, Question, Answer, Comment } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { usePublicThread } from '../../hooks/useWebSocket';
import { formatDistanceToNow } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

interface PublicThreadProps {
  onLogout: () => void;
}

const mockThread: Thread = {
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
  questionCount: 3,
  answerCount: 8,
  interactionCount: 23,
  category: 'Relationships',
  questions: [
    {
      id: 'q1',
      content: 'How to maintain healthy long-term relationships?',
      timestamp: new Date('2025-02-15T10:00:00'),
      userId: '1',
      threadId: '1'
    },
    {
      id: 'q2',
      content: 'What are the most common relationship challenges couples face after 5+ years together?',
      timestamp: new Date('2025-02-15T11:30:00'),
      userId: '1',
      threadId: '1'
    },
    {
      id: 'q3',
      content: 'How do you keep the romance alive in a long-term relationship?',
      timestamp: new Date('2025-02-15T14:20:00'),
      userId: '1',
      threadId: '1'
    }
  ]
};

const mockAnswers: { [questionId: string]: Answer[] } = {
  'q1': [
    {
      id: 'a1',
      content: 'Maintaining healthy long-term relationships requires consistent effort, open communication, and mutual respect. Here are some key strategies:\n\n1. **Communication**: Practice active listening and express your feelings honestly\n2. **Quality time**: Regularly spend meaningful time together\n3. **Trust**: Build and maintain trust through transparency\n4. **Individual growth**: Support each other\'s personal development\n5. **Conflict resolution**: Learn to disagree constructively',
      timestamp: new Date('2025-02-15T10:01:00'),
      userId: 'ai',
      questionId: 'q1',
      isPinned: true,
      isAI: true,
      interactionCount: 12
    },
    {
      id: 'a2',
      content: 'From my 15 years of marriage, I\'d add that it\'s crucial to maintain your individual identities while growing together. Don\'t lose yourself in the relationship.',
      timestamp: new Date('2025-02-15T10:15:00'),
      userId: '2',
      questionId: 'q1',
      isPinned: false,
      isAI: false,
      interactionCount: 8
    },
    {
      id: 'a3',
      content: 'Regular date nights and small gestures of appreciation go a long way. It\'s the little things that matter most.',
      timestamp: new Date('2025-02-15T10:45:00'),
      userId: '3',
      questionId: 'q1',
      isPinned: false,
      isAI: false,
      interactionCount: 5
    }
  ],
  'q2': [
    {
      id: 'a4',
      content: 'Common challenges in long-term relationships include:\n\n1. **Routine and complacency**: Taking each other for granted\n2. **Communication breakdown**: Assuming you know what your partner thinks\n3. **Different life goals**: Growing in different directions\n4. **Intimacy issues**: Physical and emotional distance\n5. **External stressors**: Work, family, financial pressures\n\nThe key is recognizing these patterns early and addressing them together.',
      timestamp: new Date('2025-02-15T11:31:00'),
      userId: 'ai',
      questionId: 'q2',
      isPinned: true,
      isAI: true,
      interactionCount: 6
    }
  ],
  'q3': [
    {
      id: 'a5',
      content: 'Keeping romance alive requires intentional effort:\n\n1. **Surprise each other**: Small unexpected gestures\n2. **Physical affection**: Regular hugs, kisses, and touch\n3. **Shared experiences**: Try new activities together\n4. **Express gratitude**: Regularly acknowledge what you appreciate\n5. **Maintain mystery**: Continue growing as individuals\n\nRemember, romance isn\'t just grand gestures—it\'s in the daily choices to prioritize your partner.',
      timestamp: new Date('2025-02-15T14:21:00'),
      userId: 'ai',
      questionId: 'q3',
      isPinned: true,
      isAI: true,
      interactionCount: 4
    }
  ]
};

const mockComments: { [answerId: string]: Comment[] } = {
  'a1': [
    {
      id: 'c1',
      content: 'This is excellent advice! The communication point especially resonates with me.',
      timestamp: new Date('2025-02-15T10:30:00'),
      userId: '4',
      answerId: 'a1'
    },
    {
      id: 'c2',
      content: 'How do you handle it when your partner isn\'t good at expressing their feelings?',
      timestamp: new Date('2025-02-15T11:00:00'),
      userId: '5',
      answerId: 'a1'
    }
  ]
};

export const PublicThread: React.FC<PublicThreadProps> = ({ onLogout }) => {
  const { state, dispatch } = useAppContext();
  const [thread, setThread] = useState<Thread>(mockThread);
  const [answers, setAnswers] = useState<{ [questionId: string]: Answer[] }>(mockAnswers);
  const [comments, setComments] = useState<{ [answerId: string]: Comment[] }>(mockComments);
  const [expandedAnswers, setExpandedAnswers] = useState<{ [questionId: string]: boolean }>({});
  const [selectedAnswer, setSelectedAnswer] = useState<Answer | null>(null);
  const [showInteractionPanel, setShowInteractionPanel] = useState(false);
  const [newAnswerContent, setNewAnswerContent] = useState<{ [questionId: string]: string }>({});
  const [newCommentContent, setNewCommentContent] = useState('');
  const [newQuestionContent, setNewQuestionContent] = useState('');
  const [typingUsers, setTypingUsers] = useState<{ [key: string]: string[] }>({});
  const [isLoading, setIsLoading] = useState(true);

  // Load thread data from backend
  useEffect(() => {
    const loadThread = async () => {
      if (!state.currentThreadId) return;
      
      try {
        setIsLoading(true);
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
        const response = await fetch(`${apiUrl}/threads/${state.currentThreadId}`);
        
        if (response.ok) {
          const threadData = await response.json();
          setThread(threadData);
        }
      } catch (error) {
        console.error('Failed to load thread:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadThread();
  }, [state.currentThreadId]);

  const { addAnswer, addComment, startTyping, stopTyping } = usePublicThread(
    thread.id,
    (answer: Answer) => {
      setAnswers(prev => ({
        ...prev,
        [answer.questionId]: [...(prev[answer.questionId] || []), answer]
      }));
      
      // Update thread answer count
      setThread(prev => ({
        ...prev,
        answerCount: prev.answerCount + 1,
        updatedAt: new Date()
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
    },
    (data: { userId: string; type: 'answer' | 'comment'; targetId: string }) => {
      // Handle typing indicators
      const key = `${data.type}-${data.targetId}`;
      setTypingUsers(prev => ({
        ...prev,
        [key]: [...(prev[key] || []), data.userId]
      }));
    },
    (data: { userId: string; type: 'answer' | 'comment'; targetId: string }) => {
      // Handle stop typing
      const key = `${data.type}-${data.targetId}`;
      setTypingUsers(prev => ({
        ...prev,
        [key]: (prev[key] || []).filter(id => id !== data.userId)
      }));
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
      threadId: thread.id
    };

    setThread(prev => ({
      ...prev,
      questions: [...prev.questions, newQuestion],
      questionCount: prev.questionCount + 1
    }));

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

  const isOriginalUser = state.currentUser?.id === thread.creator.id;

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
                {/* Question Card */}
                <Card className="border-l-4 border-l-blue-500 bg-blue-50">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-medium text-gray-800 mb-2">
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

                {/* Pinned Answer */}
                {pinnedAnswer && (
                  <Card className="border border-green-200 bg-green-50">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center">
                          <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs mr-2">
                            Pinned Answer
                          </Badge>
                          {pinnedAnswer.isAI && (
                            <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
                              AI
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openInteractionPanel(pinnedAnswer)}
                        >
                          <MessageSquare className="w-4 h-4 mr-1" />
                          {pinnedAnswer.interactionCount}
                        </Button>
                      </div>
                      <div className="text-gray-800 whitespace-pre-wrap mb-3">
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
                      className="text-blue-600 hover:text-blue-700"
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
                                    <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
                                      AI
                                    </Badge>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openInteractionPanel(answer)}
                                >
                                  <MessageSquare className="w-4 h-4 mr-1" />
                                  {answer.interactionCount}
                                </Button>
                              </div>
                              <div className="text-gray-800 whitespace-pre-wrap mb-3">
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
                  <Card className="border-dashed border-2 border-gray-300">
                    <CardContent className="p-4">
                      <Textarea
                        placeholder="Add your answer to this question..."
                        value={newAnswerContent[question.id] || ''}
                        onChange={(e) => setNewAnswerContent(prev => ({
                          ...prev,
                          [question.id]: e.target.value
                        }))}
                        className="mb-3"
                        rows={3}
                      />
                      <Button
                        onClick={() => handleAddAnswer(question.id)}
                        disabled={!newAnswerContent[question.id]?.trim()}
                        size="sm"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Answer
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })}

          {/* Add Follow-up Question (for original user) */}
          {isOriginalUser && (
            <Card className="border-dashed border-2 border-blue-300 bg-blue-50">
              <CardContent className="p-4">
                <h4 className="font-medium text-gray-800 mb-3">Add a follow-up question</h4>
                <Textarea
                  placeholder="What else would you like to know about this topic?"
                  value={newQuestionContent}
                  onChange={(e) => setNewQuestionContent(e.target.value)}
                  className="mb-3"
                  rows={2}
                />
                <Button
                  onClick={handleAddQuestion}
                  disabled={!newQuestionContent.trim()}
                  size="sm"
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
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <Avatar className="w-6 h-6 mr-2">
                <AvatarImage src={state.currentUser?.avatar} alt={state.currentUser?.name} />
                <AvatarFallback>{state.currentUser?.name?.charAt(0)}</AvatarFallback>
              </Avatar>
              <span className="text-sm text-gray-700">{state.currentUser?.name}</span>
            </div>
            <Button
              onClick={onLogout}
              variant="ghost"
              size="sm"
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Sign Out
            </Button>
          </div>
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Related Threads</h2>
          <div className="space-y-3">
            {[
              'Building trust in relationships',
              'Communication in marriage',
              'Dealing with relationship conflicts'
            ].map((title, index) => (
              <div key={index} className="p-3 bg-gray-50 rounded-md hover:bg-gray-100 cursor-pointer">
                <div className="text-sm text-gray-800 font-medium">{title}</div>
                <div className="text-xs text-gray-500 mt-1">12 answers • 3 days ago</div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Answer Interaction Panel */}
      {showInteractionPanel && selectedAnswer && (
        <div className="fixed inset-y-0 right-0 w-96 bg-white border-l shadow-lg z-50 flex flex-col">
          {/* Panel Header */}
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Answer Interactions</h3>
              <Button variant="ghost" size="sm" onClick={closeInteractionPanel}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="mt-2 text-sm text-gray-600 line-clamp-2">
              {selectedAnswer.content.substring(0, 100)}...
            </div>
          </div>

          {/* Comments */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              {(comments[selectedAnswer.id] || []).map((comment) => (
                <div key={comment.id} className="space-y-2">
                  <div className="flex items-start space-x-3">
                    <Avatar className="w-6 h-6">
                      <AvatarFallback>U</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="text-sm text-gray-800">{comment.content}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {formatDistanceToNow(comment.timestamp)} ago
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Comment Input */}
          <div className="p-4 border-t">
            <div className="space-y-2">
              <Textarea
                placeholder="Add a comment..."
                value={newCommentContent}
                onChange={(e) => setNewCommentContent(e.target.value)}
                rows={3}
              />
              <Button
                onClick={handleAddComment}
                disabled={!newCommentContent.trim()}
                size="sm"
                className="w-full"
              >
                Add Comment
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};