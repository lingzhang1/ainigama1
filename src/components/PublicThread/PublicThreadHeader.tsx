import React from 'react';
import { ChevronLeft, ArrowUpDown, Plus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Thread } from '../../types';

interface PublicThreadHeaderProps {
  thread: Thread;
  sortOrder: 'newest' | 'oldest';
  showThinking: boolean;
  headerVisible: boolean;
  onBackToForum: () => void;
  onSortChange: (order: 'newest' | 'oldest') => void;
  onToggleThinking: () => void;
}

export const PublicThreadHeader: React.FC<PublicThreadHeaderProps> = ({
  thread,
  sortOrder,
  showThinking,
  headerVisible,
  onBackToForum,
  onSortChange,
  onToggleThinking
}) => {
  const getCategoryColor = (category: string): string => {
    const colorMap: { [key: string]: string } = {
      'General': 'bg-green-100 text-green-700',
      'Relationships': 'bg-pink-100 text-pink-700',
      'Psychology': 'bg-purple-100 text-purple-700',
      'Marriage': 'bg-rose-100 text-rose-700',
      'Friendship': 'bg-amber-100 text-amber-700',
      'Intimacy': 'bg-red-100 text-red-700'
    };
    return colorMap[category] || 'bg-gray-100 text-gray-600';
  };

  return (
    <header 
      className={`bg-white border-b px-4 py-3 fixed top-0 left-0 right-0 z-10 transition-transform duration-300 ${
        headerVisible ? 'translate-y-0' : '-translate-y-full'
      }`}
    >
      {/* Row 1: Back arrow + Title */}
      <div className="flex items-center gap-1 mb-2">
        <button
          onClick={onBackToForum}
          className="flex-shrink-0 text-gray-500 hover:text-gray-700 transition-colors"
          aria-label="Back to forum"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
            <h1 className="text-base md:text-lg font-semibold text-gray-800 truncate">
              {thread.title}
            </h1>
      </div>
      
      {/* Row 2: Left controls and Right subscribe */}
      <div className="flex items-center justify-between gap-4">
        {/* Left side: Avatar, Category, Hide Thinking, Sort */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Avatar */}
          <Avatar className="w-5 h-5">
            <AvatarImage src={thread.creator.avatar} />
            <AvatarFallback>{thread.creator.name.charAt(0)}</AvatarFallback>
          </Avatar>
          
          {/* Category */}
          <Badge variant="secondary" className={`${getCategoryColor(thread.category || '')} text-xs py-0 px-2 h-5`}>
            {thread.category}
          </Badge>
          
          {/* Hide Thinking */}
          <button
            onClick={onToggleThinking}
            className="text-xs text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap"
            title={showThinking ? 'Hide AI thinking' : 'Show AI thinking'}
          >
            {showThinking ? 'Hide Thinking' : 'Show Thinking'}
          </button>
          
          {/* Sort with icon and dropdown text */}
          <button
            onClick={() => onSortChange(sortOrder === 'newest' ? 'oldest' : 'newest')}
            className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>{sortOrder === 'newest' ? 'Newest' : 'Oldest'}</span>
          </button>
        </div>

        {/* Right side: Subscribe button */}
        <button
          className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap"
          onClick={() => {
            // TODO: Implement subscribe functionality
            console.log('Subscribe clicked');
          }}
        >
          <Plus className="w-4 h-4" />
          <span>Subscribe</span>
        </button>
      </div>
    </header>
  );
};