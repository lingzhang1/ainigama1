import React, { useState } from 'react';
import { Plus, Brain, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Card, CardContent } from '../ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Question, Answer, User, Comment } from '../../types';
import { AnswerDisplay } from './AnswerDisplay';
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
  comments: { [answerId: string]: Comment[] };
  isGuest: boolean;
  isAIAnswering: boolean;
  streamingRefs: React.MutableRefObject<any>;
  onAddAnswer: (questionId: string, content: string) => void;
  onAskAI: (questionId: string) => void;
  onOpenComments: (answerId: string) => void;
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
  comments,
  isGuest,
  isAIAnswering,
  streamingRefs,
  onAddAnswer,
  onAskAI,
  onOpenComments
}) => {
  const [newAnswer, setNewAnswer] = useState('');
  const [expandedAnswerInput, setExpandedAnswerInput] = useState(false);

  const handleAddAnswer = () => {
    if (!newAnswer.trim()) return;
    onAddAnswer(question.id, newAnswer.trim());
    setNewAnswer('');
    setExpandedAnswerInput(false);
  };

  return (
    <Card className="border border-gray-200">
      <CardContent className="p-6">
        {/* Question */}
        <div className="mb-6">
          <div className="flex items-start space-x-3">
            <Avatar className="w-8 h-8">
              <AvatarImage src={threadCreator.avatar} />
              <AvatarFallback>{threadCreator.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-2">
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
              <div className={`text-gray-800 leading-relaxed ${question.isSummary ? 'bg-blue-50 border border-blue-200 rounded-lg p-3' : ''}`}>
                {question.isSummary ? (
                  <div>
                    <div className="flex items-center mb-2">
                      <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center mr-2">
                        <span className="text-white text-xs">∑</span>
                      </div>
                      <span className="text-sm font-medium text-blue-800">Previous Discussion Summary</span>
                    </div>
                    <p className="text-sm text-blue-700">{question.content.replace('**Thread Summary**: ', '')}</p>
                  </div>
                ) : (
                  <p>{question.content}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Answers */}
        <div className="space-y-4">
          {answers.map((answer) => (
            <AnswerDisplay
              key={answer.id}
              answer={answer}
              threadCreator={threadCreator}
              currentUser={currentUser}
              users={users}
              commentCount={(comments[answer.id] || []).length}
              onOpenComments={onOpenComments}
            />
          ))}
        </div>

        {/* AI Streaming Response - Always present, controlled via DOM */}
        <div 
          ref={(el) => { 
            if (streamingRefs.current[question.id]) {
              streamingRefs.current[question.id].streamingContainer = el;
            }
          }}
          className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg"
          style={{ display: 'none' }}
        >
          <div className="flex items-center space-x-2 mb-3">
            <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">AI</span>
            </div>
            <span className="font-medium text-blue-800">AI is responding...</span>
            <div className="flex space-x-1">
              <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
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
              <span className="animate-pulse text-blue-500">▋</span>
            </div>
          </div>

          {/* Content */}
          <div className="text-sm text-gray-800 whitespace-pre-wrap">
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
              className="min-h-[1em] text-gray-800"
            />
            <span className="animate-pulse text-blue-500">▋</span>
          </div>
        </div>

        {/* Add Answer Section */}
        {!question.isSummary && (
          <div className="mt-6 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium text-gray-700">Add Your Answer</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAskAI(question.id)}
                disabled={isAIAnswering || isGuest}
                className="flex items-center space-x-2"
              >
                {isAIAnswering ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Brain className="w-4 h-4" />
                )}
                <span>{isAIAnswering ? 'AI Thinking...' : isGuest ? 'Sign In to Ask AI' : 'Ask AI'}</span>
              </Button>
            </div>
            
            {!isGuest && (
              <div className="space-y-3">
                {!expandedAnswerInput ? (
                  <Button
                    variant="outline"
                    onClick={() => setExpandedAnswerInput(true)}
                    className="w-full justify-start text-gray-500"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Write an answer...
                  </Button>
                ) : (
                  <>
                    <Textarea
                      placeholder="Share your thoughts and insights..."
                      value={newAnswer}
                      onChange={(e) => setNewAnswer(e.target.value)}
                      className="min-h-[100px]"
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
      </CardContent>
    </Card>
  );
};