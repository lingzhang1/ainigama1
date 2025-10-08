import React, { useState, useEffect, useRef } from 'react';
import { Menu, Globe } from 'lucide-react';
import { Message, PrivateConversation } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useMobileDrawer } from '../../hooks/useMobileDrawer';
import { useSwipeGesture } from '../../hooks/useSwipeGesture';
import { FloatingActionButton } from '../ui/FloatingActionButton';
import { deepSeekService, ChatMessage } from '../../services/deepseek';
import { v4 as uuidv4 } from 'uuid';
import { estimateTokens, countChatMessagesTokens, wouldExceedThreshold } from '../../utils/tokenCounter';
import { CONTEXT_OVERFLOW_THRESHOLD } from '../../constants/ai';

// Import all the smaller components
import { ConversationSidebar } from './ConversationSidebar';
import { ChatHeader } from './ChatHeader';
import { ChatMessageDisplay } from './ChatMessageDisplay';
import { MessageInput } from './MessageInput';
import { NoConversationSelected } from './NoConversationSelected';
import { PublishConversationModal } from './PublishConversationModal';

import { ConversationContextWarning } from './ConversationContextWarning';
/**
 * PrivateChat Component - Main Orchestrator
 * 
 * Purpose: This is the main component that orchestrates all private chat functionality:
 * - Manages all state (conversations, current conversation, UI states)
 * - Handles data fetching and persistence
 * - Coordinates between child components
 * - Manages AI streaming and WebSocket connections
 * - Handles conversation publishing to public threads
 * 
 * Architecture: This component acts as a "smart container" that manages business logic
 * and state, while delegating UI rendering to smaller, focused "dumb components".
 * This keeps the UI components reusable and testable while centralizing complex logic.
 */

interface PrivateChatProps {
  onLogout: () => void;
}

