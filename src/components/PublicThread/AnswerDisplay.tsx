import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { MessageCircle, Brain, Loader2, Heart, Bookmark, Share2, Leaf } from 'lucide-react';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Answer, User } from '../../types';
import { AskAIPromptModal } from './AskAIPromptModal';
import { formatDistanceToNow } from 'date-fns';

interface AnswerDisplayProps {
  answer: Answer;
  threadCreator: User;
  currentUser: User | null;
  users: { [userId: string]: User };
  commentCount: number;
  isLiked?: boolean;
  isSaved?: boolean;
  showThinking: boolean;
  onOpenComments: (answerId: string) => void;
  onLike?: (answerId: string) => void;
  onSave?: (answerId: string) => void;
  onShare?: (answerId: string) => void;
  onAskAI: (targetId: string, targetType: 'question' | 'answer', customPrompt?: string) => void;
  isGuest: boolean;
  isAIAnswering: boolean;
  streamingRefs?: React.MutableRefObject<any>;
}

export const AnswerDisplay: React.FC<AnswerDisplayProps> = ({
  answer,
  threadCreator,
  currentUser,
  users,
  commentCount,
  isLiked = false,
  isSaved = false,
  showThinking,
  onOpenComments,
  onLike,
  onSave,
  onShare,
  onAskAI,
  isGuest,
  isAIAnswering,
  streamingRefs
}) => {
  const [showAskAIModal, setShowAskAIModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Determine if content is long (more than 500 characters or 5 lines)
  const PREVIEW_LENGTH = 500;
  const isLongContent = answer.content.length > PREVIEW_LENGTH;
  const previewContent = isLongContent ? answer.content.substring(0, PREVIEW_LENGTH) + '...' : answer.content;
  const contentToShow = isExpanded || !isLongContent ? answer.content : previewContent;

  const handleAskAIPrompt = (customPrompt: string) => {
    onAskAI(answer.id, 'answer', customPrompt);
  };

  const getUserDisplayName = (userId: string | null): string => {
    if (!userId) return 'Unknown User';
    
    // Check if it's the current user
    if (currentUser && userId === currentUser.id) {
      return currentUser.name;
    }
    
    // Check if it's the thread creator
    if (userId === threadCreator.id) {
      return threadCreator.name;
    }
    
    // Check cached users
    if (users[userId]) {
      return users[userId].name;
    }
    
    // Fallback to generic name
    return `User${userId.slice(-4)}`;
  };

  // Metrics component
  const MetricsBar = () => (
    <div className="flex items-center space-x-4">
      {/* Like Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onLike && onLike(answer.id)}
        disabled={!currentUser || isGuest}
        className={`flex items-center space-x-1 p-1 h-auto ${
          isLiked ? 'text-red-500 hover:text-red-600' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
        <span className="text-xs">{answer.likeCount || 0}</span>
      </Button>

      {/* Save Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onSave && onSave(answer.id)}
        disabled={!currentUser || isGuest}
        className={`flex items-center space-x-1 p-1 h-auto ${
          isSaved ? 'text-blue-500 hover:text-blue-600' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
        <span className="text-xs">{answer.saveCount || 0}</span>
      </Button>

      {/* Share Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onShare && onShare(answer.id)}
        className="flex items-center space-x-1 text-gray-500 hover:text-gray-700 p-1 h-auto"
      >
        <Share2 className="w-4 h-4" />
        <span className="text-xs">{answer.shareCount || 0}</span>
      </Button>

      {/* Comment Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onOpenComments(answer.id)}
        className="flex items-center space-x-1 text-gray-500 hover:text-gray-700 p-1 h-auto"
      >
        <MessageCircle className="w-4 h-4" />
        <span className="text-xs">{commentCount}</span>
      </Button>
    </div>
  );

  return (
    <div id={`answer-${answer.id}`} className="bg-white rounded-lg border border-gray-200 shadow-sm deep-link-target relative">
      <div className="p-4">
        <div className="flex items-start gap-2 md:gap-3">
          <Avatar className="w-6 h-6 flex-shrink-0">
            {answer.isAI ? (
              <div className="w-6 h-6 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center">
                <Leaf className="w-3.5 h-3.5 text-white" />
              </div>
            ) : (
              <>
                <AvatarImage src="/img-5.svg" />
                <AvatarFallback>U</AvatarFallback>
              </>
            )}
          </Avatar>
          <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-1.5 md:gap-2 mb-2">
            <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
              <span className="font-medium text-gray-700 text-sm md:text-base">
                {answer.isAI ? 'Echo' : getUserDisplayName(answer.userId)}
              </span>
              {answer.isPinned && (
                <Badge variant="secondary" className="text-xs">Pinned</Badge>
              )}
              <span className="text-xs text-gray-500">
                {formatDistanceToNow(answer.timestamp)} ago
              </span>
            </div>
            {/* Ask AI Button for non-AI answers */}
            {!answer.isAI && !isGuest && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAskAIModal(true)}
                disabled={isAIAnswering}
                className="flex items-center space-x-1 text-xs"
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

          {/* Show AI thinking process if available and showThinking is true */}
          {answer.isAI && answer.thinking && showThinking && (
            <div className="mb-2 md:mb-3 p-2 md:p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center mb-1.5 md:mb-2">
                <Brain className="w-3.5 h-3.5 md:w-4 md:h-4 text-gray-500 mr-1.5 md:mr-2 flex-shrink-0" />
                <span className="text-xs font-medium text-gray-600">
                  AI Thought Process
                </span>
              </div>
              <div className="text-xs text-gray-700 whitespace-pre-wrap font-mono bg-gray-100 p-2 rounded leading-relaxed break-words overflow-wrap-anywhere">
                {answer.thinking}
              </div>
            </div>
          )}
          
          {/* Render content with markdown formatting */}
          <div className={`text-gray-700 leading-relaxed prose prose-sm max-w-none ${isLongContent && !isExpanded ? 'mb-0' : 'mb-3'}`}>
            <ReactMarkdown
              components={{
                h1: ({node, ...props}) => <h1 className="text-lg font-bold mb-3 mt-4 first:mt-0" {...props} />,
                h2: ({node, ...props}) => <h2 className="text-base font-semibold mb-2 mt-3 first:mt-0" {...props} />,
                h3: ({node, ...props}) => <h3 className="text-sm font-medium mb-2 mt-3 first:mt-0" {...props} />,
                p: ({node, ...props}) => <p className="mb-3 last:mb-0" {...props} />,
                ul: ({node, ...props}) => <ul className="list-disc list-inside mb-3 space-y-1" {...props} />,
                ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-3 space-y-1" {...props} />,
                li: ({node, ...props}) => <li className="ml-2" {...props} />,
                code: ({node, inline, ...props}) => 
                  inline ? (
                    <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono text-gray-800" {...props} />
                  ) : (
                    <code className="block bg-gray-100 p-3 rounded text-sm font-mono text-gray-800 mb-3 overflow-x-auto" {...props} />
                  ),
                pre: ({node, ...props}) => <pre className="bg-gray-100 p-3 rounded text-sm font-mono text-gray-800 mb-3 overflow-x-auto" {...props} />,
                blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-gray-300 pl-4 italic text-gray-600 mb-3" {...props} />,
                strong: ({node, ...props}) => <strong className="font-semibold" {...props} />,
                em: ({node, ...props}) => <em className="italic" {...props} />,
                a: ({node, ...props}) => <a className="text-green-600 hover:text-green-800 underline" {...props} />
              }}
            >
              {contentToShow}
            </ReactMarkdown>
          </div>

          {/* Show More/Less Button */}
          {isLongContent && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-green-600 hover:text-green-700 text-sm font-medium mb-3 inline-block"
            >
              {isExpanded ? '▲ Show less' : '▼ Show more...'}
            </button>
          )}
          
          {/* Metrics - inline for short content */}
          {!isLongContent && <MetricsBar />}
        </div>
      </div>
    </div>

      {/* Metrics - sticky footer for long content */}
      {isLongContent && (
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-2 rounded-b-lg">
          <MetricsBar />
        </div>
      )}

      {/* AI Streaming Response for Comments - Only for non-AI answers */}
      {!answer.isAI && streamingRefs && (
        <div 
          ref={(el) => { 
            if (streamingRefs.current[answer.id]) {
              streamingRefs.current[answer.id].streamingContainer = el;
            }
          }}
          className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg"
          style={{ display: 'none' }}
        >
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-5 h-5 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center">
                  <Leaf className="w-3 h-3 text-white" />
                </div>
                <span className="font-medium text-green-700 text-sm">AI is commenting...</span>
                <div className="flex space-x-1">
                  <div className="w-1 h-1 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-1 h-1 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-1 h-1 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
              
              {/* Thinking Process */}
              <div className="mb-2">
                <div className="flex items-center mb-1">
                  <Brain className="w-3 h-3 text-gray-500 mr-1" />
                  <span className="text-xs font-medium text-gray-600">Thinking</span>
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
                      if (streamingRefs.current[answer.id]) {
                        streamingRefs.current[answer.id].thinkingElement = el;
                      }
                    }}
                    className="min-h-[1em]"
                  />
                  <span className="animate-pulse text-green-500">▋</span>
                </div>
              </div>

              {/* Content */}
              <div className="text-xs text-gray-800">
                <div className="flex items-center mb-1">
                  <span className="text-xs font-medium text-gray-600">Comment</span>
                  <div className="ml-2">
                    <div className="flex space-x-1">
                      <div className="w-1 h-1 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-1 h-1 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-1 h-1 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
                <div 
                  ref={(el) => { 
                    if (streamingRefs.current[answer.id]) {
                      streamingRefs.current[answer.id].contentElement = el;
                    }
                  }}
                  className="min-h-[1em] text-gray-800 prose prose-xs max-w-none"
                />
                <span className="animate-pulse text-green-500">▋</span>
              </div>
        </div>
      )}
      
      {/* Ask AI Prompt Modal */}
      <AskAIPromptModal
        isOpen={showAskAIModal}
        onClose={() => setShowAskAIModal(false)}
        onSubmit={handleAskAIPrompt}
        targetType="answer"
        targetContent={answer.content}
        isLoading={isAIAnswering}
      />
    </div>
  );
};