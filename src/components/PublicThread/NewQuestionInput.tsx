import React from 'react';
import { Plus, Loader2 } from 'lucide-react';
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
  return (
    <Card className="border border-gray-200">
      <CardContent className="p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Plus className="w-5 h-5 text-gray-500" />
          <h4 className="font-medium text-gray-700">Add Another Question</h4>
        </div>
        <div className="space-y-3">
          <Textarea
            placeholder="What else would you like to ask the community?"
            value={newQuestion}
            onChange={(e) => onQuestionChange(e.target.value)}
            className="min-h-[100px]"
          />
          <div className="flex justify-end">
            <Button
              onClick={onAddQuestion}
              disabled={!newQuestion.trim() || isAddingQuestion}
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