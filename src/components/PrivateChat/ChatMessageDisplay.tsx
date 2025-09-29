import React from 'react';
import { Brain } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Message, User } from '../../types';
import { formatDistanceToNow } from 'date-fns';

/**
 * ChatMessageDisplay Component
 * 
 * Purpose: Renders a single chat message with:
 * - User or AI avatar
 * - Message content with proper styling
 * - AI thinking process (if applicable and enabled)
 * - Timestamp
 * 
 * This component handles the display logic for both user and AI messages,
 * including the special formatting for AI thinking processes.
 */

interface ChatMessageDisplayProps {
  message: Message;
  currentUser: User | null;
  showThinking: boolean;
}

export const ChatMessageDisplay: React.FC<ChatMessageDisplayProps> = ({
  message,
  currentUser,
  showThinking
}) => {
  return (
    <div
      className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`flex items-start space-x-3 max-w-[70%] ${
        message.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''
      }`}>
        {/* Avatar */}
        <Avatar className="w-8 h-8">
          {message.sender === 'ai' ? (
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">AI</span>
            </div>
          ) : (
            <>
              <AvatarImage src={currentUser?.avatar} />
              <AvatarFallback>{currentUser?.name?.charAt(0)}</AvatarFallback>
            </>
          )}
        </Avatar>
        
        <div className="space-y-2 flex-1">
          {/* AI Thinking Process - Show if it's an AI message, thinking is enabled, and thinking exists */}
          {message.sender === 'ai' && showThinking && message.thinking && (
            <Card className="bg-gray-50 border-gray-200">
              <CardContent className="p-3">
                <div className="flex items-center mb-2">
                  <Brain className="w-4 h-4 text-gray-500 mr-2" />
                  <span className="text-xs font-medium text-gray-600">
                    Thought Process
                  </span>
                </div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-100 p-2 rounded text-xs">
                  {message.thinking}
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Main Message Content */}
          <Card className={`${
            message.sender === 'user' 
              ? 'bg-blue-500 text-white' 
              : 'bg-white border-gray-200'
          }`}>
            <CardContent className="p-3">
              <div className="text-sm whitespace-pre-wrap">{message.content}</div>
              <div className={`text-xs mt-2 ${
                message.sender === 'user' ? 'text-blue-100' : 'text-gray-500'
              }`}>
                {formatDistanceToNow(message.timestamp)} ago
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};