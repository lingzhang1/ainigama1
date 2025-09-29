import React from 'react';
import ReactMarkdown from 'react-markdown';
import { MessageCircle, Brain } from 'lucide-react';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Answer, User } from '../../types';
import { formatDistanceToNow } from 'date-fns';

interface AnswerDisplayProps {
  answer: Answer;
  threadCreator: User;
  currentUser: User | null;
  users: { [userId: string]: User };
  commentCount: number;
  onOpenComments: (answerId: string) => void;
}

export const AnswerDisplay: React.FC<AnswerDisplayProps> = ({
  answer,
  threadCreator,
  currentUser,
  users,
  commentCount,
  onOpenComments
}) => {
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

  return (
    <div className="border-l-2 border-gray-100 pl-4">
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
              {answer.isAI ? 'AI Assistant' : getUserDisplayName(answer.userId)}
            </span>
            {answer.isPinned && (
              <Badge variant="secondary" className="text-xs">Pinned</Badge>
            )}
            <span className="text-xs text-gray-500">
              {formatDistanceToNow(answer.timestamp)} ago
            </span>
          </div>
          
          {/* Show AI thinking process if available */}
          {answer.isAI && answer.thinking && (
            <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center mb-2">
                <Brain className="w-4 h-4 text-gray-500 mr-2" />
                <span className="text-xs font-medium text-gray-600">
                  AI Thought Process
                </span>
              </div>
              <div className="text-xs text-gray-700 whitespace-pre-wrap font-mono bg-gray-100 p-2 rounded">
                {answer.thinking}
              </div>
            </div>
          )}
          
          {/* Render AI responses with markdown formatting */}
          {answer.isAI ? (
            <div className="text-gray-700 leading-relaxed mb-3 prose prose-sm max-w-none">
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
                  a: ({node, ...props}) => <a className="text-blue-600 hover:text-blue-800 underline" {...props} />
                }}
              >
                {answer.content}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-gray-700 leading-relaxed mb-3">{answer.content}</p>
          )}
          
          {/* Comment Icon */}
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenComments(answer.id)}
              className="flex items-center space-x-1 text-gray-500 hover:text-gray-700"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="text-xs">
                {commentCount} comments
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};