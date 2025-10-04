import React, { useState } from 'react';
import { MessageSquare, Users, Brain, Sparkles } from 'lucide-react';
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
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-yellow-50 flex flex-col font-handwriting">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-green-400 to-yellow-400 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-green-600">MELON</h1>
          </div>
          <Button 
            onClick={() => setShowAuthModal(true)}
            className="bg-gradient-to-r from-green-400 to-yellow-400 hover:from-green-500 hover:to-yellow-500 text-white"
          >
            Sign In
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex items-center justify-center px-6 py-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-4">
            <h1 className="text-3xl font-bold text-green-700 mb-2">
              <span className="text-4xl text-green-800 font-normal">M</span><span style={{fontFamily: 'Comic Sans MS, cursive', fontWeight: 'normal'}}>indful </span><span className="text-4xl text-green-800 font-normal">E</span><span style={{fontFamily: 'Comic Sans MS, cursive', fontWeight: 'normal'}}>xploration for </span><span className="text-4xl text-green-800 font-normal">L</span><span style={{fontFamily: 'Comic Sans MS, cursive', fontWeight: 'normal'}}>istening, </span><span className="text-4xl text-green-800 font-normal">O</span><span style={{fontFamily: 'Comic Sans MS, cursive', fontWeight: 'normal'}}>penness, </span><span className="text-4xl text-green-800 font-normal">N</span><span style={{fontFamily: 'Comic Sans MS, cursive', fontWeight: 'normal'}}>urturing</span>
            </h1>
            <h2 className="text-2xl font-medium text-green-600 mb-3 leading-tight" style={{fontFamily: 'Comic Sans MS, cursive', fontWeight: 'bold'}}>
              AI-Powered Knowledge Platform
            </h2>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
            <Button 
              onClick={() => setShowAuthModal(true)}
              size="lg"
              className="bg-gradient-to-r from-green-400 to-yellow-400 hover:from-green-500 hover:to-yellow-500 text-white px-8 py-3"
            >
              Sign In / Sign Up
            </Button>
            <Button 
              onClick={handleContinueAsGuest}
              variant="outline"
              size="lg"
              className="px-8 py-3 border-green-300 text-green-600 hover:bg-green-50"
            >
              Continue as Guest
            </Button>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
            {features.map((feature, index) => (
              <div key={index} className="bg-white rounded-lg p-6 shadow-sm border border-green-200 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-gradient-to-r from-green-100 to-yellow-100 rounded-lg flex items-center justify-center mb-4 mx-auto">
                  <feature.icon className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="text-lg font-bold text-green-700 mb-3 whitespace-pre-line">
                  {feature.title}
                </h3>
                <p className="text-base text-green-600 leading-relaxed font-normal" style={{
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
      <footer className="bg-gradient-to-r from-green-50 to-yellow-50 border-t border-green-200 px-6 py-4">
        <div className="max-w-6xl mx-auto text-center text-sm text-green-600 font-medium" style={{fontFamily: 'Orbitron, monospace'}}>
          <p>&copy; 2025 Melon. All rights reserved.</p>
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