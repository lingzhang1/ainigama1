import React from 'react';
import { X, Lock, Globe } from 'lucide-react';
import { Button } from '../ui/button';

interface NewThreadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrivateChat: () => void;
  onSelectPublicThread: () => void;
  isGuest: boolean;
}

export const NewThreadModal: React.FC<NewThreadModalProps> = ({
  isOpen,
  onClose,
  onSelectPrivateChat,
  onSelectPublicThread,
  isGuest
}) => {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-white rounded-lg shadow-xl w-full max-w-sm pointer-events-auto transform transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 md:p-5 border-b">
            <h3 className="text-lg font-semibold text-green-700">Create New</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Options */}
          <div className="p-2">
            {/* Private Chat Option */}
            <button
              onClick={() => {
                onSelectPrivateChat();
                onClose();
              }}
              className="w-full px-4 py-4 md:py-3 text-left hover:bg-gray-50 active:bg-gray-100 flex items-center rounded-lg transition-colors group"
            >
              <div className="flex-shrink-0 w-10 h-10 md:w-9 md:h-9 bg-green-50 rounded-lg flex items-center justify-center group-hover:bg-green-100 transition-colors">
                <Lock className="w-5 h-5 md:w-4 md:h-4 text-green-600" />
              </div>
              <div className="ml-3 flex-1">
                <div className="font-medium text-gray-900 text-base md:text-sm">Private Chat</div>
                <div className="text-xs text-gray-500 mt-0.5">Start with AI, publish later</div>
              </div>
            </button>

            {/* Public Thread Option */}
            <button
              onClick={() => {
                onSelectPublicThread();
                onClose();
              }}
              className="w-full px-4 py-4 md:py-3 text-left hover:bg-gray-50 active:bg-gray-100 flex items-center rounded-lg transition-colors group"
            >
              <div className="flex-shrink-0 w-10 h-10 md:w-9 md:h-9 bg-gray-100 rounded-lg flex items-center justify-center group-hover:bg-gray-200 transition-colors">
                <Globe className="w-5 h-5 md:w-4 md:h-4 text-gray-600" />
              </div>
              <div className="ml-3 flex-1">
                <div className="font-medium text-gray-900 text-base md:text-sm">Public Thread</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {isGuest ? 'Sign in to create public threads' : 'Start discussion directly'}
                </div>
              </div>
            </button>
          </div>

          {/* Footer hint (optional) */}
          <div className="px-4 pb-4 pt-2">
            <p className="text-xs text-center text-gray-500">
              Choose how you'd like to start your conversation
            </p>
          </div>
        </div>
      </div>
    </>
  );
};
