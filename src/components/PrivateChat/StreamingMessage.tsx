import React from 'react';
import { Card, CardContent } from '../ui/card';
import { Avatar } from '../ui/avatar';
import { Brain, Loader2 } from 'lucide-react';

interface StreamingMessageProps {
  thinking?: string;
  content: string;
  isComplete: boolean;
  showThinking?: boolean;
}

export const StreamingMessage: React.FC<StreamingMessageProps> = ({
  thinking,
  content,
  isComplete,
  showThinking = true
}) => {
  return (
    <div className="flex justify-start">
      <div className="flex items-start space-x-3 max-w-[70%]">
        <Avatar className="w-8 h-8 flex-shrink-0">
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">AI</span>
          </div>
        </Avatar>
        
        <div className="space-y-2 flex-1">
          {/* Thinking Process - Always at the top */}
          {showThinking && thinking && thinking.trim() && (
            <Card className="bg-gray-50 border-gray-200">
              <CardContent className="p-3">
                <div className="flex items-center mb-2">
                  <Brain className="w-4 h-4 text-gray-500 mr-2" />
                  <span className="text-xs font-medium text-gray-600">
                    {isComplete ? 'Thought Process' : 'Thinking...'}
                  </span>
                  {!isComplete && (
                    <Loader2 className="w-3 h-3 text-gray-400 ml-2 animate-spin" />
                  )}
                </div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-100 p-2 rounded text-xs">
                  {thinking}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Main Response - Below thinking */}
          {content && (
            <Card className="bg-white border-gray-200">
              <CardContent className="p-3">
                <div className="text-sm whitespace-pre-wrap">
                  {content}
                  {!isComplete && <span className="animate-pulse">|</span>}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Loading indicator when no content yet */}
          {!content && !thinking && (
            <Card className="bg-white border-gray-200">
              <CardContent className="p-3">
                <div className="flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  <span className="text-sm text-gray-500">AI is thinking...</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};