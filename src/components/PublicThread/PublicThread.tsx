import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '../ui/button';
import { Thread, Question, Answer, Comment, User } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { usePublicThread } from '../../hooks/useWebSocket';
import { deepSeekService, ChatMessage } from '../../services/deepseek';
import { v4 as uuidv4 } from 'uuid';
import { countChatMessagesTokens } from '../../utils/tokenCounter';
import { CONTEXT_OVERFLOW_THRESHOLD } from '../../constants/ai';
import { PublicThreadHeader } from './PublicThreadHeader';
import { QuestionSection } from './QuestionSection';
import { NewQuestionInput } from './NewQuestionInput';
import { CommentPanel } from './CommentPanel';

interface PublicThreadProps {
  onLogout: () => void;
}

export const PublicThread: React.FC<PublicThreadProps> = ({ onLogout }) => {
  const { state, dispatch } = useAppContext();
  const isGuest = state.isGuestMode && !state.isAuthenticated;
  const [thread, setThread] = useState<Thread | null>(null);
  const [answers, setAnswers] = useState<{ [questionId: string]: Answer[] }>({});
  const [comments, setComments] = useState<{ [answerId: string]: Comment[] }>({});
  const [users, setUsers] = useState<{ [userId: string]: User }>({});
  const [newQuestion, setNewQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [commentPanelOpen, setCommentPanelOpen] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // AI streaming state management using refs (like PrivateChat)
  const [isAIAnswering, setIsAIAnswering] = useState<{ [questionId: string]: boolean }>({});
  const streamingRefs = React.useRef<{ [questionId: string]: {
    thinking: string;
    content: string;
    isActive: boolean;
    thinkingElement: HTMLDivElement | null;
    contentElement: HTMLDivElement | null;
    streamingContainer: HTMLDivElement | null;
  } }>({});

  // Function to fetch user info by ID
  const fetchUserInfo = async (userId: string): Promise<User | null> => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
      const response = await fetch(`${apiUrl}/users/${userId}`);
      if (response.ok) {
        const userData = await response.json();
        return userData;
      }
    } catch (error) {
      console.error('Failed to fetch user info:', error);
    }
    return null;
  };

  // Get current thread ID from state
  const currentThreadId = state.currentThreadId;

  // Build context for AI with proper multi-user structure and overflow handling
  const buildThreadContextForAI = async (targetQuestionId: string): Promise<{ messages: ChatMessage[], summaryAdded: boolean }> => {
    if (!thread) return { messages: [], summaryAdded: false };

    let messages: ChatMessage[] = [];
    let summaryAdded = false;


    // Add all questions and their answers in chronological order
    const sortedQuestions = [...thread.questions].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Separate summary questions from regular questions
    const summaryQuestions = sortedQuestions.filter(q => q.isSummary);
    const regularQuestions = sortedQuestions.filter(q => !q.isSummary);

    // Find the latest summary question to determine cutoff point
    let cutoffTimestamp = 0;
    let latestSummary = null;
    
    if (summaryQuestions.length > 0) {
      latestSummary = summaryQuestions[summaryQuestions.length - 1];
      cutoffTimestamp = new Date(latestSummary.timestamp).getTime();
    }

    // System message with summary awareness
    const hasSummaries = summaryQuestions.length > 0;
    messages.push({
      role: 'system',
      content: `You are participating in a public discussion thread where multiple users can ask questions and provide answers. The thread creator can ask multiple questions, and each question can have multiple answers from different users and AI.

Structure:
- Original User asks questions (Question 1, Question 2, etc.)
- Multiple users and AI can provide answers to each question
- You should acknowledge the community context and build upon previous answers when relevant
- Address your response to the community, not just the original questioner
${hasSummaries ? '\nNote: This conversation includes summaries of previous discussions to manage context length. Use the summary information to understand the full context.' : ''}`
    });

    // Add all summary questions as context (these represent condensed previous conversations)
    for (const summaryQuestion of summaryQuestions) {
      messages.push({
        role: 'assistant',
        content: `Previous discussion summary: ${summaryQuestion.content.replace('**Thread Summary**: ', '')}`
      });
    }

    // Add only questions and answers that occurred after the latest summary
    const questionsToInclude = regularQuestions.filter(q => 
      new Date(q.timestamp).getTime() > cutoffTimestamp
    );

    let questionNumber = 1;
    let targetQuestionNumber = 1;

    for (const question of questionsToInclude) {
      // Add the question
      messages.push({
        role: 'user',
        content: `[Question ${questionNumber} from ${thread.creator.name}]: ${question.content}`
      });

      if (question.id === targetQuestionId) {
        targetQuestionNumber = questionNumber;
      }

      // Add all answers for this question
      const questionAnswers = answers[question.id] || [];
      const sortedAnswers = [...questionAnswers].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      for (const answer of sortedAnswers) {
        if (answer.isAI) {
          messages.push({
            role: 'assistant',
            content: answer.content
          });
        } else {
          // For user answers, we need to get user info
          messages.push({
            role: 'user',
            content: `[Answer from User${answer.userId?.slice(-4) || 'Unknown'}]: ${answer.content}`
          });
        }
      }

      questionNumber++;
    }

    // Find the target question content
    const targetQuestion = [...summaryQuestions, ...regularQuestions].find(q => q.id === targetQuestionId);
    if (targetQuestion) {
      messages.push({
        role: 'user',
        content: `Now please provide your answer to Question ${targetQuestionNumber}: "${targetQuestion.content}"`
      });
    }

    // Check for context overflow
    const currentTokenCount = countChatMessagesTokens(messages);
    console.log(`📊 Public thread estimated token count: ${currentTokenCount} / ${CONTEXT_OVERFLOW_THRESHOLD}`);

    if (currentTokenCount > CONTEXT_OVERFLOW_THRESHOLD) {
      console.warn('⚠️ Public thread context overflow detected. Summarizing...');
      
      try {
        // Generate summary of the conversation
        const summary = await deepSeekService.summarizeConversation(messages);
        
        // Create a summary question to replace previous conversations
        const summaryQuestion: Question = {
          id: uuidv4(),
          content: `**Thread Summary**: ${summary}`,
          timestamp: new Date(),
          userId: 'ai-system',
          threadId: thread.id,
          isSummary: true
        };
        
        // Update thread state to include summary question (users won't see the content, just the AI response)
        setThread(prev => prev ? {
          ...prev,
          questions: [summaryQuestion, ...prev.questions],
          questionCount: prev.questionCount + 1
        } : null);
        
        // Persist summary question to backend
        try {
          const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
          await fetch(`${apiUrl}/threads/${thread.id}/questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: summaryQuestion.content,
              userId: summaryQuestion.userId,
              isSummary: true
            })
          });
          console.log('✅ Summary question saved to backend');
        } catch (error) {
          console.error('❌ Failed to save summary question to backend:', error);
        }
        
        // Replace messages with summarized context
        messages = [
          {
            role: 'system',
            content: `You are participating in a public discussion thread where multiple users can ask questions and provide answers. This conversation includes a summary of previous discussions to manage context length. Use the summary information to understand the full context.\n\nPrevious discussion summary: ${summary}`
          },
          {
            role: 'user',
            content: `Based on this summary and the current question, please provide your answer to: "${targetQuestion?.content}"`
          }
        ];
        
        summaryAdded = true;
        console.log('✅ Context summarized and reduced for AI processing');
        
      } catch (error) {
        console.error('❌ Failed to summarize thread context:', error);
        // Continue with original messages if summarization fails
      }
    }

    return { messages, summaryAdded };
  };

  // WebSocket hooks for real-time updates
  const { addAnswer, addComment } = usePublicThread(
    currentThreadId || '',
    (answer: Answer) => {
      setAnswers(prev => ({
        ...prev,
        [answer.questionId]: [...(prev[answer.questionId] || []), answer]
      }));
    },
    (comment: Comment) => {
      setComments(prev => ({
        ...prev,
        [comment.answerId]: [...(prev[comment.answerId] || []), comment]
      }));
    },
    (updatedThread: Thread) => {
      setThread(updatedThread);
    }
  );

  // Load thread data
  useEffect(() => {
    const loadThread = async () => {
      if (!currentThreadId) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
        
        // Load thread details
        const threadResponse = await fetch(`${apiUrl}/threads/${currentThreadId}`);
        if (threadResponse.ok) {
          const threadData = await threadResponse.json();
          setThread(threadData);
        }

        // Load answers for the thread
        const answersResponse = await fetch(`${apiUrl}/threads/${currentThreadId}/answers`);
        let answersData = {};
        if (answersResponse.ok) {
          answersData = await answersResponse.json();
          setAnswers(answersData);
        }

        // Load comments for each answer
        const allAnswers = Object.values(answersData).flat();
        for (const answer of allAnswers) {
          try {
            const commentsResponse = await fetch(`${apiUrl}/answers/${answer.id}/comments`);
            if (commentsResponse.ok) {
              const commentsData = await commentsResponse.json();
              setComments(prev => ({
                ...prev,
                [answer.id]: commentsData
              }));
            }
          } catch (error) {
            console.error('Failed to load comments for answer:', answer.id, error);
          }
        }

        // Collect all unique user IDs from answers and comments
        const userIds = new Set<string>();
        
        // Add user IDs from answers
        Object.values(answersData).flat().forEach((answer: any) => {
          if (answer.userId && !answer.isAI) {
            userIds.add(answer.userId);
          }
        });
        
        // Add user IDs from comments
        Object.values(answersData).flat().forEach(async (answer: any) => {
          try {
            const commentsResponse = await fetch(`${apiUrl}/answers/${answer.id}/comments`);
            if (commentsResponse.ok) {
              const commentsData = await commentsResponse.json();
              commentsData.forEach((comment: any) => {
                if (comment.userId) {
                  userIds.add(comment.userId);
                }
              });
            }
          } catch (error) {
            console.error('Failed to load comments for user collection:', error);
          }
        });
        
        // Fetch user info for all unique user IDs
        const userPromises = Array.from(userIds).map(async (userId) => {
          if (!users[userId] && userId !== state.currentUser?.id && userId !== threadResponse?.creator?.id) {
            const userInfo = await fetchUserInfo(userId);
            return { userId, userInfo };
          }
          return null;
        });
        
        const userResults = await Promise.all(userPromises);
        const newUsers: { [key: string]: User } = {};
        
        userResults.forEach((result) => {
          if (result && result.userInfo) {
            newUsers[result.userId] = result.userInfo;
          }
        });
        
        if (Object.keys(newUsers).length > 0) {
          setUsers(prev => ({ ...prev, ...newUsers }));
        }
      } catch (error) {
        console.error('Failed to load thread:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadThread();
  }, [currentThreadId]);

  // Handle AI answer generation
  const handleAskAI = async (questionId: string) => {
    if (isGuest) return; // Guests can't use AI
    
    // Prevent multiple simultaneous AI requests for the same question
    if (isAIAnswering[questionId]) {
      console.log('⚠️ AI already answering question:', questionId);
      return;
    }
    
    try {
      setIsAIAnswering(prev => ({ ...prev, [questionId]: true }));
      
      // Initialize streaming refs for this question
      streamingRefs.current[questionId] = {
        thinking: '',
        content: '',
        isActive: true,
        thinkingElement: null,
        contentElement: null,
        streamingContainer: null,
      };

      // Build context for this specific question
      const { messages: contextMessages, summaryAdded } = await buildThreadContextForAI(questionId);
      
      if (summaryAdded) {
        console.log('📝 Using summarized context for AI response');
      }

      // Show streaming UI via DOM manipulation
      const showStreamingUI = (questionId: string) => {
        const container = streamingRefs.current[questionId]?.streamingContainer;
        if (container) {
          container.style.display = 'block';
        }
      };

      const hideStreamingUI = (questionId: string) => {
        const container = streamingRefs.current[questionId]?.streamingContainer;
        if (container) {
          container.style.display = 'none';
        }
      };

      const updateStreamingDisplay = (questionId: string) => {
        const refs = streamingRefs.current[questionId];
        if (!refs) return;
        
        showStreamingUI(questionId);
        if (refs.thinkingElement) {
          refs.thinkingElement.textContent = refs.thinking;
        }
        if (refs.contentElement) {
          refs.contentElement.textContent = refs.content;
        }
        // Auto-scroll to bottom
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      };

      // Stream AI response
      await deepSeekService.streamChat(contextMessages, {
        onThinking: (thinking) => {
          console.log('🧠 PublicThread: Received thinking chunk:', thinking.length, 'chars');
          const refs = streamingRefs.current[questionId];
          if (refs && refs.isActive) {
            refs.thinking += thinking;
            updateStreamingDisplay(questionId);
          }
        },
        onContent: (content) => {
          console.log('📝 PublicThread: Received content chunk:', content.length, 'chars');
          const refs = streamingRefs.current[questionId];
          if (refs && refs.isActive) {
            refs.content += content;
            updateStreamingDisplay(questionId);
          }
        },
        onComplete: async (finalContent) => {
          console.log('✅ PublicThread: AI stream completed for question:', questionId);
          
          // Check if we're still the active request
          const refs = streamingRefs.current[questionId];
          if (!refs || !refs.isActive) {
            console.log('⚠️ PublicThread: AI completion ignored - request was cancelled');
            return;
          }
          
          // Mark as inactive and hide streaming UI
          refs.isActive = false;
          hideStreamingUI(questionId);
          
          // Capture the thinking process
          const finalThinking = refs.thinking;
          console.log('🧠 PublicThread: Captured thinking for persistence:', finalThinking.length, 'chars');
          
          // Create AI answer
          const aiAnswer: Answer = {
            id: uuidv4(),
            content: finalContent,
            timestamp: new Date(),
            userId: null,
            questionId: questionId,
            isPinned: true,
            isAI: true,
            interactionCount: 0,
            thinking: finalThinking || undefined // Include thinking in the answer object
          };

          console.log('🎉 AI answer completed for question:', questionId);
          console.log('🧠 Final thinking length:', finalThinking?.length || 0);
          console.log('💬 Final content length:', finalContent.length);

          // Add to local state immediately
          setAnswers(prev => ({
            ...prev,
            [questionId]: [...(prev[questionId] || []), aiAnswer]
          }));

          // Save to backend
          try {
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
            await fetch(`${apiUrl}/questions/${questionId}/answers`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: finalContent,
                userId: null,
                isAI: true,
                isPinned: true,
                thinking: finalThinking || undefined
              })
            });
          } catch (error) {
            console.error('Failed to save AI answer:', error);
          }

          // Clear streaming state
          setIsAIAnswering(prev => ({ ...prev, [questionId]: false }));
          
          // Clean up streaming refs
          if (streamingRefs.current[questionId]) {
            delete streamingRefs.current[questionId];
          }
        },
        onError: (error) => {
          console.error('AI streaming error:', error);
          
          // Clean up on error
          setIsAIAnswering(prev => ({ ...prev, [questionId]: false }));
          hideStreamingUI(questionId);
          
          if (streamingRefs.current[questionId]) {
            streamingRefs.current[questionId].isActive = false;
            delete streamingRefs.current[questionId];
          }
        }
      });

    } catch (error) {
      console.error('Failed to get AI answer:', error);
      setIsAIAnswering(prev => ({ ...prev, [questionId]: false }));
      
      if (streamingRefs.current[questionId]) {
        streamingRefs.current[questionId].isActive = false;
        delete streamingRefs.current[questionId];
      }
    }
  };

  // Handle adding user answer
  const handleAddAnswer = async (questionId: string, content: string) => {
    if (!content.trim() || (!state.currentUser && !isGuest)) return;

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
      const response = await fetch(`${apiUrl}/questions/${questionId}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          userId: state.currentUser?.id || 'guest',
          isAI: false,
          isPinned: false
        })
      });

      if (response.ok) {
        const newAnswerData = await response.json();
        setAnswers(prev => ({
          ...prev,
          [questionId]: [...(prev[questionId] || []), newAnswerData.answer]
        }));
      }
    } catch (error) {
      console.error('Failed to add answer:', error);
    }
  };

  // Handle adding comment
  const handleAddComment = async (answerId: string, content: string) => {
    if (!content.trim() || (!state.currentUser && !isGuest)) return;

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
      const response = await fetch(`${apiUrl}/answers/${answerId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          userId: state.currentUser?.id || 'guest'
        })
      });

      if (response.ok) {
        const newCommentData = await response.json();
        setComments(prev => ({
          ...prev,
          [answerId]: [...(prev[answerId] || []), newCommentData]
        }));
      }
    } catch (error) {
      console.error('Failed to add comment:', error);
    }
  };

  // Handle adding new question (only thread creator can do this)
  const handleAddQuestion = async () => {
    if (!newQuestion.trim() || !state.currentUser || !thread) return;
    if (state.currentUser.id !== thread.creator.id) return;

    try {
      setIsAddingQuestion(true);
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
      const response = await fetch(`${apiUrl}/threads/${thread.id}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newQuestion.trim(),
          userId: state.currentUser.id
        })
      });

      if (response.ok) {
        const newQuestionData = await response.json();
        setThread(prev => prev ? {
          ...prev,
          questions: [...prev.questions, newQuestionData],
          questionCount: prev.questionCount + 1
        } : null);
        setNewQuestion('');
      }
    } catch (error) {
      console.error('Failed to add question:', error);
    } finally {
      setIsAddingQuestion(false);
    }
  };

  // Sort questions based on timestamp
  const getSortedQuestions = () => {
    if (!thread) return [];
    return [...thread.questions].sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading thread...</p>
        </div>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-800 mb-2">Thread not found</h3>
          <p className="text-gray-500 mb-4">The thread you're looking for doesn't exist or has been removed.</p>
          <Button onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'forum' })}>
            Back to Forum
          </Button>
        </div>
      </div>
    );
  }

  const sortedQuestions = getSortedQuestions();

  return (
    <div className="flex w-full h-screen bg-gray-50 relative">
      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <PublicThreadHeader
          thread={thread}
          sortOrder={sortOrder}
          isGuest={isGuest}
          onBackToForum={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'forum' })}
          onSortChange={setSortOrder}
          onLogout={onLogout}
          onSignIn={() => dispatch({ type: 'SET_GUEST_MODE', payload: false })}
        />

        {/* Thread Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-8">
            {/* Add New Question (Only for thread creator) - Show at top if newest first */}
            {state.currentUser && state.currentUser.id === thread.creator.id && sortOrder === 'newest' && (
              <NewQuestionInput
                newQuestion={newQuestion}
                isAddingQuestion={isAddingQuestion}
                onQuestionChange={setNewQuestion}
                onAddQuestion={handleAddQuestion}
              />
            )}

            {/* Questions and Answers */}
            {sortedQuestions.map((question, questionIndex) => (
              <QuestionSection
                key={question.id}
                question={question}
                questionIndex={questionIndex}
                totalQuestions={sortedQuestions.length}
                sortOrder={sortOrder}
                answers={answers[question.id] || []}
                threadCreator={thread.creator}
                currentUser={state.currentUser}
                users={users}
                comments={comments}
                isGuest={isGuest}
                isAIAnswering={isAIAnswering[question.id] || false}
                streamingRefs={streamingRefs}
                onAddAnswer={handleAddAnswer}
                onAskAI={handleAskAI}
                onOpenComments={setCommentPanelOpen}
              />
            ))}

            {/* Add New Question (Only for thread creator) - Show at bottom if oldest first */}
            {state.currentUser && state.currentUser.id === thread.creator.id && sortOrder === 'oldest' && (
              <NewQuestionInput
                newQuestion={newQuestion}
                isAddingQuestion={isAddingQuestion}
                onQuestionChange={setNewQuestion}
                onAddQuestion={handleAddQuestion}
              />
            )}
          </div>
        </div>

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </main>

      {/* Comment Side Panel */}
      <CommentPanel
        commentPanelOpen={commentPanelOpen}
        comments={comments}
        users={users}
        currentUser={state.currentUser}
        threadCreator={thread.creator}
        isGuest={isGuest}
        onClose={() => setCommentPanelOpen(null)}
        onAddComment={handleAddComment}
        onSignIn={() => dispatch({ type: 'SET_GUEST_MODE', payload: false })}
      />
    </div>
  );
};