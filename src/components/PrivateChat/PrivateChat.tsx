import React, { useState, useEffect, useRef } from 'react';
import { Send, Lock, Globe, MessageSquare, X, Settings, Brain, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { StreamingMessage } from './StreamingMessage';
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
  const [conversations, setConversations] = useState<PrivateConversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<PrivateConversation | null>(
    null
  );
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showThinking, setShowThinking] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Use refs for streaming to avoid filesystem pressure
  const streamingRef = useRef<{
    thinking: string;
    content: string;
    isActive: boolean;
    thinkingElement: HTMLDivElement | null;
    contentElement: HTMLDivElement | null;
  }>({
    thinking: '',
    content: '',
    isActive: false,
    thinkingElement: null,
    contentElement: null
  });
  
  const [isStreaming, setIsStreaming] = useState(false);

  // Initialize WebSocket connection for persistence only
  const ws = useWebSocket(state.currentUser?.id || '');

  // Load conversations from backend on component mount
  useEffect(() => {
    const loadConversations = async () => {
      if (!state.currentUser?.id) return;
      
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
        const response = await fetch(`${apiUrl}/conversations/${state.currentUser.id}`);
        
        if (response.ok) {
          const loadedConversations = await response.json();
          setConversations(loadedConversations);
          
          // Set first conversation as current if none selected
          if (loadedConversations.length > 0 && !currentConversation) {
            setCurrentConversation(loadedConversations[0]);
          }
        }
      } catch (error) {
        console.error('Failed to load conversations:', error);
      }
    };

    loadConversations();
  }, [state.currentUser?.id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cleanup any pending operations
    };
  }, []);

  // Load messages for current conversation
  useEffect(() => {
    const loadMessages = async () => {
      if (!currentConversation?.id) return;
      
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
        const response = await fetch(`${apiUrl}/conversations/${currentConversation.id}/messages`);
        
        if (response.ok) {
          const messages = await response.json();
          setCurrentConversation(prev => prev ? {
            ...prev,
            messages
          } : null);
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
      }
    };

    loadMessages();
  }, [currentConversation?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentConversation?.messages, streamingMessage]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !currentConversation) return;

    const userMessage: Message = {
      id: uuidv4(),
      content: newMessage.trim(),
      timestamp: new Date(),
      sender: 'user'
    };

    // Add user message to conversation immediately
    const updatedConversation = {
      ...currentConversation,
      messages: [...currentConversation.messages, userMessage],
      updatedAt: new Date()
    };
    setCurrentConversation(updatedConversation);
    setConversations(prev => 
      prev.map(c => c.id === updatedConversation.id ? updatedConversation : c)
    );

    setNewMessage('');
    setIsTyping(true);
    setIsStreaming(true);
    
    // Reset streaming refs
    streamingRef.current = {
      thinking: '',
      content: '',
      isActive: true,
      thinkingElement: null,
      contentElement: null
    };

    try {
      // Prepare conversation history for AI
      const chatMessages: ChatMessage[] = updatedConversation.messages.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));

      // Direct DOM manipulation for streaming display
      const updateStreamingDisplay = () => {
        if (streamingRef.current.thinkingElement) {
          streamingRef.current.thinkingElement.textContent = streamingRef.current.thinking;
        }
        if (streamingRef.current.contentElement) {
          streamingRef.current.contentElement.textContent = streamingRef.current.content;
        }
        // Auto-scroll
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      };

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
            streamingRef.current.content += content;
            updateStreamingDisplay();
          }
        },
        onComplete: (fullContent) => {
          // Mark streaming as inactive
          streamingRef.current.isActive = false;
          
          const aiMessage: Message = {
            id: uuidv4(),
            content: fullContent,
            timestamp: new Date(),
            sender: 'ai',
            thinking: streamingRef.current.thinking
          };

          // Add AI message to conversation
          const finalConversation = {
            ...updatedConversation,
            messages: [...updatedConversation.messages, aiMessage],
            updatedAt: new Date()
          };
          
          setCurrentConversation(finalConversation);
          setConversations(prev => 
            prev.map(c => c.id === finalConversation.id ? finalConversation : c)
          );

          // Clear streaming state - single state update
          setIsStreaming(false);
          setIsTyping(false);

          // Send both messages to backend for persistence
          if (ws.socket?.connected) {
            ws.socket.emit('save_conversation', {
              conversationId: currentConversation.id,
              messages: [userMessage, aiMessage]
            });
          }
        },
        onError: (error) => {
          console.error('AI streaming error:', error);
          streamingRef.current.isActive = false;
          setIsStreaming(false);
          setIsTyping(false);
          
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
      setIsTyping(false);
      setStreamingMessage(null);
    }
  };

  const handleNewConversation = async () => {
    if (!state.currentUser?.id) return;
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
      const response = await fetch(`${apiUrl}/conversations`, {
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
        setConversations(prev => [newConversation, ...prev]);
        setCurrentConversation(newConversation);
      }
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };


  const handleMakePublic = () => {
    setShowPublishModal(true);
  };

  const handlePublish = () => {
    if (currentConversation) {
      // Create public thread from private conversation
      console.log('Publishing conversation:', currentConversation);
      setShowPublishModal(false);
      dispatch({ type: 'SET_VIEW_MODE', payload: 'forum' });
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
            </h2>
            <Button
              onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'forum' })}
              variant="ghost"
              size="sm"
              title="Go to Forum"
            >
              <Globe className="w-4 h-4" />
            </Button>
            <Button
              onClick={onLogout}
              variant="ghost"
              size="sm"
              title="Sign Out"
              className="text-gray-500 hover:text-gray-700"
            >
              Sign Out
            </Button>
          </div>
          <Button onClick={handleNewConversation} className="w-full">
            <MessageSquare className="w-4 h-4 mr-2" />
            New Conversation
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
                currentConversation?.id === conversation.id ? 'bg-blue-50 border-blue-200' : ''
              }`}
              onClick={() => setCurrentConversation(conversation)}
            >
              <div className="font-medium text-gray-800 mb-1">
                {conversation.title || 'New Conversation'}
              </div>
              <div className="text-sm text-gray-500 truncate">
                {conversation.messages.length > 0 
                  ? conversation.messages[conversation.messages.length - 1].content
                  : 'No messages yet'
                }
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {formatDistanceToNow(conversation.updatedAt)} ago
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
                  disabled={currentConversation.messages.length === 0}
                >
                  <Globe className="w-4 h-4" />
                  Make Public
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

              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="bg-white border-t p-4">
              <div className="flex space-x-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Ask DeepSeek anything..."
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  className="flex-1"
                  disabled={isTyping}
                />
                <Button onClick={handleSendMessage} disabled={!newMessage.trim() || isTyping}>
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
              <p className="text-gray-500 mb-4">Start a new conversation to begin chatting with AI</p>
              <Button onClick={handleNewConversation}>
                Start Chatting with DeepSeek
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