import React, { useState } from 'react';
import { X, Copy, Twitter, Facebook, Linkedin, Link, Share2 } from 'lucide-react';
import { Button } from './button';
import { metricsService } from '../../services/metrics';

export interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  contentType: 'thread' | 'question' | 'answer' | 'comment';
  contentId: string;
  contentTitle?: string;
  userId?: string;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  contentType,
  contentId,
  contentTitle = 'Content',
  userId
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  if (!isOpen) return null;

  const handleCopyLink = async () => {
    setIsLoading(true);
    try {
      await metricsService.copyAndTrackShare(contentType, contentId, userId);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialShare = async (platform: 'twitter' | 'facebook' | 'linkedin') => {
    setIsLoading(true);
    try {
      await metricsService.shareToSocial(contentType, contentId, platform, userId);
    } catch (error) {
      console.error(`Failed to share to ${platform}:`, error);
    } finally {
      setIsLoading(false);
    }
  };

  const shareOptions = [
    {
      name: 'Copy Link',
      icon: Copy,
      action: handleCopyLink,
      color: 'text-gray-600'
    },
    {
      name: 'Twitter',
      icon: Twitter,
      action: () => handleSocialShare('twitter'),
      color: 'text-blue-400'
    },
    {
      name: 'Facebook',
      icon: Facebook,
      action: () => handleSocialShare('facebook'),
      color: 'text-blue-600'
    },
    {
      name: 'LinkedIn',
      icon: Linkedin,
      action: () => handleSocialShare('linkedin'),
      color: 'text-blue-700'
    }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Share2 className="w-5 h-5 mr-2 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">Share {contentTitle}</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="p-1"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content Preview */}
        <div className="mb-6 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600 mb-1">Sharing:</p>
          <p className="text-sm font-medium text-gray-900">{contentTitle}</p>
        </div>

        {/* Share Options */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {shareOptions.map((option) => (
            <Button
              key={option.name}
              variant="outline"
              onClick={option.action}
              disabled={isLoading}
              className="flex flex-col items-center p-4 h-auto"
            >
              <option.icon className={`w-6 h-6 mb-2 ${option.color}`} />
              <span className="text-sm font-medium">{option.name}</span>
            </Button>
          ))}
        </div>

        {/* Copy Success Message */}
        {copySuccess && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center">
              <Link className="w-4 h-4 mr-2 text-green-600" />
              <span className="text-sm text-green-800">Link copied to clipboard!</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isLoading}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
