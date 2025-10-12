import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AppProvider, useAppContext } from './context/AppContext';
import { NotificationProvider } from './context/NotificationContext';
import { useWebSocket } from './hooks/useWebSocket';
import { generateThreadUrl } from './hooks/useThreadNavigation';
import { wsService } from './services/websocket';
import { AllowlistCheck } from './components/Auth/AllowlistCheck';
import { LoginScreen } from './components/Auth/LoginScreen';
import { ForumFeed } from './components/ForumFeed/ForumFeed';
import { CategoriesPage } from './components/ForumFeed/CategoriesPage';
import { PrivateChat } from './components/PrivateChat/PrivateChat';
import { PublicThread } from './components/PublicThread/PublicThread';
import { UserCenter } from './components/UserCenter/UserCenter';
import { AccountManagement } from './components/Account/AccountManagement';
import { NotificationBell } from './components/Notifications/NotificationBell';
import { NotificationCenter } from './components/Notifications/NotificationCenter';
import { User, Notification } from './types';
import { initializeMobileTouchHandlers } from './utils/touchHandler';

const AppContent: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAllowlistApproved, setIsAllowlistApproved] = React.useState(false);
  const [isCheckingAllowlist, setIsCheckingAllowlist] = React.useState(true);
  const [showNotifications, setShowNotifications] = React.useState(false);

  // Get current route to determine view mode
  const currentPath = location.pathname;

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

  // Auto-detect view mode based on current URL path
  React.useEffect(() => {
    if (currentPath.startsWith('/thread/')) {
      if (state.viewMode !== 'public-thread') {
        console.log('🔄 Setting view mode to public-thread based on URL:', currentPath);
        dispatch({ type: 'SET_VIEW_MODE', payload: 'public-thread' });
      }
    } else if (currentPath === '/private') {
      if (state.viewMode !== 'private') {
        dispatch({ type: 'SET_VIEW_MODE', payload: 'private' });
      }
    } else if (currentPath === '/') {
      // Clear current thread when returning to forum, but only if not in categories or other non-route views
      if (state.viewMode !== 'forum' && state.viewMode !== 'categories' && state.viewMode !== 'user-center' && state.viewMode !== 'account') {
        console.log('🔄 Setting view mode to forum, clearing current thread');
        dispatch({ type: 'SET_VIEW_MODE', payload: 'forum' });
        dispatch({ type: 'SET_CURRENT_THREAD', payload: null });
      }
    }
  }, [currentPath, state.viewMode, dispatch]);

  const handleNotificationClick = (notification: Notification) => {
    console.log('🔔 Notification clicked:', notification);
    console.log('🔍 Notification keys:', Object.keys(notification));
    console.log('🔍 Notification threadId:', notification.threadId);
    console.log('🔍 Notification thread_id:', (notification as any).thread_id);
    console.log('🔍 Full notification object:', JSON.stringify(notification, null, 2));
    
    if (!notification.threadId) {
      console.error('❌ No thread ID in notification');
      console.error('Available keys:', Object.keys(notification));
      return;
    }

    // Generate appropriate URL based on notification type and content
    let url: string;

    switch (notification.contentType) {
      case 'comment':
        // Navigate to the comment within an answer
        if (notification.relatedContentId) {
          url = generateThreadUrl({
            threadId: notification.threadId,
            answerId: notification.relatedContentId,
            commentId: notification.contentId,
            highlight: true,
            from: 'notification'
          });
        } else {
          // Fallback if relatedContentId is missing
          url = generateThreadUrl({
            threadId: notification.threadId,
            highlight: true,
            from: 'notification'
          });
        }
        break;

      case 'answer':
        // Navigate to specific answer
        url = generateThreadUrl({
          threadId: notification.threadId,
          answerId: notification.contentId,
          highlight: true,
          from: 'notification'
        });
        break;

      case 'thread':
      default:
        // Navigate to thread
        url = generateThreadUrl({
          threadId: notification.threadId,
          highlight: true,
          from: 'notification'
        });
        break;
    }

    console.log('🔗 Navigating from notification to:', url);
    console.log('📍 Current location before navigation:', location.pathname);
    
    // Navigate to the URL
    navigate(url);
    
    // Force scroll to top to ensure clean navigation
    setTimeout(() => {
      console.log('📍 New location after navigation:', window.location.pathname);
    }, 100);
  };

  const renderCurrentView = () => {
    switch (state.viewMode) {
      case 'private':
        return <PrivateChat onLogout={handleLogout} />;
      case 'public-thread':
        return <PublicThread onLogout={handleLogout} />;
      case 'user-center':
        return <UserCenter onBack={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'forum' })} />;
      case 'account':
        return <AccountManagement onBack={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'forum' })} />;
      case 'categories':
        console.log('📂 Rendering CategoriesPage');
        return <CategoriesPage onClose={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'forum' })} />;
      case 'forum':
      default:
        return <ForumFeed onLogout={handleLogout} onShowNotifications={() => setShowNotifications(true)} />;
    }
  };

  // Show loading while checking allowlist
  if (isCheckingAllowlist) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
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
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
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

  // Wrap with NotificationProvider if user is authenticated
  const content = (
    <div className="min-h-screen bg-gray-50">
      {/* Notification Bell - Fixed position (hidden on mobile for forum view as it's in footer) */}
      {state.currentUser && (
        <div className={`fixed top-4 right-4 z-50 ${state.viewMode === 'forum' ? 'hidden md:block' : ''}`}>
          <NotificationBell onClick={() => setShowNotifications(true)} />
        </div>
      )}

      {/* Notification Center */}
      {state.currentUser && (
        <NotificationCenter
          isOpen={showNotifications}
          onClose={() => setShowNotifications(false)}
          onNavigate={handleNotificationClick}
        />
      )}

      {renderCurrentView()}
    </div>
  );

  // Wrap with NotificationProvider if authenticated (not guest)
  if (state.currentUser && !state.isGuestMode) {
    return (
      <NotificationProvider userId={state.currentUser.id}>
        {content}
      </NotificationProvider>
    );
  }

  return content;
};

const App: React.FC = () => {
  return (
    <AppProvider>
      <Router>
        <Routes>
          {/* Home page */}
          <Route path="/" element={<AppContent />} />
          
          {/* Private chat */}
          <Route path="/private" element={<AppContent />} />
          
          {/* Thread-level routes with deep linking support */}
          <Route path="/thread/:threadId" element={<AppContent />} />
          
          {/* Question-level deep linking */}
          <Route path="/thread/:threadId/question/:questionId" element={<AppContent />} />
          
          {/* Answer-level deep linking */}
          <Route path="/thread/:threadId/answer/:answerId" element={<AppContent />} />
          
          {/* Comment-level deep linking */}
          <Route path="/thread/:threadId/answer/:answerId/comment/:commentId" element={<AppContent />} />
          
          {/* Fallback for unknown routes */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AppProvider>
  );
};

export default App;