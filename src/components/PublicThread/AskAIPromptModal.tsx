import React, { useState } from 'react';
import { Brain, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface AskAIPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (prompt: string) => void;
  targetType: 'question' | 'answer';
  targetContent: string;
  isLoading?: boolean;
}

export const AskAIPromptModal: React.FC<AskAIPromptModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  targetType,
  targetContent,
  isLoading = false
}) => {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = () => {
    onSubmit(prompt.trim());
    setPrompt('');
    onClose();
  };

  const handleClose = () => {
    setPrompt('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md bg-white shadow-xl border-0">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold flex items-center">
              <Brain className="w-5 h-5 mr-2 text-green-600" />
              Ask Echo
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="h-8 w-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-gray-600">
            <p className="font-medium mb-2">
              You're asking AI about this {targetType}:
            </p>
            <div className="bg-gray-50 p-3 rounded-lg text-xs text-gray-700 max-h-20 overflow-y-auto">
              {targetContent.length > 150 ? `${targetContent.substring(0, 150)}...` : targetContent}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              What would you like AI to do?
            </label>
            <Textarea
              placeholder="(Optional) e.g., criticize my answer, compare with other answers, analyze the question, provide additional insights..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[80px] resize-none"
              autoFocus
            />
            <div className="text-xs text-gray-500 mt-1">
              Leave blank for a general response, or be specific about what you want AI to analyze.
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isLoading}
              className="flex items-center space-x-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Asking AI...</span>
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4" />
                  <span>Ask Echo</span>
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
