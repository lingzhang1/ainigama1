import React, { useState, useEffect } from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import { useWebSocket } from './hooks/useWebSocket';
import { AllowlistCheck } from './components/Auth/AllowlistCheck';
import { LoginScreen } from './components/Auth/LoginScreen';
import { ForumFeed } from './components/ForumFeed/ForumFeed';
import { PrivateChat } from './components/PrivateChat/PrivateChat';
import PublicThread from './components/PublicThread/PublicThread';
import { User } from './types';

const AppContent: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const [allowlistApproved, setAllowlistApproved] = useState(false);

  // Check allowlist approval on mount
  useEffect(() => {
    const approved = localStorage.getItem('ainigama_allowlist_approved');
    if (approved === 'true') {
      setAllowlistApproved(true);
    }
  }, []);

  // Initialize WebSocket connection for authenticated users
  useWebSocket(state.currentUser?.id || '');

  const handleLogin = (user: User) => {
    console.log('🔐 User logged in:', user.name, user.email);
    
    // Store user in localStorage for persistence
    localStorage.setItem('ainigama_user', JSON.stringify(user));
    
    // Update app state
    dispatch({ type: 'SET_USER', payload: user });
  };

  const handleLogout = () => {
    console.log('🔐 User logged out');
    
    // Clear stored user data
    localStorage.removeItem('ainigama_user');
    
    // Update app state
    dispatch({ type: 'LOGOUT' });
  };

  // Show allowlist check first
  if (!allowlistApproved) {
    return <AllowlistCheck onApproved={() => setAllowlistApproved(true)} />;
  }

  // Show login screen if not authenticated and not in guest mode
  if (!state.isAuthenticated && !state.isGuestMode) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // Show main application based on view mode
  switch (state.viewMode) {
    case 'private':
      return <PrivateChat onLogout={handleLogout} />;
    case 'public-thread':
      return <PublicThread onLogout={handleLogout} />;
    case 'forum':
    default:
      return <ForumFeed onLogout={handleLogout} />;
  }
};

const App: React.FC = () => {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
};

export default App;