import React from 'react';
import { Card, CardContent } from '../ui/card';
import { Avatar } from '../ui/avatar';
import { Brain, Loader2, Leaf } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

/**
 * StreamingMessage Component
 * 
 * Purpose: Displays a streaming AI response in real-time with:
 * - AI thinking process (if enabled and available)
 * - Streaming content with typing indicators
 * - Loading states and animations
 * - Proper styling to distinguish from regular messages
 * 
 * This component is used during active AI response generation
 * to provide real-time feedback to the user about the AI's
 * thinking and response process.
 */

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
          <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center">
            <Leaf className="w-4 h-4 text-white" />
          </div>
        </Avatar>
        
        <div className="space-y-2 flex-1">
          {/* Thinking Process - Always show if we have thinking content */}
          {showThinking && thinking && (
            <Card className="bg-gray-50 border-gray-200">
              <CardContent className="p-3">
                <div className="flex items-center mb-2">
                  <Brain className="w-4 h-4 text-gray-500 mr-2" />
                  <span className="text-xs font-medium text-gray-600">
                    Thought Process
                  </span>
                  {!isComplete && !content && (
                    <Loader2 className="w-3 h-3 text-gray-400 ml-2 animate-spin" />
                  )}
                </div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-100 p-2 rounded text-xs">
                  {thinking}
                  {!isComplete && !content && <span className="animate-pulse">|</span>}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Main Response - Always below thinking */}
          {content && (
            <Card className="bg-white border-gray-200">
              <CardContent className="p-3">
                <div className="text-sm leading-relaxed break-words overflow-wrap-anywhere prose prose-sm max-w-none">
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
                    {content}
                  </ReactMarkdown>
                  {!isComplete && content && <span className="animate-pulse">|</span>}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Loading indicator when no content and no thinking yet */}
          {!content && !thinking && !isComplete && (
            <Card className="bg-white border-gray-200">
              <CardContent className="p-3">
                <div className="flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin text-green-500" />
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