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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex flex-col md:flex-row md:items-center md:space-x-4 gap-3 md:gap-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToForum}
            className="self-start"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Forum
          </Button>
          <div>
            <h1 className="text-lg md:text-xl font-semibold text-gray-800">{thread.title}</h1>
            <div className="flex flex-wrap items-center gap-2 md:gap-4 text-xs md:text-sm text-gray-500 mt-1">
              <div className="flex items-center">
                <Avatar className="w-4 h-4 md:w-5 md:h-5 mr-1 md:mr-2">
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
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSortChange(sortOrder === 'newest' ? 'oldest' : 'newest')}
            className="flex items-center justify-center gap-1.5 w-full sm:w-auto h-8 text-xs px-3"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{sortOrder === 'newest' ? 'Newest First' : 'Oldest First'}</span>
            <span className="sm:hidden">{sortOrder === 'newest' ? 'Newest' : 'Oldest'}</span>
          </Button>
          {isGuest && (
            <Button
              onClick={onSignIn}
              size="sm"
              className="w-full sm:w-auto"
            >
              <span className="hidden sm:inline">Sign In to Participate</span>
              <span className="sm:hidden">Sign In</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};