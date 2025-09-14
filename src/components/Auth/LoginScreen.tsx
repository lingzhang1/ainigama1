import React, { useState } from 'react';
import { MessageSquare, Users, Brain, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';
import { AuthModal } from './AuthModal';
import { User } from '../../types';

interface LoginScreenProps {
  onLogin: (user: User) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [showAuthModal, setShowAuthModal] = useState(false);

  const features = [
    {
      icon: MessageSquare,
      title: 'Private AI Chat',
      description: 'Have 1:1 conversations with AI to explore your thoughts and get personalized insights.'
    },
    {
      icon: Users,
      title: 'Community Discussions',
      description: 'Share your conversations publicly to get diverse perspectives from the community.'
    },
    {
      icon: Brain,
      title: 'Knowledge Sharing',
      description: 'Browse public threads and contribute your own answers to help others.'
    },
    {
      icon: Sparkles,
      title: 'Real-time Interactions',
      description: 'Engage with answers through comments and see live updates as discussions evolve.'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-gray-800">Ainigama</h1>
          </div>
          <Button 
            onClick={() => setShowAuthModal(true)}
            className="bg-gray-800 hover:bg-gray-700 text-white"
          >
            Sign In
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-8">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              AI-Powered Knowledge Platform
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Start with private AI conversations, then share with the community to gather diverse perspectives and insights.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button 
              onClick={() => setShowAuthModal(true)}
              size="lg"
              className="bg-gray-800 hover:bg-gray-700 text-white px-8 py-3"
            >
              Get Started
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              className="px-8 py-3"
            >
              Learn More
            </Button>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-16">
            {features.map((feature, index) => (
              <div key={index} className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-4 mx-auto">
                  <feature.icon className="w-6 h-6 text-gray-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t px-6 py-8">
        <div className="max-w-6xl mx-auto text-center text-sm text-gray-500">
          <p>&copy; 2025 Ainigama. All rights reserved.</p>
        </div>
      </footer>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onLogin={onLogin}
      />
    </div>
  );
};