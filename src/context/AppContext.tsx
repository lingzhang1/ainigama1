import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { User, Thread, PrivateConversation, ViewMode, FeedFilter } from '../types';
import { awsService } from '../services/aws';

interface AppState {
  currentUser: User | null;
  isAuthenticated: boolean;
  isGuestMode: boolean;
  viewMode: ViewMode;
  feedFilter: FeedFilter;
  threads: Thread[];
  privateConversations: PrivateConversation[];
  currentThreadId: string | null;
  currentConversationId: string | null;
  isLoading: boolean;
  error: string | null;
}

type AppAction =
  | { type: 'SET_USER'; payload: User }
  | { type: 'LOGOUT' }
  | { type: 'SET_GUEST_MODE'; payload: boolean }
  | { type: 'SET_VIEW_MODE'; payload: ViewMode }
  | { type: 'SET_FEED_FILTER'; payload: FeedFilter }
  | { type: 'SET_THREADS'; payload: Thread[] }
  | { type: 'ADD_THREAD'; payload: Thread }
  | { type: 'UPDATE_THREAD'; payload: Thread }
  | { type: 'SET_PRIVATE_CONVERSATIONS'; payload: PrivateConversation[] }
  | { type: 'ADD_PRIVATE_CONVERSATION'; payload: PrivateConversation }
  | { type: 'UPDATE_PRIVATE_CONVERSATION'; payload: PrivateConversation }
  | { type: 'SET_CURRENT_THREAD'; payload: string | null }
  | { type: 'SET_CURRENT_CONVERSATION'; payload: string | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };

const initialState: AppState = {
  currentUser: null,
  isAuthenticated: false,
  isGuestMode: false,
  viewMode: 'forum',
  feedFilter: 'recent',
  threads: [],
  privateConversations: [],
  currentThreadId: null,
  currentConversationId: null,
  isLoading: false,
  error: null,
};

const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, currentUser: action.payload, isAuthenticated: true, isGuestMode: false };
    case 'LOGOUT':
      return { ...state, currentUser: null, isAuthenticated: false, isGuestMode: false };
    case 'SET_GUEST_MODE':
      return { ...state, isGuestMode: action.payload, isAuthenticated: false, currentUser: null };
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.payload };
    case 'SET_FEED_FILTER':
      return { ...state, feedFilter: action.payload };
    case 'SET_THREADS':
      return { ...state, threads: action.payload };
    case 'ADD_THREAD':
      return { ...state, threads: [action.payload, ...state.threads] };
    case 'UPDATE_THREAD':
      return {
        ...state,
        threads: state.threads.map(t => t.id === action.payload.id ? action.payload : t)
      };
    case 'SET_PRIVATE_CONVERSATIONS':
      return { ...state, privateConversations: action.payload };
    case 'ADD_PRIVATE_CONVERSATION':
      return { ...state, privateConversations: [action.payload, ...state.privateConversations] };
    case 'UPDATE_PRIVATE_CONVERSATION':
      return {
        ...state,
        privateConversations: state.privateConversations.map(c => 
          c.id === action.payload.id ? action.payload : c
        )
      };
    case 'SET_CURRENT_THREAD':
      return { ...state, currentThreadId: action.payload };
    case 'SET_CURRENT_CONVERSATION':
      return { ...state, currentConversationId: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    default:
      return state;
  }
};

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    // Check for existing authentication
    const checkAuth = async () => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });
        
        // Check localStorage for existing session
        const savedUser = localStorage.getItem('ainigama_user');
        if (savedUser) {
          const user = JSON.parse(savedUser);
          console.log('🔄 Restored user from localStorage:', user.name);
          dispatch({ type: 'SET_USER', payload: user });
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        // Clear invalid stored data
        localStorage.removeItem('ainigama_user');
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    checkAuth();
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};