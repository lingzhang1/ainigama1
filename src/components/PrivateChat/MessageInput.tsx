import React from 'react';
import { Send } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';

/**
 * MessageInput Component
 * 
 * Purpose: Provides the message input interface with:
 * - Auto-resizing textarea for message composition
 * - Send button with proper disabled states
 * - Enter key handling for message submission
 * - Proper styling and accessibility
 * 
 * This component is controlled by the parent and handles only the UI
 * aspects of message input, delegating the actual sending logic upward.
 */

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isDisabled: boolean;
  placeholder?: string;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  value,
  onChange,
  onSend,
  isDisabled,
  placeholder = "Ask DeepSeek anything..."
}) => {
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    target.style.height = 'auto';
    target.style.height = Math.min(target.scrollHeight, 120) + 'px';
  };

  return (
    <div className="bg-white border-t p-4">
      <div className="flex space-x-2">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          onKeyPress={handleKeyPress}
          onInput={handleInput}
          className="flex-1 min-h-[40px] max-h-[120px] resize-none"
          rows={1}
          style={{
            height: 'auto',
            minHeight: '40px',
            maxHeight: '120px'
          }}
          disabled={isDisabled}
        />
        <Button 
          onClick={onSend} 
          disabled={!value.trim() || isDisabled}
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};