export const PrivateChat: React.FC<PrivateChatProps> = ({ onLogout }) => {
  const { state, dispatch } = useAppContext();
  const isGuest = state.isGuestMode && !state.isAuthenticated;
  
  // Main state management
  const [conversations, setConversations] = useState<PrivateConversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<PrivateConversation | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showThinking, setShowThinking] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  
  // Context window management state
  const [conversationSummary, setConversationSummary] = useState<string | null>(null);
  const [showContextWarning, setShowContextWarning] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [lastUserQuestion, setLastUserQuestion] = useState<string | null>(null);
  
  // Refs for managing streaming and preventing race conditions
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isProcessingRef = useRef(false);

  // Mobile drawer state
  const { isOpen: isSidebarOpen, isMobile, toggle: toggleSidebar, close: closeSidebar, open: openSidebar } = useMobileDrawer();

  // Swipe gestures for mobile
  useSwipeGesture({
    onSwipeRight: () => {
      if (isMobile && !isSidebarOpen && currentConversation) {
        openSidebar();
      }
    },
    enabled: isMobile && !isSidebarOpen && !!currentConversation,
  });

  // Streaming state management using refs (to avoid state update issues)
  const streamingRef = useRef<{
    thinking: string;
    content: string;
    isActive: boolean;
    isTyping: boolean;
    thinkingElement: HTMLDivElement | null;
    contentElement: HTMLDivElement | null;
    streamingContainer: HTMLDivElement | null;
  }>({
    thinking: '',
    content: '',
    isActive: false,
    isTyping: false,
    thinkingElement: null,
    contentElement: null,
    streamingContainer: null,
  });
  
  const [isStreaming, setIsStreaming] = useState(false);

  // Initialize WebSocket connection for persistence only
  const ws = useWebSocket(state.currentUser?.id || '');

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentConversation?.messages]);

  // Load conversations from backend on component mount
  useEffect(() => {
    // Skip loading conversations for guest users
    if (isGuest) {
      return;
    }
    
    const loadConversations = async () => {
      if (!state.currentUser?.id) return;
      
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
        console.log('Loading conversations from:', apiUrl);
        
        const response = await fetch(`${apiUrl}/user-conversations/${state.currentUser.id}`);
        
        if (response.ok) {
          const loadedConversations = await response.json();
          const conversationsArray = Array.isArray(loadedConversations) ? loadedConversations : loadedConversations.conversations || [];
          // Sort by updatedAt descending (latest first)
          const sortedConversations = conversationsArray.sort((a, b) => 
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
          setConversations(sortedConversations);
          
          // Set first conversation as current if none selected
          if (sortedConversations.length > 0 && !currentConversation) {
            setCurrentConversation(sortedConversations[0]);
          }
        } else {
          console.error('Failed to load conversations:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('Failed to load conversations:', error);
      }
    };

    loadConversations();
  }, [state.currentUser?.id, isGuest]);

  // Load messages for current conversation
  useEffect(() => {
    // Skip loading messages for guest users
    if (isGuest) {
      return;
    }
    
    const loadMessages = async () => {
      if (!currentConversation?.id) {
        console.log('❌ No current conversation ID, skipping message load');
        return;
      }
      
      console.log('🔄 Loading messages for conversation:', currentConversation.id);
      
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
        console.log('Loading messages from:', apiUrl);
        
        const response = await fetch(`${apiUrl}/messages/${currentConversation.id}`);
        
        if (response.ok) {
          const messages = await response.json();
          console.log('📥 Received messages for conversation:', currentConversation.id, {
            messageCount: messages.length,
            messageIds: messages.map(m => m.id)
          });
          
          setCurrentConversation(prev => {
            if (!prev || prev.id !== currentConversation.id) {
              console.log('⚠️ Conversation changed during message load, ignoring');
              return prev;
            }
            return {
              ...prev,
              messages
            };
          });
        } else {
          console.error('Failed to load messages:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
      }
    };

    loadMessages();
  }, [currentConversation?.id, isGuest]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cleanup any pending operations
    };
  }, []);

  /**
   * Handle sending a new message
   * This is the core message processing logic that:
   * 1. Prevents duplicate processing
   * 2. Creates user message
   * 3. Streams AI response
   * 4. Saves to backend
   */
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !currentConversation) return;

    // CRITICAL: Check if already processing to prevent double execution
    if (isProcessingRef.current) {
      console.log('⚠️ Already processing a message, ignoring new request');
      return;
    }

    console.log('🚀 Starting message processing... Setting processing lock.');
    
    // Mark as processing IMMEDIATELY to prevent race conditions
    isProcessingRef.current = true;
    
    // For guest users, create a temporary conversation if none exists
    let workingConversation = currentConversation;
    if (isGuest && !workingConversation) {
      workingConversation = {
        id: `guest-${Date.now()}`,
        userId: 'guest',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        title: 'Guest Conversation'
      };
      setCurrentConversation(workingConversation);
    }

    const userMessage: Message = {
      id: uuidv4(),
      content: newMessage.trim(),
      timestamp: new Date(),
      sender: 'user'
    };

    // Add user message to conversation immediately
    const updatedConversation = {
      ...workingConversation,
      messages: [...workingConversation.messages, userMessage],
      updatedAt: new Date()
    };
    setCurrentConversation(updatedConversation);
    setConversations(prev => 
      prev.map(c => c.id === updatedConversation.id ? updatedConversation : c)
    );

    // Generate title for new conversations (first message)
    let shouldGenerateTitle = false;
    if (!workingConversation.title && workingConversation.messages.length === 0) {
      shouldGenerateTitle = true;
    }
    setNewMessage('');
    
    console.log('🔒 Processing locked, starting AI stream...');
    
    // Check for context window overflow BEFORE processing
    const chatMessagesForTokenCount: ChatMessage[] = updatedConversation.messages.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.content
    }));

    const currentTokenCount = countChatMessagesTokens(chatMessagesForTokenCount);
    console.log(`📊 Estimated token count: ${currentTokenCount} / ${CONTEXT_OVERFLOW_THRESHOLD}`);

    // If context window is exceeded, handle overflow
    if (currentTokenCount > CONTEXT_OVERFLOW_THRESHOLD) {
      console.warn('⚠️ Private chat context overflow detected. Triggering summarization.');
      
      // Store the user's last question for later answering
      setLastUserQuestion(newMessage.trim());
      
      // Release processing lock immediately since we're not calling AI
      isProcessingRef.current = false;
      
      // Show warning banner
      setShowContextWarning(true);
      setIsGeneratingSummary(true);
      
      // Add system message to inform user
      const systemMessage: Message = {
        id: uuidv4(),
        content: "Your conversation history is getting very long and may cause issues with AI responses. A summary is being prepared. Please use the banner above to start a new conversation with the summary.",
        timestamp: new Date(),
        sender: 'ai'
      };
      
      const conversationWithSystemMessage = {
        ...updatedConversation,
        messages: [...updatedConversation.messages, systemMessage],
        updatedAt: new Date()
      };
      
      setCurrentConversation(conversationWithSystemMessage);
      setConversations(prev => 
        isGuest ? [conversationWithSystemMessage] : prev.map(c => c.id === conversationWithSystemMessage.id ? conversationWithSystemMessage : c)
      );
      
      // Generate summary asynchronously (exclude the last user message)
      try {
        // Remove the last user message from the summary to avoid duplication
        const messagesForSummary = chatMessagesForTokenCount.slice(0, -1);
        const summary = await deepSeekService.summarizeConversation(messagesForSummary);
        setConversationSummary(summary);
        setIsGeneratingSummary(false);
        console.log('✅ Summary generated successfully (excluding last user message)');
      } catch (error) {
        console.error('❌ Summarization failed:', error);
        setIsGeneratingSummary(false);
        
        // Add error message to conversation
        const errorMessage: Message = {
          id: uuidv4(),
          content: "Failed to summarize conversation history. Please start a new chat manually to avoid potential issues.",
          timestamp: new Date(),
          sender: 'ai'
        };
        
        setCurrentConversation(prev => prev ? {
          ...prev,
          messages: [...prev.messages, errorMessage],
          updatedAt: new Date()
        } : null);
      }
      
      return; // Stop processing here
    }
    
    // Reset streaming refs and show streaming UI
    streamingRef.current = {
      thinking: '',
      content: '',
      isActive: true,
      isTyping: false, // Start as false, will be set to true when content starts
      thinkingElement: null,
      contentElement: null,
      streamingContainer: null,
    };

    // Show streaming container via DOM manipulation
    const showStreamingUI = () => {
      if (streamingRef.current.streamingContainer) {
        streamingRef.current.streamingContainer.style.display = 'block';
      }
    };

    // Hide streaming container via DOM manipulation
    const hideStreamingUI = () => {
      if (streamingRef.current.streamingContainer) {
        streamingRef.current.streamingContainer.style.display = 'none';
      }
    };

    try {
      // Prepare conversation history for AI
      const chatMessages: ChatMessage[] = updatedConversation.messages.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));

      // Direct DOM manipulation for streaming display
      const updateStreamingDisplay = () => {
        showStreamingUI();
        if (streamingRef.current.thinkingElement) {
          streamingRef.current.thinkingElement.textContent = streamingRef.current.thinking;
        }
        if (streamingRef.current.contentElement) {
          // For streaming content, we'll use innerHTML to support basic markdown formatting
          // This is a simplified approach for real-time streaming
          const formattedContent = streamingRef.current.content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">$1</code>')
            .replace(/^### (.*$)/gim, '<h3 class="text-sm font-medium mb-1 mt-2">$1</h3>')
            .replace(/^## (.*$)/gim, '<h2 class="text-sm font-semibold mb-1 mt-2">$1</h2>')
            .replace(/^# (.*$)/gim, '<h1 class="text-base font-bold mb-2 mt-3">$1</h1>')
            .replace(/^- (.*$)/gim, '<li class="ml-2">$1</li>')
            .replace(/\n/g, '<br>');
          streamingRef.current.contentElement.innerHTML = formattedContent;
        }
        // Auto-scroll
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      };

      console.log('🤖 Starting AI stream...');
      
      // Stream AI response using DeepSeek service
      await deepSeekService.streamChat(chatMessages, {
        onThinking: (thinking) => {
          if (streamingRef.current.isActive) {
            streamingRef.current.thinking += thinking;
            updateStreamingDisplay();
          }
        },
        onContent: (content) => {
          if (streamingRef.current.isActive) {
            // Mark as typing when content starts streaming
            if (!streamingRef.current.isTyping) {
              streamingRef.current.isTyping = true;
              console.log('🎯 Content streaming started, showing typing indicator');
            }
            streamingRef.current.content += content;
            updateStreamingDisplay();
          }
        },
        onComplete: async (fullContent) => {
          console.log('✅ AI stream completed');
          
          // Check if we're still the active request - CRITICAL CHECK
          if (!isProcessingRef.current) {
            console.log('⚠️ Request was cancelled or already completed, ignoring completion');
            return;
          }
          
          // Mark streaming as inactive FIRST
          isProcessingRef.current = false;
          console.log('🔓 Processing unlocked in onComplete');
          streamingRef.current.isActive = false;
          streamingRef.current.isTyping = false;
          
          // Hide streaming UI
          hideStreamingUI();
          
          // Ensure we capture the thinking process
          const finalThinking = streamingRef.current.thinking;
          console.log('Captured thinking for persistence:', finalThinking); // Debug log
          
          const aiMessage: Message = {
            id: uuidv4(),
            content: fullContent,
            timestamp: new Date(),
            sender: 'ai',
            thinking: finalThinking || undefined
          };

          console.log('AI message with thinking:', aiMessage); // Debug log

          // Generate title if this is the first message
          let generatedTitle = currentConversation.title;
          if (shouldGenerateTitle) {
            try {
              const titleMessages: ChatMessage[] = [
                {
                  role: 'user',
                  content: `Summarize this question into a short, descriptive title (max 6 words): "${userMessage.content}"`
                }
              ];
              
              generatedTitle = await deepSeekService.generateResponse(titleMessages);
              generatedTitle = generatedTitle.replace(/['"]/g, '').trim();
              
              // Limit title length
              if (generatedTitle.length > 50) {
                generatedTitle = generatedTitle.substring(0, 47) + '...';
              }
              
              console.log('Generated title:', generatedTitle);
            } catch (titleError) {
              console.error('Failed to generate title:', titleError);
              // Fallback: use first few words of user message
              generatedTitle = userMessage.content.split(' ').slice(0, 6).join(' ');
              if (generatedTitle.length > 50) {
                generatedTitle = generatedTitle.substring(0, 47) + '...';
              }
            }
          }
          // Add AI message to conversation
          const finalConversation = {
            ...updatedConversation,
            messages: [...updatedConversation.messages, aiMessage],
            title: generatedTitle,
            updatedAt: new Date()
          };
          
          setCurrentConversation(finalConversation);
          setConversations(prev => 
            isGuest ? [finalConversation] : prev.map(c => c.id === finalConversation.id ? finalConversation : c)
              .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          );

          // Save title to backend if generated
          if (shouldGenerateTitle && generatedTitle) {
            try {
              const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
              await fetch(`${apiUrl}/conversations/${currentConversation.id}/title`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ title: generatedTitle })
              });
              console.log('Title saved to backend:', generatedTitle);
            } catch (titleSaveError) {
              console.error('Failed to save title to backend:', titleSaveError);
            }
          }
          // Send both messages to backend for persistence in correct order
          if (ws.socket?.connected && !isGuest) {
            console.log('Sending messages to backend in order:', [userMessage, aiMessage]);
            ws.socket.emit('save_conversation', {
              conversationId: currentConversation.id,
              messages: [userMessage, aiMessage] // Ensure correct order: user first, then AI
            });
          } else {
            console.warn('WebSocket not connected, attempting to save via API');
            // Fallback: save via REST API if WebSocket is not available (skip for guests)
            if (!isGuest) {
            try {
              const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
              await fetch(`${apiUrl}/save-messages`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  conversationId: currentConversation.id,
                  messages: [userMessage, aiMessage] // Ensure correct order: user first, then AI
                })
              });
              console.log('Messages saved via REST API fallback');
            } catch (apiError) {
              console.error('Failed to save messages via API:', apiError);
            }
            }
          }
        },
        onError: (error) => {
          console.error('AI streaming error:', error);
          
          // Only unlock if we're still the active request
          if (isProcessingRef.current) {
            isProcessingRef.current = false;
            console.log('🔓 Processing unlocked in onError');
          }
          
          streamingRef.current.isActive = false;
          streamingRef.current.isTyping = false;
          
          // Hide streaming UI
          hideStreamingUI();
          
          // Show error message
          const errorMessage: Message = {
            id: uuidv4(),
            content: `Sorry, I encountered an error: ${error.message}`,
            timestamp: new Date(),
            sender: 'ai'
          };

          const errorConversation = {
            ...updatedConversation,
            messages: [...updatedConversation.messages, errorMessage],
            updatedAt: new Date()
          };
          
          setCurrentConversation(errorConversation);
          setConversations(prev => 
            prev.map(c => c.id === errorConversation.id ? errorConversation : c)
          );
        }
      });

    } catch (error) {
      console.error('Failed to send message:', error);
      
      // Only unlock if we're still the active request
      if (isProcessingRef.current) {
        isProcessingRef.current = false;
        console.log('🔓 Processing unlocked in catch block');
      }
      
      streamingRef.current.isTyping = false;
      hideStreamingUI();
    }
  };

  /**
   * Handle creating a new conversation
   */
  const handleNewConversation = async () => {
    // For guest users, create a temporary conversation
    if (isGuest) {
      const guestConversation: PrivateConversation = {
        id: `guest-${Date.now()}`,
        userId: 'guest',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        title: 'Guest Conversation'
      };
      setCurrentConversation(guestConversation);
      setConversations([guestConversation]);
      return;
    }
    
    if (!state.currentUser?.id) return;
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
      const response = await fetch(`${apiUrl}/new-conversation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: state.currentUser.id,
          title: null
        })
      });
      
      if (response.ok) {
        const newConversation = await response.json();
        setConversations(prev => [newConversation, ...prev].sort((a, b) => 
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        ));
        setCurrentConversation(newConversation);
      }
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  /**
   * Handle deleting a conversation
   */
  const handleDeleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    // Guest users can't delete conversations (they're not persisted anyway)
    if (isGuest) {
      return;
    }
    
    e.stopPropagation(); // Prevent conversation selection when clicking delete
    
    if (!confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
      return;
    }
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
      const response = await fetch(`${apiUrl}/conversations/${conversationId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        // Remove from conversations list
        setConversations(prev => prev.filter(c => c.id !== conversationId));
        
        // If this was the current conversation, clear it
        if (currentConversation?.id === conversationId) {
          setCurrentConversation(null);
        }
        
        console.log('✅ Conversation deleted:', conversationId);
      } else {
        console.error('Failed to delete conversation:', response.statusText);
        alert('Failed to delete conversation. Please try again.');
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
      alert('Failed to delete conversation. Please try again.');
    }
  };

  /**
   * Handle making conversation public
   */
  const handleMakePublic = () => {
    // Redirect guest users to login
    if (isGuest) {
      dispatch({ type: 'SET_GUEST_MODE', payload: false });
      return;
    }
    
    setShowPublishModal(true);
  };

  /**
   * Handle publishing conversation to public thread
   */
  const handlePublishConversation = async (title: string, category: string) => {
    // This should not be called for guest users, but add safety check
    if (isGuest) {
      return;
    }
    
    if (!currentConversation || !state.currentUser) return;
    
    try {
      // Extract the first user message as the main question
      const userMessages = currentConversation.messages.filter(m => m.sender === 'user');
      const aiMessages = currentConversation.messages.filter(m => m.sender === 'ai');
      
      if (userMessages.length === 0) {
        console.error('No user messages to publish');
        return;
      }

      // Create thread data
      const threadData = {
        title: title,
        creatorId: state.currentUser.id,
        category: category,
        questions: userMessages.map((userMsg, index) => ({
          id: userMsg.id,
          content: userMsg.content,
          userId: state.currentUser!.id,
          timestamp: userMsg.timestamp
        })),
        initialAnswers: aiMessages.map((aiMsg, index) => {
          // Find the corresponding user message for this AI response
          const correspondingUserMsg = userMessages[index];
          return {
            id: aiMsg.id,
            questionId: correspondingUserMsg?.id || userMessages[0].id,
            content: aiMsg.content,
            isAI: true,
            isPinned: true,
            thinking: aiMsg.thinking || undefined
          };
        })
      };

      // Call API to create public thread
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
      console.log('Creating public thread at:', apiUrl);
      
      const response = await fetch(`${apiUrl}/threads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(threadData)
      });

      if (response.ok) {
        const newThread = await response.json();
        console.log('✅ Successfully published thread:', newThread.id);
        
        // Update app state
        dispatch({ type: 'ADD_THREAD', payload: newThread });
        dispatch({ type: 'SET_CURRENT_THREAD', payload: newThread.id });
        dispatch({ type: 'SET_VIEW_MODE', payload: 'public-thread' });
        
        setShowPublishModal(false);
      } else {
        console.error('Failed to publish thread:', response.statusText);
        const errorText = await response.text();
        console.error('Error details:', errorText);
      }
    } catch (error) {
      console.error('Error publishing conversation:', error);
    }
  };

  // Navigation handlers
  const handleGoToForum = () => {
    dispatch({ type: 'SET_VIEW_MODE', payload: 'forum' });
  };

  const handleSignIn = () => {
    dispatch({ type: 'SET_GUEST_MODE', payload: false });
  };

  /**
   * Handle AI response to user's question with summary context
   */
  const handleAIResponse = async (conversation: PrivateConversation, userQuestion: string, summary: string) => {
    try {
      // First, add the user's question to the conversation
      const userMessage: Message = {
        id: uuidv4(),
        content: userQuestion,
        timestamp: new Date(),
        sender: 'user'
      };

      const conversationWithUserMessage = {
        ...conversation,
        messages: [...conversation.messages, userMessage],
        updatedAt: new Date()
      };

      // Update the conversation state
      setCurrentConversation(conversationWithUserMessage);
      setConversations(prev => 
        isGuest ? [conversationWithUserMessage] : prev.map(c => c.id === conversationWithUserMessage.id ? conversationWithUserMessage : c)
      );

      // Build context with summary and user's question
      const contextMessages: ChatMessage[] = [
        {
          role: 'system',
          content: `You are a helpful AI assistant. Here's a summary of the previous conversation: ${summary}\n\nNow the user is asking: "${userQuestion}"\n\nPlease provide a helpful response based on both the summary context and the current question.`
        },
        {
          role: 'user',
          content: userQuestion
        }
      ];

      // Initialize streaming for this response
      streamingRef.current = {
        thinking: '',
        content: '',
        isTyping: true,
        isActive: true,
        thinkingElement: null,
        contentElement: null,
        streamingContainer: null,
      };

      // Show streaming UI
      const showStreamingUI = () => {
        const container = streamingRef.current?.streamingContainer;
        if (container) {
          container.style.display = 'block';
        }
      };

      const updateStreamingDisplay = () => {
        showStreamingUI();
        if (streamingRef.current?.thinkingElement) {
          streamingRef.current.thinkingElement.textContent = streamingRef.current.thinking;
        }
        if (streamingRef.current?.contentElement) {
          // For streaming content, we'll use innerHTML to support basic markdown formatting
          // This is a simplified approach for real-time streaming
          const formattedContent = streamingRef.current.content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">$1</code>')
            .replace(/^### (.*$)/gim, '<h3 class="text-sm font-medium mb-1 mt-2">$1</h3>')
            .replace(/^## (.*$)/gim, '<h2 class="text-sm font-semibold mb-1 mt-2">$1</h2>')
            .replace(/^# (.*$)/gim, '<h1 class="text-base font-bold mb-2 mt-3">$1</h1>')
            .replace(/^- (.*$)/gim, '<li class="ml-2">$1</li>')
            .replace(/\n/g, '<br>');
          streamingRef.current.contentElement.innerHTML = formattedContent;
        }
        // Auto-scroll to bottom
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      };

      // Stream AI response
      await deepSeekService.streamChat(contextMessages, {
        onThinking: (thinking) => {
          if (streamingRef.current?.isTyping) {
            streamingRef.current.thinking += thinking;
            updateStreamingDisplay();
          }
        },
        onContent: (content) => {
          if (streamingRef.current?.isTyping) {
            streamingRef.current.content += content;
            updateStreamingDisplay();
          }
        },
        onComplete: async (finalContent) => {
          // Mark as not typing and hide streaming UI
          if (streamingRef.current) {
            streamingRef.current.isTyping = false;
            const container = streamingRef.current.streamingContainer;
            if (container) {
              container.style.display = 'none';
            }
          }

          // Create AI message
          const aiMessage: Message = {
            id: uuidv4(),
            content: finalContent,
            timestamp: new Date(),
            sender: 'ai',
            thinking: streamingRef.current?.thinking || undefined
          };

          // Update conversation with AI response
          const finalConversation = {
            ...conversationWithUserMessage,
            messages: [...conversationWithUserMessage.messages, aiMessage],
            updatedAt: new Date()
          };

          setCurrentConversation(finalConversation);
          setConversations(prev => 
            isGuest ? [finalConversation] : prev.map(c => c.id === finalConversation.id ? finalConversation : c)
          );

          // Save to backend if not guest
          if (!isGuest) {
            if (ws.socket?.connected) {
              ws.socket.emit('save_conversation', {
                conversationId: finalConversation.id,
                messages: finalConversation.messages
              });
            } else {
              // Fallback: save via REST API
              const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
              fetch(`${apiUrl}/save-messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  conversationId: finalConversation.id,
                  messages: finalConversation.messages
                })
              }).catch(apiError => {
                console.error('Failed to save AI response via API:', apiError);
              });
            }
          } else {
            // For guest users, update the conversations list
            setConversations([finalConversation]);
          }

          console.log('✅ AI response completed for user\'s question after summary');
        },
        onError: (error) => {
          console.error('AI streaming error in summary response:', error);
          if (streamingRef.current) {
            streamingRef.current.isTyping = false;
            const container = streamingRef.current.streamingContainer;
            if (container) {
              container.style.display = 'none';
            }
          }
        }
      });

    } catch (error) {
      console.error('Failed to generate AI response after summary:', error);
    }
  };

  /**
   * Handle starting a new conversation with summary context
   * New Conversation:
   *├── AI: "Here's a summary of our previous discussion: [summary]"
   *├── User: "[user's last question]"
   *└── AI: "[AI's response using summary context]"
   */
  const handleStartNewConversationWithSummary = async (summary: string) => {
    try {
      console.log('🚀 Starting new conversation with summary...');
      
      // Store the question to answer before clearing state
      const questionToAnswer = lastUserQuestion;
      
      // Get the original conversation title for the new conversation
      const originalTitle = currentConversation?.title || 'Discussion';
      const newTitle = `Continued: ${originalTitle}`;
      
      // Clear the warning state first
      setConversationSummary(null);
      setShowContextWarning(false);
      setIsGeneratingSummary(false);
      setLastUserQuestion(null);
      
      // Create a new conversation with summary message directly
      const aiSummaryMessage: Message = {
        id: uuidv4(),
        content: `Here's a summary of our previous discussion: ${summary}`,
        timestamp: new Date(),
        sender: 'ai'
      };

      let newConversation: PrivateConversation;

      if (isGuest) {
        // For guest users, create a temporary conversation
        newConversation = {
          id: `guest-${Date.now()}`,
          userId: 'guest',
          messages: [aiSummaryMessage],
          createdAt: new Date(),
          updatedAt: new Date(),
          title: newTitle
        };
        setCurrentConversation(newConversation);
        setConversations([newConversation]);
      } else {
        // For authenticated users, create via API
        if (!state.currentUser?.id) {
          console.error('No current user for creating conversation');
          return;
        }

        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
        const response = await fetch(`${apiUrl}/new-conversation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: state.currentUser.id,
            title: newTitle
          })
        });
        
        if (response.ok) {
          const createdConversation = await response.json();
          newConversation = {
            ...createdConversation,
            messages: [aiSummaryMessage],
            updatedAt: new Date()
          };

          // Update conversations list
          setConversations(prev => [newConversation, ...prev].sort((a, b) => 
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          ));
          setCurrentConversation(newConversation);

          // Save the summary message to backend
          if (ws.socket?.connected) {
            console.log('💾 Saving summary message to backend via WebSocket');
            ws.socket.emit('save_conversation', {
              conversationId: newConversation.id,
              messages: [aiSummaryMessage]
            });
          } else {
            // Fallback: save via REST API
            fetch(`${apiUrl}/save-messages`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                conversationId: newConversation.id,
                messages: [aiSummaryMessage]
              })
            }).catch(apiError => {
              console.error('Failed to save summary message via API:', apiError);
            });
          }
        } else {
          console.error('Failed to create new conversation');
          return;
        }
      }
      
      console.log('✅ Successfully started new conversation with summary');
      
      // If we have a stored question, automatically answer it
      if (questionToAnswer) {
        console.log('🤖 Auto-answering user\'s last question after summary');
        
        // Small delay to ensure conversation is fully set in UI
        setTimeout(() => {
          handleAIResponse(newConversation, questionToAnswer, summary);
        }, 300);
      }
      
    } catch (error) {
      console.error('Failed to start new conversation with summary:', error);
      // Clear warning state even on error
      setShowContextWarning(false);
      setIsGeneratingSummary(false);
    }
  };
  return (
    <div className="flex w-full h-screen bg-gray-50">
      {/* Mobile Header - Only show when sidebar is closed */}
      {isMobile && currentConversation && !isSidebarOpen && (
        <div className="fixed top-0 left-0 right-0 bg-white border-b z-30 px-4 py-3 flex items-center">
          <button
            onClick={toggleSidebar}
            className="p-2 hover:bg-gray-100 rounded-lg mr-3"
            aria-label="Toggle conversations"
          >
            <Menu className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="text-lg font-semibold text-gray-800 truncate flex-1 min-w-0">
            {currentConversation.title || 'Private Conversation'}
          </h1>
          
          {/* Mobile Publish Button */}
          <button
            onClick={handleMakePublic}
            disabled={currentConversation.messages.length === 0 || isGuest}
            className="ml-2 p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <Globe className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-700">
              {isGuest ? 'Sign In' : 'Publish'}
            </span>
          </button>
        </div>
      )}

      {/* Sidebar Backdrop (Mobile) */}
      {isSidebarOpen && isMobile && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Left Sidebar - Conversations List */}
      <ConversationSidebar
        conversations={conversations}
        currentConversationId={currentConversation?.id || null}
        currentUser={state.currentUser}
        isGuest={isGuest}
        isOpen={isSidebarOpen}
        isMobile={isMobile}
        onSelectConversation={setCurrentConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onGoToForum={handleGoToForum}
        onLogout={onLogout}
        onSignIn={handleSignIn}
        onClose={closeSidebar}
        onGoToUserCenter={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'user-center' })}
        onGoToAccount={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'account' })}
      />

      {/* Main Chat Area */}
      <main className={`flex-1 flex flex-col ${isMobile && currentConversation && !isSidebarOpen ? 'pt-14' : ''}`}>
        {/* Context Warning Banner */}
        {showContextWarning && (
          <ConversationContextWarning
            summary={conversationSummary}
            onStartNewConversationWithSummary={handleStartNewConversationWithSummary}
            onDismiss={() => setShowContextWarning(false)}
            isGeneratingSummary={isGeneratingSummary}
          />
        )}
        
        {currentConversation ? (
          <>
            {/* Chat Header - Hidden on mobile since we show buttons in mobile header */}
            <div className="hidden md:block">
              <ChatHeader
                conversationTitle={currentConversation.title || 'Private Conversation'}
                showThinking={showThinking}
                canPublish={currentConversation.messages.length > 0}
                isGuest={isGuest}
                onToggleThinking={() => setShowThinking(!showThinking)}
                onMakePublic={handleMakePublic}
              />
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {currentConversation.messages.map((message, index) => (
                <ChatMessageDisplay
                  key={message.id}
                  message={message}
                  currentUser={state.currentUser}
                  showThinking={showThinking}
                />
              ))}

              {/* Streaming AI Response - Always present, controlled via DOM */}
              <div 
                ref={(el) => { streamingRef.current.streamingContainer = el; }}
                className="flex justify-start px-4"
                style={{ display: 'none' }}
              >
                <div className="flex items-start space-x-3 max-w-[70%]">
                  <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-lg">🍃</span>
                  </div>
                  
                  <div className="space-y-2 flex-1">
                    {/* Thinking Process */}
                    {showThinking && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center mb-2">
                          <div className="w-4 h-4 text-gray-500 mr-2">🧠</div>
                          <span className="text-xs font-medium text-gray-600">
                            Thought Process
                          </span>
                          <div className="ml-2">
                            <div className="flex space-x-1">
                              <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                              <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                              <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                            </div>
                          </div>
                        </div>
                        <div className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-100 p-2 rounded text-xs">
                          <div 
                            ref={(el) => { streamingRef.current.thinkingElement = el; }}
                            className="min-h-[1em]"
                          />
                          <span className="animate-pulse text-green-500">▋</span>
                        </div>
                      </div>
                    )}

                    {/* Main Response */}
                    <div className="bg-white border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center mb-2">
                        <span className="text-xs font-medium text-gray-600">Response</span>
                        <div className="ml-2">
                          <div className="flex space-x-1">
                            <div className="w-1 h-1 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-1 h-1 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-1 h-1 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                          </div>
                        </div>
                      </div>
                      <div className="text-sm">
                        <div 
                          ref={(el) => { streamingRef.current.contentElement = el; }}
                          className="min-h-[1em] text-gray-800 prose prose-sm max-w-none"
                        />
                        <span className="animate-pulse text-green-500">▋</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Scroll anchor */}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <MessageInput
              value={newMessage}
              onChange={setNewMessage}
              onSend={handleSendMessage}
              isDisabled={streamingRef.current.isTyping}
            />
          </>
        ) : (
          <NoConversationSelected
            isGuest={isGuest}
            onStartChat={handleNewConversation}
          />
        )}
      </main>

      {/* Publish Modal */}
      <PublishConversationModal
        isOpen={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        onPublish={handlePublishConversation}
        defaultTitle={currentConversation?.title || "Relationship advice discussion"}
      />

      {/* Floating Action Button - Mobile Only */}
      {!currentConversation && (
        <FloatingActionButton
          onClick={handleNewConversation}
          icon={<Menu className="w-6 h-6" />}
          label="Chat"
        />
      )}
    </div>
  );
};