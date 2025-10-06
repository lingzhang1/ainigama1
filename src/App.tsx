import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useAppContext } from './context/AppContext';
import { useWebSocket } from './hooks/useWebSocket';
import { wsService } from './services/websocket';
import { AllowlistCheck } from './components/Auth/AllowlistCheck';
import { LoginScreen } from './components/Auth/LoginScreen';
import { ForumFeed } from './components/ForumFeed/ForumFeed';
import { PrivateChat } from './components/PrivateChat/PrivateChat';
import { PublicThread } from './components/PublicThread/PublicThread';
import { UserCenter } from './components/UserCenter/UserCenter';
import { User } from './types';
import { initializeMobileTouchHandlers } from './utils/touchHandler';

const AppContent: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const [isAllowlistApproved, setIsAllowlistApproved] = React.useState(false);
  const [isCheckingAllowlist, setIsCheckingAllowlist] = React.useState(true);

  // Initialize WebSocket connection
  useWebSocket(state.currentUser?.id || '');

  // Initialize mobile touch handlers on mount
  React.useEffect(() => {
    // Initialize touch handlers for mobile compatibility
    initializeMobileTouchHandlers();
    console.log('✅ Mobile touch handlers initialized');
  }, []);

  // Check allowlist approval on mount
  React.useEffect(() => {
    const checkAllowlistStatus = () => {
      const approved = localStorage.getItem('ainigama_allowlist_approved');
      setIsAllowlistApproved(approved === 'true');
      setIsCheckingAllowlist(false);
    };

    checkAllowlistStatus();
  }, []);

  const handleLogin = (user: User) => {
    // Save user to localStorage for persistence
    console.log('💾 Saving user to localStorage:', user.name);
    localStorage.setItem('ainigama_user', JSON.stringify(user));
    dispatch({ type: 'SET_USER', payload: user });
    
    // Send user info to WebSocket for storage after a short delay to ensure connection
    setTimeout(() => {
      if (wsService.socket?.connected) {
        console.log('📡 Sending user info to WebSocket:', user.name);
        wsService.socket.emit('authenticate', { userId: user.id, user });
      } else {
        console.warn('⚠️ WebSocket not connected, user info not sent to backend');
      }
    }, 1000);
  };

  const handleLogout = () => {
    console.log('🚪 Logging out user');
    localStorage.removeItem('ainigama_user');
    dispatch({ type: 'LOGOUT' });
  };

  const handleAllowlistApproved = () => {
    setIsAllowlistApproved(true);
    // Enable guest mode by default after allowlist approval
    dispatch({ type: 'SET_GUEST_MODE', payload: true });
  };

  const renderCurrentView = () => {
    switch (state.viewMode) {
      case 'private':
        return <PrivateChat onLogout={handleLogout} />;
      case 'public-thread':
        return <PublicThread onLogout={handleLogout} />;
      case 'user-center':
        return <UserCenter onBack={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'forum' })} />;
      case 'forum':
      default:
        return <ForumFeed onLogout={handleLogout} />;
    }
  };

  // Show loading while checking allowlist
  if (isCheckingAllowlist) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Ainigama...</p>
        </div>
      </div>
    );
  }

  // Show allowlist check if not approved
  if (!isAllowlistApproved) {
    return <AllowlistCheck onApproved={handleAllowlistApproved} />;
  }

  if (state.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Ainigama...</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 mb-4">{state.error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!state.isAuthenticated && !state.isGuestMode) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {renderCurrentView()}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AppProvider>
      <Router>
        <Routes>
          <Route path="/" element={<AppContent />} />
          <Route path="/thread/:id" element={<AppContent />} />
          <Route path="/private" element={<AppContent />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AppProvider>
  );
};

export default App;