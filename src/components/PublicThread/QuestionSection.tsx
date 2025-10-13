import React, { useState, useEffect, useRef } from 'react';
import { Brain, Loader2, Leaf } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Card, CardContent } from '../ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Question, Answer, User } from '../../types';
import { AnswerDisplay } from './AnswerDisplay';
import { AskAIPromptModal } from './AskAIPromptModal';
import { formatDistanceToNow } from 'date-fns';

interface QuestionSectionProps {
  question: Question;
  questionIndex: number;
  totalQuestions: number;
  sortOrder: 'newest' | 'oldest';
  answers: Answer[];
  threadCreator: User;
  currentUser: User | null;
  users: { [userId: string]: User };
  isGuest: boolean;
  isAIAnswering: boolean;
  streamingRefs: React.MutableRefObject<any>;
  showThinking: boolean;
  contentInteractions: { [key: string]: {isLiked: boolean, isSaved: boolean} };
  onAddAnswer: (questionId: string, content: string) => void;
  onAskAI: (targetId: string, targetType: 'question' | 'answer', customPrompt?: string) => void;
  onOpenComments: (answerId: string) => void;
  onLikeAnswer: (answerId: string) => void;
  onSaveAnswer: (answerId: string) => void;
  onShareAnswer: (answerId: string) => void;
}

