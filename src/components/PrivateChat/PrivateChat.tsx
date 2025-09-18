import React, { useState, useEffect, useRef } from 'react';
import { Send, Plus, Share2, X, Loader2 } from 'lucide-react';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useAppContext } from '../../context/AppContext';
import { StreamingMessage } from './StreamingMessage';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  thinking?: string;
}

interface Conversation {
  id: string;
  title?: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  messages: Message[];
}

export const PrivateChat: React.FC = () => {
  const { user, setCurrentView } = useAppContext();
  const { socket } = useWebSocket();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishTitle, setPublishTitle] = useState('');
  const [publishCategory, setPublishCategory] = useState('general');
  const [isPublishing, setIsPublishing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentConversation?.messages]);

  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user]);

  const loadConversations = async () => {
    if (!user) return;
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/user-conversations/${user.id}`);
      if (response.ok) {
        const data = await response.json();
        const sortedConversations = data.sort((a: Conversation, b: Conversation) => 
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        setConversations(sortedConversations);
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/messages/${conversationId}`);
      if (response.ok) {
        const messages = await response.json();
        return messages;
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
    return [];
  };

  const selectConversation = async (conversation: Conversation) => {
    if (currentConversation?.id === conversation.id) {
      // Force refresh if clicking the same conversation
      setCurrentConversation(null);
      setTimeout(async () => {
        const messages = await loadMessages(conversation.id);
        setCurrentConversation({
          ...conversation,
          messages: messages || []
        });
      }, 50);
    } else {
      const messages = await loadMessages(conversation.id);
      setCurrentConversation({
        ...conversation,
        messages: messages || []
      });
    }
  };

  const createNewConversation = async () => {
    if (!user) return;

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/new-conversation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          title: null
        }),
      });

      if (response.ok) {
        const newConversation = await response.json();
        const updatedConversations = [newConversation, ...conversations].sort((a, b) => 
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        setConversations(updatedConversations);
        setCurrentConversation(newConversation);
      }
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const generateTitle = async (userMessage: string): Promise<string> => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/generate-title`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userMessage }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.title;
      }
    } catch (error) {
      console.error('Failed to generate title:', error);
    }
    
    // Fallback: use first few words
    return userMessage.split(' ').slice(0, 6).join(' ');
  };

  const updateConversationTitle = async (conversationId: string, title: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/conversations/${conversationId}/title`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title }),
      });

      if (response.ok) {
        // Update local state
        setConversations(prev => prev.map(conv => 
          conv.id === conversationId ? { ...conv, title } : conv
        ));
        
        if (currentConversation?.id === conversationId) {
          setCurrentConversation(prev => prev ? { ...prev, title } : null);
        }
      }
    } catch (error) {
      console.error('Failed to update title:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || !currentConversation || !user || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      content: inputMessage.trim(),
      sender: 'user',
      timestamp: new Date()
    };

    // Add user message immediately
    setCurrentConversation(prev => prev ? {
      ...prev,
      messages: [...prev.messages, userMessage]
    } : null);

    const currentInput = inputMessage.trim();
    setInputMessage('');
    setIsLoading(true);

    try {
      // Generate title if this is the first message
      if (currentConversation.messages.length === 0) {
        const title = await generateTitle(currentInput);
        await updateConversationTitle(currentConversation.id, title);
      }

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: currentInput,
          conversationId: currentConversation.id,
          userId: user.id
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response stream');
      }

      let aiMessage: Message = {
        id: `ai-${Date.now()}`,
        content: '',
        sender: 'ai',
        timestamp: new Date(),
        thinking: ''
      };

      // Add AI message placeholder
      setCurrentConversation(prev => prev ? {
        ...prev,
        messages: [...prev.messages, aiMessage]
      } : null);

      let isThinking = true;
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        buffer += chunk;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              
              if (parsed.type === 'thinking') {
                aiMessage.thinking = (aiMessage.thinking || '') + parsed.content;
              } else if (parsed.type === 'content') {
                if (isThinking) {
                  isThinking = false;
                }
                aiMessage.content += parsed.content;
              }

              // Update the message in state
              setCurrentConversation(prev => prev ? {
                ...prev,
                messages: prev.messages.map(msg => 
                  msg.id === aiMessage.id ? { ...aiMessage } : msg
                )
              } : null);
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }

      // Save the complete conversation
      if (socket) {
        const allMessages = [...currentConversation.messages, userMessage, aiMessage];
        socket.emit('save_conversation', {
          conversationId: currentConversation.id,
          messages: allMessages
        });
      }

    } catch (error) {
      console.error('Error sending message:', error);
      // Remove the user message on error
      setCurrentConversation(prev => prev ? {
        ...prev,
        messages: prev.messages.slice(0, -1)
      } : null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handlePublishThread = async () => {
    if (!currentConversation || !user || !publishTitle.trim()) return;

    setIsPublishing(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/publish-thread`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: currentConversation.id,
          title: publishTitle.trim(),
          category: publishCategory,
          userId: user.id,
          messages: currentConversation.messages
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Thread published successfully:', result);
        setShowPublishModal(false);
        setPublishTitle('');
        setPublishCategory('general');
        // Navigate to forum
        setCurrentView('forum');
      } else {
        throw new Error('Failed to publish thread');
      }
    } catch (error) {
      console.error('Error publishing thread:', error);
      alert('Failed to publish thread. Please try again.');
    } finally {
      setIsPublishing(false);
    }
  };

  const openPublishModal = () => {
    setPublishTitle(currentConversation?.title || '');
    setShowPublishModal(true);
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Please log in to access private chat.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-gray-50">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <button
            onClick={createNewConversation}
            className="w-full flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Conversation
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              onClick={() => selectConversation(conversation)}
              className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                currentConversation?.id === conversation.id ? 'bg-blue-50 border-blue-200' : ''
              }`}
            >
              <div className="font-medium text-gray-900 truncate">
                {conversation.title || 'New Conversation'}
              </div>
              <div className="text-sm text-gray-500 mt-1">
                {new Date(conversation.updatedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {currentConversation ? (
          <>
            {/* Header */}
            <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {currentConversation.title || 'New Conversation'}
              </h2>
              {currentConversation.messages.length > 0 && (
                <button
                  onClick={openPublishModal}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Share2 className="w-4 h-4" />
                  Publish Thread
                </button>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {currentConversation.messages.map((message) => (
                <div key={message.id}>
                  {message.sender === 'ai' ? (
                    <StreamingMessage
                      content={message.content}
                      thinking={message.thinking}
                      isComplete={true}
                    />
                  ) : (
                    <div className="flex justify-end">
                      <div className="max-w-3xl bg-blue-600 text-white rounded-lg px-4 py-2">
                        <div className="whitespace-pre-wrap">{message.content}</div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="bg-white border-t border-gray-200 p-4">
              <div className="flex gap-2">
                <textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message..."
                  className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={1}
                  disabled={isLoading}
                />
                <button
                  onClick={sendMessage}
                  disabled={!inputMessage.trim() || isLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Welcome to Private Chat
              </h3>
              <p className="text-gray-500 mb-4">
                Select a conversation or create a new one to get started.
              </p>
              <button
                onClick={createNewConversation}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors mx-auto"
              >
                <Plus className="w-4 h-4" />
                Start New Conversation
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Publish Modal */}
      {showPublishModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Publish as Thread</h3>
              <button
                onClick={() => setShowPublishModal(false)}
                className="text-gray-400 hover:text-gray-600"
                disabled={isPublishing}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Thread Title
                </label>
                <input
                  type="text"
                  value={publishTitle}
                  onChange={(e) => setPublishTitle(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter thread title..."
                  disabled={isPublishing}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  value={publishCategory}
                  onChange={(e) => setPublishCategory(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isPublishing}
                >
                  <option value="general">General</option>
                  <option value="technology">Technology</option>
                  <option value="science">Science</option>
                  <option value="business">Business</option>
                  <option value="education">Education</option>
                </select>
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  onClick={() => setShowPublishModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={isPublishing}
                >
                  Cancel
                </button>
                <button
                  onClick={handlePublishThread}
                  disabled={!publishTitle.trim() || isPublishing}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {isPublishing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Publishing...
                    </>
                  ) : (
                    'Publish Thread'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};