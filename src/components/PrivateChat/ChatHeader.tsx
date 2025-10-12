import React from 'react';
import { Lock, Globe, Settings, Leaf } from 'lucide-react';
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
  onReturnToForum: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  conversationTitle,
  showThinking,
  canPublish,
  isGuest,
  onToggleThinking,
  onMakePublic,
  onReturnToForum
}) => {
  return (
    <header className="bg-white border-b p-3 md:p-4 flex items-center justify-between">
      <div className="flex items-center min-w-0 flex-1 gap-2">
        {/* Foliage Icon to return to forum */}
        <Button
          onClick={onReturnToForum}
          variant="ghost"
          size="sm"
          className="p-2 hover:bg-gray-100 rounded-lg flex-shrink-0"
          title="Return to forum"
        >
          <Leaf className="w-5 h-5 text-green-600" />
        </Button>
        
        <Lock className="w-4 h-4 md:w-5 md:h-5 text-gray-500 flex-shrink-0" />
        <h3 className="text-sm md:text-lg font-semibold text-green-700 truncate">
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
        
        {/* Publish Button */}
        <Button
          onClick={onMakePublic}
          size="sm"
          className="flex items-center gap-1 md:gap-2 bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
          disabled={!canPublish || isGuest}
        >
          <Globe className="w-4 h-4" />
          <span className="hidden sm:inline">
            {isGuest ? 'Sign In to Publish' : 'Publish'}
          </span>
          <span className="sm:hidden">
            {isGuest ? 'Sign In' : 'Publish'}
          </span>
        </Button>
      </div>
    </header>
  );
};