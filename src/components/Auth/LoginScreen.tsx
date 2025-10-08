import React, { useState } from 'react';
import { Leaf, MessageSquare, Users, Brain, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';
import { AuthModal } from './AuthModal';
import { useAppContext } from '../../context/AppContext';
import { User } from '../../types';

interface LoginScreenProps {
  onLogin: (user: User) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const { dispatch } = useAppContext();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const features = [
    {
      icon: MessageSquare,
      title: 'Private AI\nConversations',
      description: 'Start private conversations with AI to explore your thoughts and get insights.'
    },
    {
      icon: Users,
      title: 'Community Discussion',
      description: 'Share your conversations publicly to get diverse perspectives from the community.'
    },
    {
      icon: Brain,
      title: 'Knowledge Sharing',
      description: 'Browse public threads and contribute your own answers to help others learn more.'
    },
    {
      icon: Sparkles,
      title: 'Real-time Interaction',
      description: 'Engage with answers through comments and see live updates as discussions evolve.'
    }
  ];

  const handleContinueAsGuest = () => {
    dispatch({ type: 'SET_GUEST_MODE', payload: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col font-handwriting">
      {/* Header */}
      <header className="bg-white border-b px-4 md:px-6 py-3 md:py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-green-400 to-green-600 rounded-lg flex items-center justify-center">
              <Leaf className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-green-600">Foliage</h1>
          </div>
          <Button
            onClick={() => setShowAuthModal(true)}
            className="bg-green-600 hover:bg-green-700 text-white text-sm md:text-base"
            size="sm"
          >
            Sign In
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex items-center justify-center px-4 md:px-6 py-6 md:py-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-6 md:mb-4">
            <div className="text-center mb-6 md:mb-4">
              <div className="flex justify-center items-center space-x-2 mb-4">
                <div className="flex items-center space-x-1">
                  <span className="text-3xl md:text-5xl font-bold text-gray-800" style={{fontFamily: 'system-ui, -apple-system, sans-serif'}}>F</span>
                  <span className="text-3xl md:text-5xl font-bold text-gray-800" style={{fontFamily: 'system-ui, -apple-system, sans-serif'}}>O</span>
                  <span className="text-3xl md:text-5xl font-bold text-gray-800" style={{fontFamily: 'system-ui, -apple-system, sans-serif'}}>L</span>
                  <span className="text-3xl md:text-5xl font-bold text-gray-800" style={{fontFamily: 'system-ui, -apple-system, sans-serif'}}>I</span>
                  <span className="text-3xl md:text-5xl font-bold text-gray-800" style={{fontFamily: 'system-ui, -apple-system, sans-serif'}}>A</span>
                  <span className="text-3xl md:text-5xl font-bold text-gray-800" style={{fontFamily: 'system-ui, -apple-system, sans-serif'}}>G</span>
                  <span className="text-3xl md:text-5xl font-bold text-gray-800" style={{fontFamily: 'system-ui, -apple-system, sans-serif'}}>E</span>
                </div>
              </div>
              <h1 className="text-lg md:text-2xl font-medium text-gray-600 mb-3 leading-tight" style={{fontFamily: 'Comic Sans MS, cursive', fontWeight: 'bold'}}>
                Find Openness, Listen, Integrate, And Grow Endlessly
              </h1>
            </div>
            <h2 className="text-lg md:text-2xl text-gray-600" style={{fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: '500', letterSpacing: '0.05em'}}>
              AI-Powered Knowledge Platform
            </h2>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center mb-8 md:mb-6">
            <Button
              onClick={() => setShowAuthModal(true)}
              size="lg"
              className="bg-green-600 hover:bg-green-700 text-white px-6 md:px-8 py-3 md:py-4 h-auto"
            >
              Sign In / Sign Up
            </Button>
            <Button
              onClick={handleContinueAsGuest}
              variant="outline"
              size="lg"
              className="px-6 md:px-8 py-3 md:py-4 border-gray-300 text-gray-700 hover:bg-gray-50 h-auto"
            >
              Continue as Guest
            </Button>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mt-8">
            {features.map((feature, index) => (
              <div key={index} className="bg-white rounded-lg p-5 md:p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-3 md:mb-4 mx-auto">
                  <feature.icon className="w-5 h-5 md:w-6 md:h-6 text-gray-600" />
                </div>
                <h3 className="text-base md:text-lg font-bold text-gray-800 mb-2 md:mb-3 whitespace-pre-line">
                  {feature.title}
                </h3>
                <p className="text-sm md:text-base text-gray-600 leading-relaxed font-normal" style={{
                  fontFamily: 'Comic Sans MS, cursive',
                  fontWeight: 'normal'
                }}>
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 px-4 md:px-6 py-3 md:py-4">
        <div className="max-w-6xl mx-auto text-center text-xs md:text-sm text-gray-600 font-medium" style={{fontFamily: 'Orbitron, monospace'}}>
          <p>&copy; 2025 Foliage. All rights reserved.</p>
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