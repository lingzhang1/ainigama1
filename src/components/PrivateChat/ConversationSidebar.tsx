import React from 'react';
import { Lock, Globe, MessageSquare, Trash2, X, User, Settings } from 'lucide-react';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { PrivateConversation, User as UserType } from '../../types';
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
  currentUser: UserType | null;
  isGuest: boolean;
  isOpen: boolean;
  isMobile: boolean;
  onSelectConversation: (conversation: PrivateConversation) => void;
  onNewConversation: () => void;
  onDeleteConversation: (conversationId: string, e: React.MouseEvent) => void;
  onGoToForum: () => void;
  onLogout: () => void;
  onSignIn: () => void;
  onClose: () => void;
  onGoToUserCenter: () => void;
  onGoToAccount: () => void;
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  conversations,
  currentConversationId,
  currentUser,
  isGuest,
  isOpen,
  isMobile,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onGoToForum,
  onLogout,
  onSignIn,
  onClose,
  onGoToUserCenter,
  onGoToAccount
}) => {
  return (
    <aside className={`
      w-80 h-full bg-white border-r flex flex-col
      fixed md:relative
      inset-y-0 left-0
      z-50 md:z-auto
      transform transition-transform duration-300 ease-in-out
      ${isOpen || !isMobile ? 'translate-x-0' : '-translate-x-full'}
      md:translate-x-0
    `}>
      {/* Header Section */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            {/* Mobile Close Button */}
            <button
              onClick={onClose}
              className="md:hidden mr-3 p-2 hover:bg-gray-100 rounded-lg"
              aria-label="Close menu"
            >
              <X className="w-5 h-5 text-gray-700" />
            </button>
            <h2 className="text-lg font-semibold text-green-700 flex items-center">
              <Lock className="w-5 h-5 mr-2" />
              Private Chat
              {isGuest && (
                <span className="ml-2 px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                  Guest Mode
                </span>
              )}
            </h2>
          </div>
          <Button
            onClick={() => {
              onGoToForum();
              onClose();
            }}
            variant="ghost"
            size="sm"
            title="Go to Forum"
          >
            <Globe className="w-4 h-4" />
          </Button>
        </div>
        
        {/* New Conversation Button */}
        <Button onClick={onNewConversation} className="w-full bg-green-600 hover:bg-green-700 text-white">
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
            className={`p-4 md:p-3 border-b cursor-pointer hover:bg-gray-50 active:bg-gray-100 group relative transition-colors ${
              currentConversationId === conversation.id ? 'bg-green-50 border-green-300' : ''
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
              // Close drawer on mobile after selection
              if (isMobile) {
                onClose();
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
                  className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity h-11 w-11 md:h-8 md:w-8 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50 active:bg-red-100 flex-shrink-0"
                  onClick={(e) => onDeleteConversation(conversation.id, e)}
                  title="Delete conversation"
                >
                  <Trash2 className="h-5 w-5 md:h-4 md:w-4" />
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
              <div className="flex flex-col space-y-2">
                <button 
                  onClick={onGoToUserCenter}
                  className="text-xs text-green-600 hover:text-green-700 flex items-center space-x-1"
                >
                  <User className="w-3 h-3" />
                  <span>User Center</span>
                </button>
                <button 
                  onClick={onGoToAccount}
                  className="text-xs text-teal-600 hover:text-teal-700 flex items-center space-x-1"
                >
                  <Settings className="w-3 h-3" />
                  <span>Account Management</span>
                </button>
                <button 
                  onClick={onLogout}
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center space-x-1"
                >
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};