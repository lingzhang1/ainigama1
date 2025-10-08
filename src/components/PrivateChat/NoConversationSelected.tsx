import React from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '../ui/button';

/**
 * NoConversationSelected Component
 * 
 * Purpose: Displays a placeholder screen when no conversation is selected, showing:
 * - Empty state icon and messaging
 * - Different messaging for guest vs authenticated users
 * - Call-to-action button to start a new conversation
 * 
 * This component provides a clean empty state that guides users
 * toward taking action to start chatting.
 */

interface NoConversationSelectedProps {
  isGuest: boolean;
  onStartChat: () => void;
}

export const NoConversationSelected: React.FC<NoConversationSelectedProps> = ({
  isGuest,
  onStartChat
}) => {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-800 mb-2">No conversation selected</h3>
        <p className="text-gray-500 mb-4">
          {isGuest 
            ? 'Start chatting with DeepSeek AI (conversations won\'t be saved in guest mode)'
            : 'Start a new conversation to begin chatting with AI'
          }
        </p>
        <Button onClick={onStartChat} className="bg-green-600 hover:bg-green-700 text-white">
          {isGuest ? 'Start Guest Chat' : 'Start Chatting with DeepSeek'}
        </Button>
      </div>
    </div>
  );
};