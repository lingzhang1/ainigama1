import React from 'react';
import { Lock, Globe, MessageSquare, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { PrivateConversation, User } from '../../types';
import { formatDistanceToNow } from 'date-fns';

/**
 * ConversationSidebar Component
 * 
 * Purpose: Displays the left sidebar containing:
 * - Header with Private Chat title and navigation buttons
 * - New Conversation button
 * - List of existing conversations with delete functionality
 * - User profile section with sign in/out options
 * - Guest mode notifications
 * 
 * This component handles the conversation list UI and user authentication actions
 * but delegates the actual conversation management to the parent component.
 */

interface ConversationSidebarProps {
  conversations: PrivateConversation[];
  currentConversationId: string | null;
  currentUser: User | null;
  isGuest: boolean;
  onSelectConversation: (conversation: PrivateConversation) => void;
  onNewConversation: () => void;
  onDeleteConversation: (conversationId: string, e: React.MouseEvent) => void;
  onGoToForum: () => void;
  onLogout: () => void;
  onSignIn: () => void;
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  conversations,
  currentConversationId,
  currentUser,
  isGuest,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onGoToForum,
  onLogout,
  onSignIn
}) => {
  return (
    <aside className="w-80 h-full bg-white border-r flex flex-col">
      {/* Header Section */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center">
            <Lock className="w-5 h-5 mr-2" />
            Private Chat
            {isGuest && (
              <span className="ml-2 px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                Guest Mode
              </span>
            )}
          </h2>
          <Button
            onClick={onGoToForum}
            variant="ghost"
            size="sm"
            title="Go to Forum"
          >
            <Globe className="w-4 h-4" />
          </Button>
        </div>
        
        {/* New Conversation Button */}
        <Button onClick={onNewConversation} className="w-full">
          <MessageSquare className="w-4 h-4 mr-2" />
          New Conversation
        </Button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {/* Guest Mode Warning */}
        {isGuest && (
          <div className="p-4 bg-yellow-50 border-b border-yellow-200">
            <p className="text-sm text-yellow-800">
              <strong>Guest Mode:</strong> Your conversations won't be saved. Sign in to keep your chat history.
            </p>
          </div>
        )}
        
        {/* Conversation Items */}
        {conversations.map((conversation) => (
          <div
            key={conversation.id}
            className={`p-4 border-b cursor-pointer hover:bg-gray-50 group relative ${
              currentConversationId === conversation.id ? 'bg-blue-50 border-blue-200' : ''
            }`}
            onClick={() => {
              // Always set the conversation, even if it's the same one
              // This ensures the UI refreshes properly
              if (currentConversationId !== conversation.id) {
                onSelectConversation(conversation);
              } else {
                // If clicking the same conversation, force a refresh
                onSelectConversation({ ...conversation });
              }
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-800 mb-1 truncate">
                  {conversation.title || 'New Conversation'}
                </div>
                <div className="text-xs text-gray-400">
                  {formatDistanceToNow(conversation.updatedAt)} ago
                </div>
              </div>
              
              {/* Delete Button - Only show for authenticated users */}
              {!isGuest && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50"
                  onClick={(e) => onDeleteConversation(conversation.id, e)}
                  title="Delete conversation"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* User Profile Section */}
      <div className="border-t p-4">
        {isGuest ? (
          <div className="text-center">
            <div className="text-sm text-gray-600 mb-2">Guest Mode</div>
            <Button
              onClick={onSignIn}
              size="sm"
              className="w-full"
            >
              Sign In
            </Button>
          </div>
        ) : (
          <div className="flex items-center">
            <Avatar className="w-8 h-8">
              <AvatarImage src={currentUser?.avatar} alt={currentUser?.name} />
              <AvatarFallback>{currentUser?.name?.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="ml-3 flex-1">
              <div className="text-sm font-normal text-gray-800">
                {currentUser?.name}
              </div>
              <button 
                onClick={onLogout}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};