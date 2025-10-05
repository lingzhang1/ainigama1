import React, { useState } from 'react';
import { Plus, Loader as Loader2, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Card, CardContent } from '../ui/card';

interface NewQuestionInputProps {
  newQuestion: string;
  isAddingQuestion: boolean;
  onQuestionChange: (value: string) => void;
  onAddQuestion: () => void;
}

export const NewQuestionInput: React.FC<NewQuestionInputProps> = ({
  newQuestion,
  isAddingQuestion,
  onQuestionChange,
  onAddQuestion
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleAddQuestion = () => {
    onAddQuestion();
    setIsExpanded(false);
  };

  const handleCancel = () => {
    setIsExpanded(false);
    onQuestionChange('');
  };

  if (!isExpanded) {
    return (
      <Button
        variant="outline"
        onClick={() => setIsExpanded(true)}
        className="w-full md:w-auto flex items-center gap-2 h-10 px-4 border-dashed hover:border-solid hover:bg-gray-50"
      >
        <Plus className="w-4 h-4" />
        Add Another Question
      </Button>
    );
  }

  return (
    <Card className="border border-gray-200">
      <CardContent className="p-4 md:p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Plus className="w-4 h-4 text-gray-500" />
            <h4 className="font-medium text-gray-700 text-sm md:text-base">Add Another Question</h4>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-3">
          <Textarea
            placeholder="What else would you like to ask the community?"
            value={newQuestion}
            onChange={(e) => onQuestionChange(e.target.value)}
            className="min-h-[100px]"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              size="sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddQuestion}
              disabled={!newQuestion.trim() || isAddingQuestion}
              size="sm"
            >
              {isAddingQuestion ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Adding...
                </>
              ) : (
                'Add Question'
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
