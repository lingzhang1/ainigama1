import React from 'react';
import { AlertTriangle, MessageSquarePlus, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

/**
 * ConversationContextWarning Component
 * 
 * Purpose: Displays a warning banner when a private conversation's context
 * has exceeded the DeepSeek context window threshold. Provides options to:
 * - Start a new conversation with a summary of the current one
 * - Dismiss the warning (though context issues will persist)
 * 
 * This component helps users manage long conversations by offering a
 * seamless way to continue their discussion with summarized context.
 */

interface ConversationContextWarningProps {
  summary: string | null;
  onStartNewConversationWithSummary: (summary: string) => void;
  onDismiss: () => void;
  isGeneratingSummary?: boolean;
}

export const ConversationContextWarning: React.FC<ConversationContextWarningProps> = ({
  summary,
  onStartNewConversationWithSummary,
  onDismiss,
  isGeneratingSummary = false
}) => {
  return (
    <Card className="mx-4 mt-4 border-yellow-200 bg-yellow-50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-semibold text-yellow-800 mb-1">
                Conversation Context Limit Reached
              </h4>
              <p className="text-sm text-yellow-700 mb-3">
                Your conversation history is very long and may cause issues with AI responses. 
                {isGeneratingSummary 
                  ? ' A summary is being generated...' 
                  : summary 
                    ? ' A summary has been prepared to help you continue the discussion.'
                    : ' Click below to generate a summary and start fresh.'
                }
              </p>
              
              {summary && (
                <div className="bg-yellow-100 border border-yellow-200 rounded-lg p-3 mb-3">
                  <p className="text-xs font-medium text-yellow-800 mb-2">Summary Preview:</p>
                  <p className="text-sm text-yellow-700 line-clamp-3">
                    {summary.substring(0, 200)}
                    {summary.length > 200 && '...'}
                  </p>
                </div>
              )}
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="text-yellow-600 hover:text-yellow-800 hover:bg-yellow-100 h-8 w-8 p-0 flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="flex items-center space-x-2 ml-8">
          {summary && (
            <Button
              onClick={() => onStartNewConversationWithSummary(summary)}
              className="bg-yellow-600 hover:bg-yellow-700 text-white flex items-center"
              size="sm"
            >
              <MessageSquarePlus className="h-4 w-4 mr-2" />
              Start New Chat with Summary
            </Button>
          )}
          
          {isGeneratingSummary && (
            <div className="flex items-center space-x-2 text-yellow-700">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600"></div>
              <span className="text-sm">Generating summary...</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};