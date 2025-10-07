import React from 'react';
import { MetricButton, MetricType } from './MetricButton';

export interface MetricDisplayProps {
  // Metric counts
  views?: number;
  likes?: number;
  saves?: number;
  shares?: number;
  comments?: number;
  
  // User interaction states
  isLiked?: boolean;
  isSaved?: boolean;
  
  // Configuration
  showLabels?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'ghost' | 'outline';
  
  // Event handlers
  onLike?: () => void;
  onSave?: () => void;
  onShare?: () => void;
  
  // Disabled state
  disabled?: boolean;
  
  // Layout options
  layout?: 'horizontal' | 'vertical';
  spacing?: 'tight' | 'normal' | 'loose';
  
  // Hide zero counts
  hideZeroCounts?: boolean;
}

const spacingClasses = {
  tight: 'gap-1',
  normal: 'gap-2',
  loose: 'gap-4'
};

export const MetricDisplay: React.FC<MetricDisplayProps> = ({
  views = 0,
  likes = 0,
  saves = 0,
  shares = 0,
  comments = 0,
  isLiked = false,
  isSaved = false,
  showLabels = true,
  size = 'md',
  variant = 'ghost',
  onLike,
  onSave,
  onShare,
  disabled = false,
  layout = 'horizontal',
  spacing = 'normal',
  hideZeroCounts = false
}) => {
  const metrics = [
    { type: 'view' as MetricType, count: views, interactive: false },
    { type: 'like' as MetricType, count: likes, isActive: isLiked, onToggle: onLike, interactive: true },
    { type: 'save' as MetricType, count: saves, isActive: isSaved, onToggle: onSave, interactive: true },
    { type: 'share' as MetricType, count: shares, onToggle: onShare, interactive: true },
    { type: 'comment' as MetricType, count: comments, interactive: false }
  ].filter(metric => !hideZeroCounts || metric.count > 0);

  const containerClasses = `
    flex ${layout === 'horizontal' ? 'flex-row' : 'flex-col'} 
    ${spacingClasses[spacing]}
    items-center
  `;

  return (
    <div className={containerClasses}>
      {metrics.map((metric) => (
        <MetricButton
          key={metric.type}
          type={metric.type}
          count={metric.count}
          isActive={metric.isActive}
          onToggle={metric.interactive ? metric.onToggle : undefined}
          disabled={disabled}
          showLabel={showLabels}
          size={size}
          variant={variant}
        />
      ))}
    </div>
  );
};

// Compact version for small spaces
export const CompactMetricDisplay: React.FC<MetricDisplayProps> = (props) => (
  <MetricDisplay
    {...props}
    size="sm"
    showLabels={false}
    spacing="tight"
    hideZeroCounts={true}
  />
);

// Detailed version with labels
export const DetailedMetricDisplay: React.FC<MetricDisplayProps> = (props) => (
  <MetricDisplay
    {...props}
    size="md"
    showLabels={true}
    spacing="normal"
  />
);

// Thread-specific metric display
export const ThreadMetricDisplay: React.FC<MetricDisplayProps> = (props) => (
  <MetricDisplay
    {...props}
    size="sm"
    showLabels={true}
    spacing="normal"
    layout="horizontal"
  />
);

// Content-specific metric display (for questions, answers, comments)
export const ContentMetricDisplay: React.FC<MetricDisplayProps> = (props) => (
  <MetricDisplay
    {...props}
    size="sm"
    showLabels={false}
    spacing="tight"
    layout="horizontal"
    hideZeroCounts={true}
  />
);

// Home page metric display - only shows likes and combined answers+comments
export const HomePageMetricDisplay: React.FC<{
  likes: number;
  answers: number;
  comments: number;
  isLiked?: boolean;
  onLike?: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}> = ({ likes, answers, comments, isLiked = false, onLike, disabled = false, size = 'sm' }) => {
  const totalInteractions = answers + comments;
  
  return (
    <div className="flex gap-2 items-center">
      <MetricButton
        type="like"
        count={likes}
        isActive={isLiked}
        onToggle={onLike}
        disabled={disabled}
        showLabel={false}
        size={size}
        variant="ghost"
      />
      <MetricButton
        type="comment"
        count={totalInteractions}
        isActive={false}
        onToggle={undefined}
        disabled={true}
        showLabel={false}
        size={size}
        variant="ghost"
      />
    </div>
  );
};
