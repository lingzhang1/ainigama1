import React from 'react';
import { ArrowLeft, Clock, ArrowUpDown } from 'lucide-react';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Thread } from '../../types';
import { formatDistanceToNow } from 'date-fns';

interface PublicThreadHeaderProps {
  thread: Thread;
  sortOrder: 'newest' | 'oldest';
  isGuest: boolean;
  onBackToForum: () => void;
  onSortChange: (order: 'newest' | 'oldest') => void;
  onLogout: () => void;
  onSignIn: () => void;
}

export const PublicThreadHeader: React.FC<PublicThreadHeaderProps> = ({
  thread,
  sortOrder,
  isGuest,
  onBackToForum,
  onSortChange,
  onLogout,
  onSignIn
}) => {
  return (
    <header className="bg-white border-b p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToForum}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Forum
          </Button>
          <div>
            <h1 className="text-xl font-semibold text-gray-800">{thread.title}</h1>
            <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
              <div className="flex items-center">
                <Avatar className="w-5 h-5 mr-2">
                  <AvatarImage src={thread.creator.avatar} />
                  <AvatarFallback>{thread.creator.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <span>{thread.creator.name}</span>
              </div>
              <div className="flex items-center">
                <Clock className="w-4 h-4 mr-1" />
                <span>{formatDistanceToNow(thread.createdAt)} ago</span>
              </div>
              <Badge variant="secondary">{thread.category}</Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSortChange(sortOrder === 'newest' ? 'oldest' : 'newest')}
            className="flex items-center gap-2"
          >
            <ArrowUpDown className="w-4 h-4" />
            {sortOrder === 'newest' ? 'Newest First' : 'Oldest First'}
          </Button>
          {isGuest ? (
            <Button
              onClick={onSignIn}
              size="sm"
            >
              Sign In to Participate
            </Button>
          ) : (
            <Button onClick={onLogout} variant="ghost" size="sm">
              Sign Out
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};