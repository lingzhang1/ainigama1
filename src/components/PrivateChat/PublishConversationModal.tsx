import React, { useState } from 'react';
import { X, Globe } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';

/**
 * PublishConversationModal Component
 * 
 * Purpose: Modal dialog for publishing private conversations to public threads:
 * - Thread title input with default value
 * - Category selection dropdown
 * - Privacy notice explaining public visibility
 * - Publish/Cancel actions
 * 
 * This component manages its own local state for the form inputs
 * and calls back to the parent when the user confirms publication.
 */

interface PublishConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPublish: (title: string, category: string) => void;
  defaultTitle: string;
}

export const PublishConversationModal: React.FC<PublishConversationModalProps> = ({
  isOpen,
  onClose,
  onPublish,
  defaultTitle
}) => {
  const [title, setTitle] = useState(defaultTitle);
  const [category, setCategory] = useState('General');

  // Reset form when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setTitle(defaultTitle);
      setCategory('General');
    }
  }, [isOpen, defaultTitle]);

  const handlePublish = () => {
    if (title.trim()) {
      onPublish(title.trim(), category);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-lg mx-4 bg-white">
        <CardContent className="p-0">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <h3 className="text-xl font-semibold text-gray-900">Publish to Community</h3>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            <div>
              <p className="text-gray-600 text-sm leading-relaxed">
                Share this conversation with the community to get diverse perspectives and additional insights from other users.
              </p>
            </div>

            {/* Thread Title */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Thread Title
              </label>
              <Input
                type="text"
                placeholder="Give your thread a descriptive title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full"
              />
            </div>

            {/* Category Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Category
              </label>
              <select 
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="General">General</option>
                <option value="Relationships">Relationships</option>
                <option value="Psychology">Psychology</option>
                <option value="Marriage">Marriage</option>
                <option value="Friendship">Friendship</option>
                <option value="Intimacy">Intimacy</option>
              </select>
            </div>

            {/* Privacy Notice */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <Globe className="h-5 w-5 text-blue-600 mt-0.5" />
                </div>
                <div className="text-sm">
                  <p className="text-blue-800 font-medium mb-1">
                    This will be public
                  </p>
                  <p className="text-blue-700">
                    Your conversation will be visible to all community members. Others can add answers and engage in discussions.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end space-x-3 p-6 border-t bg-gray-50">
            <Button 
              onClick={onClose} 
              variant="outline"
              className="px-4 py-2"
            >
              Cancel
            </Button>
            <Button 
              onClick={handlePublish} 
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white"
              disabled={!title.trim()}
            >
              Publish Thread
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};