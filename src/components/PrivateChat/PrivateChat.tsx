import React, { useState, useEffect, useRef } from 'react';
import { Send, Lock, Globe, MessageSquare, X, Settings, Brain, Loader2, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Card, CardContent } from '../ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Message, PrivateConversation } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { usePrivateChat, useWebSocket } from '../../hooks/useWebSocket';
import { deepSeekService, ChatMessage } from '../../services/deepseek';
import { formatDistanceToNow } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

interface PrivateChatProps {
  onLogout: () => void;
}

export const PrivateChat: React.FC<PrivateChatProps> = ({ onLogout }) => {
  const { state, dispatch } = useAppContext();
  const isGuest = state.isGuestMode && !state.isAuthenticated;
  const [conversations, setConversations] = useState<PrivateConversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<PrivateConversation | null>(
    null
  );
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showThinking, setShowThinking] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isProcessingRef = useRef(false);
  
  // Use refs for streaming to completely avoid state updates
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cleanup any pending operations
    };
  }, []);

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
  }, [currentConversation?.id, isGuest]); // Keep dependency on ID only

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !currentConversation) return;

    // CRITICAL: Check if already processing to prevent double execution
    if (isProcessingRef.current) {
      console.log('⚠️ Already processing a message, ignoring new request');
      return;
    }

    // Prevent multiple simultaneous requests - ENHANCED CHECK
    if (isProcessingRef.current) {
      console.log('⚠️ Already processing a message, ignoring new request. Current state:', isProcessingRef.current);
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
          streamingRef.current.contentElement.textContent = streamingRef.current.content;
        }
        // Auto-scroll
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      };

      console.log('🤖 Starting AI stream...');
      
      // Stream AI response using DeepSeek service
      await deepSeekService.streamChat(chatMessages, {
        onThinking: (thinking) => {
          console.log('🧠 Received thinking chunk:', thinking.length, 'chars');
          if (streamingRef.current.isActive) {
            streamingRef.current.thinking += thinking;
            updateStreamingDisplay();
          }
        },
        onContent: (content) => {
          console.log('📝 Received content chunk:', content.length, 'chars');
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

  const handleMakePublic = () => {
    // Redirect guest users to login
    if (isGuest) {
      dispatch({ type: 'SET_GUEST_MODE', payload: false });
      return;
    }
    
    setShowPublishModal(true);
  };

  const handlePublish = () => {
    if (currentConversation) {
      handlePublishConversation();
    }
  };

  const handlePublishConversation = async () => {
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
        title: currentConversation.title || userMessages[0].content.substring(0, 100) + '...',
        creatorId: state.currentUser.id,
        category: 'General',
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

  return (
    <div className="flex w-full h-screen bg-gray-50">
      {/* Left Sidebar - Conversations List */}
      <aside className="w-80 h-full bg-white border-r flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center">
              <Lock className="w-5 h-5 mr-2" />
              Private Chat
              {isGuest && (
                <span className="ml-2 px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                  Guest Mode
                </span>
              )}
            </h2>
            <Button
              onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'forum' })}
              variant="ghost"
              size="sm"
              title="Go to Forum"
            >
              <Globe className="w-4 h-4" />
            </Button>
            {!isGuest && (
            <Button
              onClick={onLogout}
              variant="ghost"
              size="sm"
              title="Sign Out"
              className="text-gray-500 hover:text-gray-700"
            >
              Sign Out
            </Button>
            )}
            {isGuest && (
              <Button
                onClick={() => dispatch({ type: 'SET_GUEST_MODE', payload: false })}
                variant="ghost"
                size="sm"
                title="Sign In"
                className="text-gray-500 hover:text-gray-700"
              >
                Sign In
              </Button>
            )}
          </div>
          <Button onClick={handleNewConversation} className="w-full">
            <MessageSquare className="w-4 h-4 mr-2" />
            New Conversation
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isGuest && (
            <div className="p-4 bg-yellow-50 border-b border-yellow-200">
              <p className="text-sm text-yellow-800">
                <strong>Guest Mode:</strong> Your conversations won't be saved. Sign in to keep your chat history.
              </p>
            </div>
          )}
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`p-4 border-b cursor-pointer hover:bg-gray-50 group relative ${
                currentConversation?.id === conversation.id ? 'bg-blue-50 border-blue-200' : ''
              }`}
              onClick={() => {
                // Always set the conversation, even if it's the same one
                // This ensures the UI refreshes properly
                if (currentConversation?.id !== conversation.id) {
                  setCurrentConversation(conversation);
                } else {
                  // If clicking the same conversation, force a refresh
                  setCurrentConversation(null);
                  setTimeout(() => setCurrentConversation(conversation), 0);
                }
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800 mb-1 truncate">
                    {conversation.title || 'New Conversation'}
                  </div>
                  <div className="text-xs text-gray-400">
                    {formatDistanceToNow(conversation.updatedAt)} ago
                  </div>
                </div>
                {!isGuest && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50"
                  onClick={(e) => handleDeleteConversation(conversation.id, e)}
                  title="Delete conversation"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col">
        {currentConversation ? (
          <>
            {/* Chat Header */}
            <header className="bg-white border-b p-4 flex items-center justify-between">
              <div className="flex items-center">
                <Lock className="w-5 h-5 mr-2 text-gray-500" />
                <h3 className="text-lg font-medium text-gray-800">
                  {currentConversation.title || 'Private Conversation'}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setShowThinking(!showThinking)}
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-2"
                  title={showThinking ? 'Hide AI thinking' : 'Show AI thinking'}
                >
                  <Settings className="w-4 h-4" />
                  {showThinking ? 'Hide Thinking' : 'Show Thinking'}
                </Button>
                <Button
                  onClick={handleMakePublic}
                  variant="outline"
                  className="flex items-center gap-2"
                  disabled={currentConversation.messages.length === 0 || isGuest}
                >
                  <Globe className="w-4 h-4" />
                  {isGuest ? 'Sign In to Publish' : 'Make Public'}
                </Button>
              </div>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {currentConversation.messages.map((message, index) => (
                <div
                  key={message.id}
                  className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex items-start space-x-3 max-w-[70%] ${
                    message.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                  }`}>
                    <Avatar className="w-8 h-8">
                      {message.sender === 'ai' ? (
                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs font-bold">AI</span>
                        </div>
                      ) : (
                        <>
                          <AvatarImage src={state.currentUser?.avatar} />
                          <AvatarFallback>{state.currentUser?.name?.charAt(0)}</AvatarFallback>
                        </>
                      )}
                    </Avatar>
                    <div className="space-y-2 flex-1">
                      {/* Show thinking process for AI messages */}
                      {message.sender === 'ai' && showThinking && message.thinking && (
                        <Card className="bg-gray-50 border-gray-200">
                          <CardContent className="p-3">
                            <div className="flex items-center mb-2">
                              <Brain className="w-4 h-4 text-gray-500 mr-2" />
                              <span className="text-xs font-medium text-gray-600">
                                Thought Process
                              </span>
                            </div>
                            <div className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-100 p-2 rounded text-xs">
                              {message.thinking}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                      
                      {/* Main message content */}
                      <Card className={`${
                        message.sender === 'user' 
                          ? 'bg-blue-500 text-white' 
                          : 'bg-white border-gray-200'
                      }`}>
                        <CardContent className="p-3">
                          <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                          <div className={`text-xs mt-2 ${
                            message.sender === 'user' ? 'text-blue-100' : 'text-gray-500'
                          }`}>
                            {formatDistanceToNow(message.timestamp)} ago
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </div>
              ))}

              {/* Streaming AI Response - Direct DOM manipulation */}
              {isStreaming && (
                <div className="flex justify-start">
                  <div className="flex items-start space-x-3 max-w-[70%]">
                    <Avatar className="w-8 h-8 flex-shrink-0">
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-bold">AI</span>
                      </div>
                    </Avatar>
                    
                    <div className="space-y-2 flex-1">
                      {/* Thinking Process */}
                      {showThinking && (
                        <Card className="bg-gray-50 border-gray-200">
                          <CardContent className="p-3">
                            <div className="flex items-center mb-2">
                              <Brain className="w-4 h-4 text-gray-500 mr-2" />
                              <span className="text-xs font-medium text-gray-600">
                                Thought Process
                              </span>
                              <Loader2 className="w-3 h-3 text-gray-400 ml-2 animate-spin" />
                            </div>
                            <div className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-100 p-2 rounded text-xs">
                              <div 
                                ref={(el) => { streamingRef.current.thinkingElement = el; }}
                                className="min-h-[1em]"
                              />
                              <span className="animate-pulse">|</span>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Main Response */}
                      <Card className="bg-white border-gray-200">
                        <CardContent className="p-3">
                          <div className="text-sm whitespace-pre-wrap">
                            <div 
                              ref={(el) => { streamingRef.current.contentElement = el; }}
                              className="min-h-[1em]"
                            />
                            <span className="animate-pulse">|</span>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </div>
              )}

            {/* Streaming AI Response - Always present, controlled via DOM */}
            <div 
              ref={(el) => { streamingRef.current.streamingContainer = el; }}
              className="flex justify-start px-4"
              style={{ display: 'none' }}
            >
              <div className="flex items-start space-x-3 max-w-[70%]">
                <Avatar className="w-8 h-8 flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs font-bold">AI</span>
                  </div>
                </Avatar>
                
                <div className="space-y-2 flex-1">
                  {/* Thinking Process */}
                  {showThinking && (
                    <Card className="bg-gray-50 border-gray-200">
                      <CardContent className="p-3">
                        <div className="flex items-center mb-2">
                          <Brain className="w-4 h-4 text-gray-500 mr-2" />
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
                          <span className="animate-pulse text-blue-500">▋</span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Main Response */}
                  <Card className="bg-white border-gray-200">
                    <CardContent className="p-3">
                      <div className="flex items-center mb-2">
                        <span className="text-xs font-medium text-gray-600">Response</span>
                        <div className="ml-2">
                          <div className="flex space-x-1">
                            <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                          </div>
                        </div>
                      </div>
                      <div className="text-sm whitespace-pre-wrap">
                        <div 
                          ref={(el) => { streamingRef.current.contentElement = el; }}
                          className="min-h-[1em] text-gray-800"
                        />
                        <span className="animate-pulse text-blue-500">▋</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
            <div ref={messagesEndRef} />

            {/* Message Input */}
            <div className="bg-white border-t p-4">
              <div className="flex space-x-2">
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Ask DeepSeek anything..."
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  className="flex-1 min-h-[40px] max-h-[120px] resize-none"
                  rows={1}
                  style={{
                    height: 'auto',
                    minHeight: '40px',
                    maxHeight: '120px'
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = Math.min(target.scrollHeight, 120) + 'px';
                  }}
                  disabled={streamingRef.current.isTyping}
                />
                <Button onClick={handleSendMessage} disabled={!newMessage.trim() || streamingRef.current.isTyping}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-800 mb-2">No conversation selected</h3>
              <p className="text-gray-500 mb-4">
                {isGuest 
                  ? 'Start chatting with DeepSeek AI (conversations won\'t be saved in guest mode)'
                  : 'Start a new conversation to begin chatting with AI'
                }
              </p>
              <Button onClick={handleNewConversation}>
                {isGuest ? 'Start Guest Chat' : 'Start Chatting with DeepSeek'}
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Publish Modal */}
      {showPublishModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg mx-4 bg-white">
            <CardContent className="p-0">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b">
                <h3 className="text-xl font-semibold text-gray-900">Publish to Community</h3>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowPublishModal(false)}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                <div>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Share this conversation with the community to get diverse perspectives and additional insights from other users.
                  </p>
                </div>

                {/* Thread Title */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Thread Title
                  </label>
                  <Input
                    placeholder="Give your thread a descriptive title..."
                    defaultValue={currentConversation?.title || "Relationship advice discussion"}
                    className="w-full"
                  />
                </div>

                {/* Category Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Category
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    <option value="relationships">Relationships</option>
                    <option value="psychology">Psychology</option>
                    <option value="marriage">Marriage</option>
                    <option value="friendship">Friendship</option>
                    <option value="intimacy">Intimacy</option>
                  </select>
                </div>

                {/* Privacy Notice */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <Globe className="h-5 w-5 text-blue-600 mt-0.5" />
                    </div>
                    <div className="text-sm">
                      <p className="text-blue-800 font-medium mb-1">
                        This will be public
                      </p>
                      <p className="text-blue-700">
                        Your conversation will be visible to all community members. Others can add answers and engage in discussions.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end space-x-3 p-6 border-t bg-gray-50">
                <Button 
                  onClick={() => setShowPublishModal(false)} 
                  variant="outline"
                  className="px-4 py-2"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handlePublish} 
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Publish Thread
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};