export const QuestionSection: React.FC<QuestionSectionProps> = ({
  question,
  questionIndex,
  totalQuestions,
  sortOrder,
  answers,
  threadCreator,
  currentUser,
  users,
  isGuest,
  isAIAnswering,
  streamingRefs,
  showThinking,
  contentInteractions,
  onAddAnswer,
  onAskAI,
  onOpenComments,
  onLikeAnswer,
  onSaveAnswer,
  onShareAnswer
}) => {
  const [newAnswer, setNewAnswer] = useState('');
  const [expandedAnswerInput, setExpandedAnswerInput] = useState(false);
  const [showAskAIModal, setShowAskAIModal] = useState(false);
  const [questionSticky, setQuestionSticky] = useState(false);
  const questionRef = useRef<HTMLDivElement>(null);

  const handleAddAnswer = () => {
    if (!newAnswer.trim()) return;
    onAddAnswer(question.id, newAnswer.trim());
    setNewAnswer('');
    setExpandedAnswerInput(false);
  };

  const handleAskAIPrompt = (customPrompt: string) => {
    onAskAI(question.id, 'question', customPrompt);
  };

  // Track if question card should be sticky
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setQuestionSticky(!entry.isIntersecting && entry.boundingClientRect.top < 100);
      },
      { threshold: [0], rootMargin: '-100px 0px 0px 0px' }
    );

    if (questionRef.current) {
      observer.observe(questionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div className="space-y-4">
      {/* Question Card - Separate and Sticky */}
      <Card
        ref={questionRef}
        id={`question-${question.id}`}
        className={`border border-gray-200 deep-link-target transition-all ${
          questionSticky ? 'sticky top-[96px] z-20 shadow-lg' : ''
        }`}
      >
        <CardContent className="p-4">
          <div className="flex items-start space-x-3">
            <Avatar className="w-8 h-8">
              <AvatarImage src={threadCreator.avatar} />
              <AvatarFallback>{threadCreator.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-gray-800">
                    {question.isSummary ? 'AI System' : threadCreator.name}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {question.isSummary 
                      ? 'Summary' 
                      : `Question ${sortOrder === 'newest' ? totalQuestions - questionIndex : questionIndex + 1}`
                    }
                  </Badge>
                  <span className="text-xs text-gray-500">
                    {formatDistanceToNow(question.timestamp)} ago
                  </span>
                </div>
                {/* Ask AI Button for non-summary questions */}
                {!question.isSummary && !isGuest && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAskAIModal(true)}
                    disabled={isAIAnswering}
                    className="flex items-center space-x-1 text-xs border-green-300 text-green-600 hover:bg-green-50"
                  >
                    {isAIAnswering ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Brain className="w-3 h-3" />
                    )}
                    <span>Ask Echo</span>
                  </Button>
                )}
              </div>
              <div className={`text-gray-800 leading-relaxed ${question.isSummary ? 'bg-green-50 border border-green-200 rounded-lg p-3' : ''}`}>
                {question.isSummary ? (
                  <div>
                    <div className="flex items-center mb-2">
                      <div className="w-4 h-4 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mr-2">
                        <Leaf className="w-2.5 h-2.5 text-white" />
                      </div>
                      <span className="text-sm font-medium text-green-700">Previous Discussion Summary</span>
                    </div>
                    <p className="text-sm text-green-700">{question.content.replace('**Thread Summary**: ', '')}</p>
                  </div>
                ) : (
                  <p>{question.content}</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Answers Section */}
      <div className="space-y-4 pl-4">
        {answers.map((answer) => {
          const answerKey = `answer_${answer.id}`;
          const interaction = contentInteractions[answerKey] || { isLiked: false, isSaved: false };
          
          return (
            <AnswerDisplay
              key={answer.id}
              answer={answer}
              threadCreator={threadCreator}
              currentUser={currentUser}
              users={users}
              commentCount={answer.commentCount || 0}
              isLiked={interaction.isLiked}
              isSaved={interaction.isSaved}
              showThinking={showThinking}
              onOpenComments={onOpenComments}
              onLike={onLikeAnswer}
              onSave={onSaveAnswer}
              onShare={onShareAnswer}
              onAskAI={onAskAI}
              isGuest={isGuest}
              isAIAnswering={isAIAnswering}
              streamingRefs={streamingRefs}
            />
          );
        })}
      </div>

      {/* AI Streaming Response */}
      <div 
        ref={(el) => { 
          if (streamingRefs.current[question.id]) {
            streamingRefs.current[question.id].streamingContainer = el;
          }
        }}
        className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg ml-4"
        style={{ display: 'none' }}
      >
        <div className="flex items-center space-x-2 mb-3">
          <div className="w-6 h-6 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center">
            <Leaf className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-medium text-green-700">AI is responding...</span>
          <div className="flex space-x-1">
            <div className="w-1 h-1 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-1 h-1 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-1 h-1 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
        
        {/* Thinking Process */}
        <div className="mb-3">
          <div className="flex items-center mb-2">
            <Brain className="w-4 h-4 text-gray-500 mr-2" />
            <span className="text-xs font-medium text-gray-600">Thought Process</span>
            <div className="ml-2">
              <div className="flex space-x-1">
                <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
          <div className="text-xs text-gray-700 whitespace-pre-wrap font-mono bg-gray-100 p-2 rounded">
            <div 
              ref={(el) => { 
                if (streamingRefs.current[question.id]) {
                  streamingRefs.current[question.id].thinkingElement = el;
                }
              }}
              className="min-h-[1em]"
            />
            <span className="animate-pulse text-green-500">▋</span>
          </div>
        </div>

        {/* Content */}
        <div className="text-sm text-gray-800">
          <div className="flex items-center mb-2">
            <span className="text-xs font-medium text-gray-600">Response</span>
            <div className="ml-2">
              <div className="flex space-x-1">
                <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
          <div 
            ref={(el) => { 
              if (streamingRefs.current[question.id]) {
                streamingRefs.current[question.id].contentElement = el;
              }
            }}
            className="min-h-[1em] text-gray-800 prose prose-sm max-w-none"
          />
          <span className="animate-pulse text-green-500">▋</span>
        </div>
      </div>

      {/* Add Answer Section */}
      {!question.isSummary && (
        <div className="ml-4 pt-4 border-t border-gray-100">
          {!isGuest && (
            <div className="space-y-3">
              {!expandedAnswerInput ? (
                <button
                  data-answer-button
                  onClick={() => setExpandedAnswerInput(true)}
                  className="w-full text-left px-4 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg border border-gray-200 transition-colors"
                >
                  Write an answer...
                </button>
              ) : (
                <>
                  <Textarea
                    placeholder="Share your thoughts and insights..."
                    value={newAnswer}
                    onChange={(e) => setNewAnswer(e.target.value)}
                    className="min-h-[100px] focus:border-green-500 focus:ring-green-500"
                    autoFocus
                  />
                  <div className="flex justify-end space-x-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setExpandedAnswerInput(false);
                        setNewAnswer('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleAddAnswer}
                      disabled={!newAnswer.trim()}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      Post Answer
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Ask Echo Prompt Modal */}
      <AskAIPromptModal
        isOpen={showAskAIModal}
        onClose={() => setShowAskAIModal(false)}
        onSubmit={handleAskAIPrompt}
        targetType="question"
        targetContent={question.content}
        isLoading={isAIAnswering}
      />
    </div>
  );
};
