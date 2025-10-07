import React, { useState } from 'react';
import { Heart, Bookmark, Share2, Eye, MessageSquare } from 'lucide-react';
import { Button } from './button';

export type MetricType = 'like' | 'save' | 'share' | 'view' | 'comment';

export interface MetricButtonProps {
  type: MetricType;
  count: number;
  isActive?: boolean;
  onToggle?: () => void;
  disabled?: boolean;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'ghost' | 'outline';
}

const metricConfig = {
  like: {
    icon: Heart,
    activeColor: 'text-red-500',
    inactiveColor: 'text-gray-500',
    label: 'Like',
    activeLabel: 'Liked'
  },
  save: {
    icon: Bookmark,
    activeColor: 'text-blue-500',
    inactiveColor: 'text-gray-500',
    label: 'Save',
    activeLabel: 'Saved'
  },
  share: {
    icon: Share2,
    activeColor: 'text-green-500',
    inactiveColor: 'text-gray-500',
    label: 'Share',
    activeLabel: 'Shared'
  },
  view: {
    icon: Eye,
    activeColor: 'text-gray-500',
    inactiveColor: 'text-gray-500',
    label: 'Views',
    activeLabel: 'Views'
  },
  comment: {
    icon: MessageSquare,
    activeColor: 'text-gray-500',
    inactiveColor: 'text-gray-500',
    label: 'Comments',
    activeLabel: 'Comments'
  }
};

export const MetricButton: React.FC<MetricButtonProps> = ({
  type,
  count,
  isActive = false,
  onToggle,
  disabled = false,
  showLabel = true,
  size = 'md',
  variant = 'ghost'
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const config = metricConfig[type];
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'h-8 px-2 text-xs',
    md: 'h-9 px-3 text-sm',
    lg: 'h-10 px-4 text-base'
  };

  const iconSizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  const handleClick = async () => {
    if (disabled || !onToggle || isLoading) return;
    
    setIsLoading(true);
    try {
      await onToggle();
    } catch (error) {
      console.error('Error toggling metric:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const isInteractive = type !== 'view' && type !== 'comment';
  const displayCount = count.toLocaleString();
  const label = showLabel ? (isActive ? config.activeLabel : config.label) : '';

  return (
    <Button
      variant={variant}
      size="sm"
      onClick={isInteractive ? handleClick : undefined}
      disabled={disabled || isLoading}
      className={`${sizeClasses[size]} ${
        isInteractive ? 'hover:bg-gray-100' : 'cursor-default'
      } ${isActive ? config.activeColor : config.inactiveColor} ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      <Icon 
        className={`${iconSizeClasses[size]} ${
          isActive ? 'fill-current' : ''
        } ${isLoading ? 'animate-pulse' : ''}`} 
      />
      {showLabel && (
        <span className="ml-1">
          {displayCount} {label}
        </span>
      )}
      {!showLabel && count > 0 && (
        <span className="ml-1">{displayCount}</span>
      )}
    </Button>
  );
};

// Convenience components for specific metrics
export const LikeButton: React.FC<Omit<MetricButtonProps, 'type'>> = (props) => (
  <MetricButton {...props} type="like" />
);

export const SaveButton: React.FC<Omit<MetricButtonProps, 'type'>> = (props) => (
  <MetricButton {...props} type="save" />
);

export const ShareButton: React.FC<Omit<MetricButtonProps, 'type'>> = (props) => (
  <MetricButton {...props} type="share" />
);

export const ViewButton: React.FC<Omit<MetricButtonProps, 'type'>> = (props) => (
  <MetricButton {...props} type="view" />
);

export const CommentButton: React.FC<Omit<MetricButtonProps, 'type'>> = (props) => (
  <MetricButton {...props} type="comment" />
);
