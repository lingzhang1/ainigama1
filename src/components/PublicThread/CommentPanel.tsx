import React, { useState } from 'react';
import { X, Send, MessageCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Comment, User } from '../../types';
import { formatDistanceToNow } from 'date-fns';

interface CommentPanelProps {
  commentPanelOpen: string | null;
  comments: { [answerId: string]: Comment[] };
  users: { [userId: string]: User };
  currentUser: User | null;
  threadCreator: User;
  isGuest: boolean;
  onClose: () => void;
  onAddComment: (answerId: string, content: string) => void;
  onSignIn: () => void;
}

export const CommentPanel: React.FC<CommentPanelProps> = ({
  commentPanelOpen,
  comments,
  users,
  currentUser,
  threadCreator,
  isGuest,
  onClose,
  onAddComment,
  onSignIn
}) => {
  const [newComment, setNewComment] = useState<{ [answerId: string]: string }>({});

  const getUserDisplayName = (userId: string | null): string => {
    if (!userId) return 'Unknown User';
    
    if (currentUser && userId === currentUser.id) {
      return currentUser.name;
    }
    
    if (userId === threadCreator.id) {
      return threadCreator.name;
    }
    
    if (users[userId]) {
      return users[userId].name;
    }
    
    return `User${userId.slice(-4)}`;
  };

  const handleAddComment = (answerId: string) => {
    const content = newComment[answerId]?.trim();
    if (!content) return;
    
    onAddComment(answerId, content);
    setNewComment(prev => ({ ...prev, [answerId]: '' }));
  };

  if (!commentPanelOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white border-l shadow-lg z-50 flex flex-col">
      {/* Panel Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-medium text-gray-800">Comments</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 w-8 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {(comments[commentPanelOpen] || []).map((comment) => (
          <div key={comment.id} className="bg-gray-50 p-3 rounded-lg">
            <div className="flex items-center space-x-2 mb-2">
              <Avatar className="w-5 h-5">
                <AvatarImage src="/img-5.svg" />
                <AvatarFallback>U</AvatarFallback>
              </Avatar>
              <span className="font-medium text-gray-700 text-sm">
                {getUserDisplayName(comment.userId)}
              </span>
              <span className="text-xs text-gray-500">
                {formatDistanceToNow(comment.timestamp)} ago
              </span>
            </div>
            <p className="text-gray-700 text-sm leading-relaxed">{comment.content}</p>
          </div>
        ))}
        
        {(comments[commentPanelOpen] || []).length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No comments yet</p>
            <p className="text-xs">Be the first to comment!</p>
          </div>
        )}
      </div>

      {/* Add Comment Input */}
      {!isGuest && commentPanelOpen && (
        <div className="border-t p-4">
          <div className="flex space-x-2">
            <Input
              placeholder="Add a comment..."
              value={newComment[commentPanelOpen] || ''}
              onChange={(e) => setNewComment(prev => ({
                ...prev,
                [commentPanelOpen]: e.target.value
              }))}
              className="flex-1"
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAddComment(commentPanelOpen);
                }
              }}
            />
            <Button
              size="sm"
              onClick={() => handleAddComment(commentPanelOpen)}
              disabled={!newComment[commentPanelOpen]?.trim()}
              className="px-3"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {isGuest && (
        <div className="border-t p-4 text-center">
          <p className="text-sm text-gray-500 mb-2">Sign in to add comments</p>
          <Button
            size="sm"
            onClick={onSignIn}
          >
            Sign In
          </Button>
        </div>
      )}
    </div>
  );
};