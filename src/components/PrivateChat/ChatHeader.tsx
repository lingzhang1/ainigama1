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
    <header className="bg-white border-b p-3 md:p-4 flex items-center justify-between">
      <div className="flex items-center min-w-0 flex-1">
        <Lock className="w-4 h-4 md:w-5 md:h-5 mr-2 text-gray-500 flex-shrink-0" />
        <h3 className="text-sm md:text-lg font-medium text-gray-800 truncate">
          {conversationTitle}
        </h3>
      </div>
      
      <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
        {/* Toggle AI Thinking Button - Hidden on mobile to save space */}
        <Button
          onClick={onToggleThinking}
          variant="ghost"
          size="sm"
          className="hidden md:flex items-center gap-2"
          title={showThinking ? 'Hide AI thinking' : 'Show AI thinking'}
        >
          <Settings className="w-4 h-4" />
          <span className="hidden lg:inline">{showThinking ? 'Hide Thinking' : 'Show Thinking'}</span>
        </Button>
        
        {/* Make Public Button */}
        <Button
          onClick={onMakePublic}
          variant="outline"
          size="sm"
          className="flex items-center gap-1 md:gap-2"
          disabled={!canPublish || isGuest}
        >
          <Globe className="w-4 h-4" />
          <span className="hidden sm:inline">
            {isGuest ? 'Sign In to Publish' : 'Make Public'}
          </span>
          <span className="sm:hidden">
            {isGuest ? 'Sign In' : 'Publish'}
          </span>
        </Button>
      </div>
    </header>
  );
};