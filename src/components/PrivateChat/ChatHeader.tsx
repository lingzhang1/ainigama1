import React from 'react';
import { Lock, Globe, Settings } from 'lucide-react';
import { Button } from '../ui/button';

/**
 * ChatHeader Component
 * 
 * Purpose: Displays the header section of the chat area containing:
 * - Lock icon and conversation title
 * - Settings button to toggle AI thinking display
 * - Make Public button to publish conversation to community
 * 
 * This component is purely presentational and delegates all actions
 * to the parent component through callback props.
 */

interface ChatHeaderProps {
  conversationTitle: string;
  showThinking: boolean;
  canPublish: boolean;
  isGuest: boolean;
  onToggleThinking: () => void;
  onMakePublic: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  conversationTitle,
  showThinking,
  canPublish,
  isGuest,
  onToggleThinking,
  onMakePublic
}) => {
  return (
    <header className="bg-white border-b p-4 flex items-center justify-between hidden md:flex">
      <div className="flex items-center">
        <Lock className="w-5 h-5 mr-2 text-gray-500" />
        <h3 className="text-lg font-medium text-gray-800">
          {conversationTitle}
        </h3>
      </div>
      
      <div className="flex items-center gap-2">
        {/* Toggle AI Thinking Button */}
        <Button
          onClick={onToggleThinking}
          variant="ghost"
          size="sm"
          className="flex items-center gap-2"
          title={showThinking ? 'Hide AI thinking' : 'Show AI thinking'}
        >
          <Settings className="w-4 h-4" />
          {showThinking ? 'Hide Thinking' : 'Show Thinking'}
        </Button>
        
        {/* Make Public Button */}
        <Button
          onClick={onMakePublic}
          variant="outline"
          className="flex items-center gap-2"
          disabled={!canPublish || isGuest}
        >
          <Globe className="w-4 h-4" />
          {isGuest ? 'Sign In to Publish' : 'Make Public'}
        </Button>
      </div>
    </header>
  );
};