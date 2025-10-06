import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Loader2 } from 'lucide-react';
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
  const [isSummarizing, setIsSummarizing] = useState(false);
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

  // Helper function to get user name by ID
  const getUserName = (userId: string): string => {
    // Check current user first
    if (state.currentUser?.id === userId) {
      return state.currentUser.name;
    }
    
    // Check thread creator
    if (thread?.creator.id === userId) {
      return thread.creator.name;
    }
    
    // Check users state
    if (users[userId]) {
      return users[userId].name;
    }
    
    // Fallback to truncated ID
    return `User${userId.slice(-4)}`;
  };

  // Get current thread ID from state
  const currentThreadId = state.currentThreadId;

  // Build context for AI with proper multi-user structure and overflow handling
  const buildThreadContextForAI = async (targetId: string, targetType: 'question' | 'answer' = 'question'): Promise<{ messages: ChatMessage[], summaryAdded: boolean }> => {
    console.log('🔍 Building AI context for:', { targetId, targetType });
    
    if (!thread) {
      console.log('❌ No thread available for context building');
      return { messages: [], summaryAdded: false };
    }

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
- Always clearly identify which question you are responding to
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
    // BUT if we're looking for a specific answer, we need to include its question regardless of timestamp
    let questionsToInclude = regularQuestions.filter(q => 
      new Date(q.timestamp).getTime() > cutoffTimestamp
    );
    
    // If we're looking for a specific answer or question, make sure it's included regardless of summary cutoff
    if (targetType === 'answer') {
      const targetAnswerQuestionId = Object.values(answers).flat().find(a => a.id === targetId)?.questionId;
      if (targetAnswerQuestionId) {
        const targetQuestion = regularQuestions.find(q => q.id === targetAnswerQuestionId);
        if (targetQuestion && !questionsToInclude.find(q => q.id === targetAnswerQuestionId)) {
          console.log('🔧 Including target answer question despite summary cutoff:', targetAnswerQuestionId);
          questionsToInclude = [targetQuestion, ...questionsToInclude];
        }
      }
    } else if (targetType === 'question') {
      const targetQuestion = regularQuestions.find(q => q.id === targetId);
      if (targetQuestion && !questionsToInclude.find(q => q.id === targetId)) {
        console.log('🔧 Including target question despite summary cutoff:', targetId);
        questionsToInclude = [targetQuestion, ...questionsToInclude];
      }
    }

    let questionNumber = 1;
    let targetQuestionNumber = 1;
    let targetAnswer: Answer | null = null;

    for (const question of questionsToInclude) {
      // Add the question
      messages.push({
        role: 'user',
        content: `[Question ${questionNumber} from ${thread.creator.name}]: ${question.content}`
      });

      if (question.id === targetId && targetType === 'question') {
        targetQuestionNumber = questionNumber;
      }

      // Add all answers for this question
      const questionAnswers = answers[question.id] || [];
      const sortedAnswers = [...questionAnswers].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      for (const answer of sortedAnswers) {
        if (answer.id === targetId && targetType === 'answer') {
          targetAnswer = answer;
        }

        if (answer.isAI) {
          messages.push({
            role: 'assistant',
            content: answer.content
          });
        } else {
          // For user answers, use actual user names for consistency
          messages.push({
            role: 'user',
            content: `[Answer from ${getUserName(answer.userId)}]: ${answer.content}`
          });
        }
      }

      questionNumber++;
    }


    // Find the target content and add appropriate context
    console.log('🎯 Building final prompt:', { targetType, targetId, targetAnswer: targetAnswer?.id });
    
    if (targetType === 'question') {
      const targetQuestion = [...summaryQuestions, ...regularQuestions].find(q => q.id === targetId);
      if (targetQuestion) {
        const finalPrompt = `Please provide your answer to the following question:\n\n"${targetQuestion.content}"\n\nThis is Question ${targetQuestionNumber} in the discussion thread.`;
        messages.push({
          role: 'user',
          content: finalPrompt
        });
        console.log('✅ Added question prompt:', finalPrompt);
      } else {
        console.log('❌ Target question not found:', targetId);
      }
    } else if (targetType === 'answer') {
      console.log('🔍 Looking for target answer:', { targetId, targetAnswer: targetAnswer?.id, hasTargetAnswer: !!targetAnswer });
      
      if (targetAnswer) {
        const targetQuestion = [...summaryQuestions, ...regularQuestions].find(q => q.id === targetAnswer.questionId);
        if (targetQuestion) {
          const questionNum = questionsToInclude.findIndex(q => q.id === targetAnswer.questionId) + 1;
          const finalPrompt = `Please provide your comment on the following answer to Question ${questionNum}:\n\nOriginal Question: "${targetQuestion.content}"\n\nAnswer to comment on: "${targetAnswer.content}"\n\nPlease analyze and comment on this specific answer.`;
          messages.push({
            role: 'user',
            content: finalPrompt
          });
          console.log('✅ Added answer prompt:', finalPrompt);
        } else {
          console.log('❌ Target question for answer not found:', targetAnswer.questionId);
        }
      } else {
        console.log('❌ Target answer not found:', targetId);
        console.log('📋 Available answers:', Object.keys(answers));
        console.log('📋 All answers:', Object.values(answers).flat().map(a => ({ id: a.id, questionId: a.questionId })));
      }
    }

    console.log('messages', messages);

    // Check for context overflow
    const currentTokenCount = countChatMessagesTokens(messages);
    console.log(`📊 Public thread estimated token count: ${currentTokenCount} / ${CONTEXT_OVERFLOW_THRESHOLD}`);

    if (currentTokenCount > CONTEXT_OVERFLOW_THRESHOLD) {
      console.warn('⚠️ Public thread context overflow detected. Summarizing...');
      
      // Show notification that AI is summarizing
      setIsSummarizing(true);
      
      try {
        // Generate summary only of conversations since the last summary point
        // Build messages for summarization (only content after latest summary)
        const messagesToSummarize: ChatMessage[] = [];
        
        // Add only questions and answers that occurred after the latest summary
        for (const question of questionsToInclude) {
          // Add the question
          messagesToSummarize.push({
            role: 'user',
            content: `[Question from ${thread.creator.name}]: ${question.content}`
          });

          // Add all answers for this question
          const questionAnswers = answers[question.id] || [];
          const sortedAnswers = [...questionAnswers].sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );

          for (const answer of sortedAnswers) {
            if (answer.isAI) {
              messagesToSummarize.push({
                role: 'assistant',
                content: answer.content
              });
            } else {
              messagesToSummarize.push({
                role: 'user',
                content: `[Answer from ${getUserName(answer.userId)}]: ${answer.content}`
              });
            }
          }
        }

        console.log('messagesToSummarize', messagesToSummarize);
        
        console.log(`📝 Summarizing ${messagesToSummarize.length} messages since last summary point`);
        
        // Generate summary of only the recent conversations
        const summary = await deepSeekService.summarizeConversation(messagesToSummarize);
        
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
        // Note: Don't increment questionCount for summary questions as they're hidden from UI
        setThread(prev => prev ? {
          ...prev,
          questions: [summaryQuestion, ...prev.questions]
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
        const currentTargetQuestion = targetType === 'question' 
          ? [...summaryQuestions, ...regularQuestions].find(q => q.id === targetId)
          : targetAnswer ? [...summaryQuestions, ...regularQuestions].find(q => q.id === targetAnswer.questionId) : null;
          
        messages = [
          {
            role: 'system',
            content: `You are participating in a public discussion thread where multiple users can ask questions and provide answers. This conversation includes a summary of previous discussions to manage context length. Use the summary information to understand the full context.\n\nPrevious discussion summary: ${summary}`
          }
        ];

        // Add specific context based on target type
        console.log('🎯 Summarization path - Building final prompt:', { targetType, targetId, targetAnswer: targetAnswer?.id, currentTargetQuestion: currentTargetQuestion?.id });
        
        if (targetType === 'question' && currentTargetQuestion) {
          const finalPrompt = `Please provide your answer to the following question:\n\n"${currentTargetQuestion.content}"\n\nThis is a question in the discussion thread.`;
          messages.push({
            role: 'user',
            content: finalPrompt
          });
          console.log('✅ Summarization: Added question prompt:', finalPrompt);
        } else if (targetType === 'answer' && targetAnswer && currentTargetQuestion) {
          const finalPrompt = `Please provide your comment on the following answer:\n\nOriginal Question: "${currentTargetQuestion.content}"\n\nAnswer to comment on: "${targetAnswer.content}"\n\nPlease analyze and comment on this specific answer.`;
          messages.push({
            role: 'user',
            content: finalPrompt
          });
          console.log('✅ Summarization: Added answer prompt:', finalPrompt);
        } else {
          console.log('❌ Summarization: Missing required data:', { 
            hasTargetAnswer: !!targetAnswer, 
            hasCurrentTargetQuestion: !!currentTargetQuestion,
            targetType,
            targetId 
          });
        }
        
        summaryAdded = true;
        console.log('✅ Context summarized and reduced for AI processing');
        
      } catch (error) {
        console.error('❌ Failed to summarize thread context:', error);
        // Continue with original messages if summarization fails
      } finally {
        // Hide summarization notification
        setIsSummarizing(false);
      }
    }

    console.log('✅ Final context built:', {
      totalMessages: messages.length,
      summaryAdded,
      finalTokenCount: countChatMessagesTokens(messages),
      messagesPreview: messages.map((msg, index) => ({
        index,
        role: msg.role,
        contentLength: msg.content.length,
        contentPreview: msg.content.substring(0, 100) + '...'
      }))
    });

    return { messages, summaryAdded };
  };

  // WebSocket hooks for real-time updates
  const { } = usePublicThread(
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
        const allAnswers = Object.values(answersData).flat() as Answer[];
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
          if (!users[userId] && userId !== state.currentUser?.id && userId !== thread?.creator?.id) {
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
  const handleAskAI = async (targetId: string, targetType: 'question' | 'answer', customPrompt?: string) => {
    if (isGuest) return; // Guests can't use AI
    
    // Prevent multiple simultaneous AI requests for the same target
    if (isAIAnswering[targetId]) {
      console.log('⚠️ AI already answering:', targetId);
      return;
    }
    
    try {
      setIsAIAnswering(prev => ({ ...prev, [targetId]: true }));
      
      // Initialize streaming refs for this target
      streamingRefs.current[targetId] = {
        thinking: '',
        content: '',
        isActive: true,
        thinkingElement: null,
        contentElement: null,
        streamingContainer: null,
      };

      // Build context for this specific target
      const { messages: contextMessages, summaryAdded } = await buildThreadContextForAI(targetId, targetType);
      
      if (summaryAdded) {
        console.log('📝 Using summarized context for AI response');
      }

      // Show streaming UI via DOM manipulation
      const showStreamingUI = (targetId: string) => {
        const container = streamingRefs.current[targetId]?.streamingContainer;
        if (container) {
          container.style.display = 'block';
        }
      };

      const hideStreamingUI = (targetId: string) => {
        const container = streamingRefs.current[targetId]?.streamingContainer;
        if (container) {
          container.style.display = 'none';
        }
      };

      const updateStreamingDisplay = (targetId: string) => {
        const refs = streamingRefs.current[targetId];
        if (!refs) return;
        
        showStreamingUI(targetId);
        if (refs.thinkingElement) {
          refs.thinkingElement.textContent = refs.thinking;
        }
        if (refs.contentElement) {
          // For streaming content, we'll use innerHTML to support basic markdown formatting
          // This is a simplified approach for real-time streaming
          const formattedContent = refs.content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">$1</code>')
            .replace(/^### (.*$)/gim, '<h3 class="text-xs font-medium mb-1 mt-2">$1</h3>')
            .replace(/^## (.*$)/gim, '<h2 class="text-xs font-semibold mb-1 mt-2">$1</h2>')
            .replace(/^# (.*$)/gim, '<h1 class="text-sm font-bold mb-2 mt-3">$1</h1>')
            .replace(/^- (.*$)/gim, '<li class="ml-1">$1</li>')
            .replace(/\n/g, '<br>');
          refs.contentElement.innerHTML = formattedContent;
        }
        // Auto-scroll to bottom
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      };

      // Add custom prompt to context if provided
      let finalMessages = contextMessages;
      if (customPrompt) {
        finalMessages = [
          ...contextMessages,
          {
            role: 'user' as const,
            content: customPrompt
          }
        ];
        console.log('📝 Custom prompt added:', {
          customPrompt,
          promptLength: customPrompt.length,
          totalMessagesBeforePrompt: contextMessages.length,
          totalMessagesAfterPrompt: finalMessages.length
        });
      } else {
        console.log('📝 No custom prompt provided, using default context');
      }
      
      await deepSeekService.streamChat(finalMessages, {
        onThinking: (thinking) => {
          const refs = streamingRefs.current[targetId];
          if (refs && refs.isActive) {
            refs.thinking += thinking;
            updateStreamingDisplay(targetId);
          }
        },
        onContent: (content) => {
          const refs = streamingRefs.current[targetId];
          if (refs && refs.isActive) {
            refs.content += content;
            updateStreamingDisplay(targetId);
          }
        },
        onComplete: async (finalContent) => {
          
          // Check if we're still the active request
          const refs = streamingRefs.current[targetId];
          if (!refs || !refs.isActive) {
            return;
          }
          
          // Mark as inactive and hide streaming UI
          refs.isActive = false;
          hideStreamingUI(targetId);
          
          // Capture the thinking process
          const finalThinking = refs.thinking;
          console.log('🧠 PublicThread: Captured thinking for persistence:', finalThinking.length, 'chars');
          
          if (targetType === 'question') {
            // Create AI answer for questions
            const aiAnswer: Answer = {
              id: uuidv4(),
              content: finalContent,
              timestamp: new Date(),
              userId: 'ai-system',
              questionId: targetId,
              isPinned: true,
              isAI: true,
              interactionCount: 0,
              thinking: finalThinking || undefined
            };

            console.log('🎉 AI answer completed for question:', targetId);

            // Add to local state immediately
            setAnswers(prev => ({
              ...prev,
              [targetId]: [...(prev[targetId] || []), aiAnswer]
            }));

            // Save to backend
            try {
              const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
              await fetch(`${apiUrl}/questions/${targetId}/answers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  content: finalContent,
                  userId: 'ai-system',
                  isAI: true,
                  isPinned: true,
                  thinking: finalThinking || undefined
                })
              });
            } catch (error) {
              console.error('Failed to save AI answer:', error);
            }
          } else if (targetType === 'answer') {
            // Create AI comment for answers
            const aiComment: Comment = {
              id: uuidv4(),
              content: finalContent,
              timestamp: new Date(),
              userId: 'ai-system',
              answerId: targetId,
              parentId: undefined
            };

            console.log('🎉 AI comment completed for answer:', targetId);

            // Add to local state immediately
            setComments(prev => ({
              ...prev,
              [targetId]: [...(prev[targetId] || []), aiComment]
            }));

            // Save to backend
            try {
              const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
              await fetch(`${apiUrl}/answers/${targetId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  content: finalContent,
                  userId: 'ai-system',
                  thinking: finalThinking || undefined
                })
              });
            } catch (error) {
              console.error('Failed to save AI comment:', error);
            }
          }

          // Clear streaming state
          setIsAIAnswering(prev => ({ ...prev, [targetId]: false }));
          
          // Clean up streaming refs
          if (streamingRefs.current[targetId]) {
            delete streamingRefs.current[targetId];
          }
        },
        onError: (error) => {
          console.error('AI streaming error:', error);
          
          // Clean up on error
          setIsAIAnswering(prev => ({ ...prev, [targetId]: false }));
          hideStreamingUI(targetId);
          
          if (streamingRefs.current[targetId]) {
            streamingRefs.current[targetId].isActive = false;
            delete streamingRefs.current[targetId];
          }
        }
      });

    } catch (error) {
      console.error('Failed to get AI answer:', error);
      setIsAIAnswering(prev => ({ ...prev, [targetId]: false }));
      
      if (streamingRefs.current[targetId]) {
        streamingRefs.current[targetId].isActive = false;
        delete streamingRefs.current[targetId];
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

  // Sort questions based on timestamp (exclude summary questions from UI)
  // Summary questions are used for AI context but hidden from user interface
  const getSortedQuestions = () => {
    if (!thread) return [];
    return [...thread.questions]
      .filter(question => !question.isSummary) // Hide summary questions from UI - they're only for AI context
      .sort((a, b) => {
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
          currentUser={state.currentUser}
          onBackToForum={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'forum' })}
          onSortChange={setSortOrder}
          onLogout={onLogout}
          onSignIn={() => dispatch({ type: 'SET_GUEST_MODE', payload: false })}
          onGoToUserCenter={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'user-center' })}
          onGoToAccount={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'account' })}
        />

        {/* Summarization Notification */}
        {isSummarizing && (
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mx-6 mt-4 rounded-md">
            <div className="flex items-center">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin mr-3" />
              <div>
                <p className="text-blue-800 font-medium">AI is summarizing conversation</p>
                <p className="text-blue-600 text-sm">Processing previous messages to maintain context...</p>
              </div>
            </div>
          </div>
        )}

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