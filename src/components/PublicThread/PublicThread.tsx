import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Loader2, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Thread, Question, Answer, Comment, User } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { usePublicThread } from '../../hooks/useWebSocket';
import { useThreadNavigation } from '../../hooks/useThreadNavigation';
import { deepSeekService, ChatMessage } from '../../services/deepseek';
import { v4 as uuidv4 } from 'uuid';
import { countChatMessagesTokens } from '../../utils/tokenCounter';
import { CONTEXT_OVERFLOW_THRESHOLD } from '../../constants/ai';
import { PublicThreadHeader } from './PublicThreadHeader';
import { QuestionSection } from './QuestionSection';
import { NewQuestionInput } from './NewQuestionInput';
import { CommentPanel } from './CommentPanel';
// import { ThreadMetricDisplay } from '../ui/MetricDisplay';
// import { ContentMetricDisplay } from '../ui/MetricDisplay';
import { ShareModal } from '../ui/ShareModal';
import { metricsService } from '../../services/metrics';
import { scrollToQuestion, scrollToAnswer, scrollToComment } from '../../utils/scrollToElement';

interface PublicThreadProps {
  onLogout: () => void;
}

export const PublicThread: React.FC<PublicThreadProps> = ({ onLogout }) => {
  const { state, dispatch } = useAppContext();
  const isGuest = state.isGuestMode && !state.isAuthenticated;
  
  // Get URL parameters for deep linking
  const { threadId: urlThreadId, questionId, answerId, commentId, highlight, from, navigate: navigateFromHook } = useThreadNavigation();
  
  const [thread, setThread] = useState<Thread | null>(null);
  const [answers, setAnswers] = useState<{ [questionId: string]: Answer[] }>({});
  const [comments, setComments] = useState<{ [answerId: string]: Comment[] }>({});
  const [users, setUsers] = useState<{ [userId: string]: User }>({});
  const [newQuestion, setNewQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [commentPanelOpen, setCommentPanelOpen] = useState<string | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareModalContent, setShareModalContent] = useState<{
    type: 'thread' | 'question' | 'answer' | 'comment';
    id: string;
    title: string;
    threadId?: string;
    relatedIds?: {
      questionId?: string;
      answerId?: string;
    };
  } | null>(null);
  const [contentInteractions, setContentInteractions] = useState<{
    [key: string]: {isLiked: boolean, isSaved: boolean}
  }>({});
  const [deepLinkStatus, setDeepLinkStatus] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'warning';
  } | null>(null);
  const deepLinkHandled = useRef(false); // Track if deep link has been handled
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // AI streaming state management using refs (like PrivateChat)
  const [isAIAnswering, setIsAIAnswering] = useState<{ [questionId: string]: boolean }>({});
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [showThinking, setShowThinking] = useState(true);
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);
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

  // Get current thread ID - prioritize URL parameter over state
  // This enables deep linking directly to threads via URL
  const currentThreadId = urlThreadId || state.currentThreadId;

  // Update app state if URL has a thread ID but state doesn't match
  useEffect(() => {
    if (urlThreadId && urlThreadId !== state.currentThreadId) {
      console.log('🔗 Thread ID from URL, updating state:', urlThreadId);
      dispatch({ type: 'SET_CURRENT_THREAD', payload: urlThreadId });
      dispatch({ type: 'SET_VIEW_MODE', payload: 'public-thread' });
      
      // Reset deep link handled flag when navigating to a new thread
      deepLinkHandled.current = false;
    }
  }, [urlThreadId, state.currentThreadId, dispatch]);

  // Reset deep link flag when URL parameters change
  useEffect(() => {
    deepLinkHandled.current = false;
    console.log('🔄 Deep link flag reset due to URL parameter change');
  }, [questionId, answerId, commentId]);

  // Log navigation source for analytics
  useEffect(() => {
    if (from) {
      console.log('📊 User navigated from:', from);
      // TODO: Send analytics event
    }
  }, [from]);

  // Handle scroll to hide/show header - runs after thread is loaded
  useEffect(() => {
    // Wait for thread to load and element to be rendered
    if (isLoading || !thread) {
      return;
    }

    const scrollContainer = scrollContainerRef.current;
    
    if (!scrollContainer) {
      return;
    }

    const handleScroll = () => {
      const currentScrollY = scrollContainer.scrollTop;
      
      // Hide header when scrolling down, show when scrolling up
      if (currentScrollY > lastScrollY.current && currentScrollY > 50) {
        // Scrolling down & past threshold
        setHeaderVisible(false);
      } else if (currentScrollY < lastScrollY.current) {
        // Scrolling up
        setHeaderVisible(true);
      }
      
      lastScrollY.current = currentScrollY;
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [isLoading, thread, headerVisible]);

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
          isSummary: true,
          likeCount: 0,
          saveCount: 0,
          shareCount: 0
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

      const loadStartTime = performance.now();
      console.log('⏱️ Starting thread load for:', currentThreadId);

      try {
        setIsLoading(true);
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
        
        // ✅ PERFORMANCE FIX #3: Load thread and answers in PARALLEL
        const [threadResponse, answersResponse] = await Promise.all([
          fetch(`${apiUrl}/threads/${currentThreadId}`),
          fetch(`${apiUrl}/threads/${currentThreadId}/answers`)
        ]);

        // Parse responses in parallel
        const [threadData, answersData] = await Promise.all([
          threadResponse.ok ? threadResponse.json() : null,
          answersResponse.ok ? answersResponse.json() : {}
        ]);

        if (!threadData) {
          console.error('Failed to load thread');
          setIsLoading(false);
          return;
        }

        // Set thread and answers immediately - render NOW!
        setThread(threadData);
        setAnswers(answersData);
        
        const loadEndTime = performance.now();
        console.log(`⏱️ Core thread data loaded in ${(loadEndTime - loadStartTime).toFixed(0)}ms`);
        
        // ✅ PERFORMANCE FIX #4: Set isLoading=false BEFORE loading interactions
        // This allows the UI to render while interactions load in background
        setIsLoading(false);

        // ✅ PERFORMANCE FIX #5: Load ALL user interactions in ONE batch API call
        // This replaces 20-30+ individual getLikes/getSaves calls with a single request
        if (state.currentUser?.id) {
          const interactionsStartTime = performance.now();
          metricsService.getUserInteractionsForThread(state.currentUser.id, currentThreadId)
            .then(interactions => {
              const newInteractions: { [key: string]: {isLiked: boolean, isSaved: boolean} } = {};

              // Thread interactions
              newInteractions[`thread_${currentThreadId}`] = {
                isLiked: interactions.likes.thread.includes(currentThreadId),
                isSaved: interactions.saves.thread.includes(currentThreadId)
              };

              // Question interactions
              interactions.likes.questions.forEach(qId => {
                const key = `question_${qId}`;
                newInteractions[key] = { ...newInteractions[key], isLiked: true };
              });
              interactions.saves.questions.forEach(qId => {
                const key = `question_${qId}`;
                newInteractions[key] = { ...newInteractions[key], isSaved: true };
              });

              // Answer interactions
              interactions.likes.answers.forEach(aId => {
                const key = `answer_${aId}`;
                newInteractions[key] = { ...newInteractions[key], isLiked: true };
              });
              interactions.saves.answers.forEach(aId => {
                const key = `answer_${aId}`;
                newInteractions[key] = { ...newInteractions[key], isSaved: true };
              });

              // Comment interactions
              interactions.likes.comments.forEach(cId => {
                const key = `comment_${cId}`;
                newInteractions[key] = { ...newInteractions[key], isLiked: true };
              });
              interactions.saves.comments.forEach(cId => {
                const key = `comment_${cId}`;
                newInteractions[key] = { ...newInteractions[key], isSaved: true };
              });

              setContentInteractions(newInteractions);
              
              const interactionsEndTime = performance.now();
              console.log(`⚡ Batch interactions loaded in ${(interactionsEndTime - interactionsStartTime).toFixed(0)}ms (1 API call vs ${Object.values(answersData).flat().length + 1} individual calls)`);
            })
            .catch(error => {
              console.error('Background: Failed to load batch interactions (falling back to individual calls):', error);
              // Fallback: Load thread interactions individually
              metricsService.getLikes('thread', currentThreadId, state.currentUser.id)
                .then(likesResponse => {
                  return metricsService.getUserSaves(state.currentUser.id)
                    .then(savesResponse => {
                      const threadKey = `thread_${currentThreadId}`;
                      setContentInteractions(prev => ({
                        ...prev,
                        [threadKey]: {
                          isLiked: likesResponse.isLiked || false,
                          isSaved: savesResponse.saves?.some((save: any) => 
                            save.contentType === 'thread' && save.contentId === currentThreadId
                          ) || false
                        }
                      }));
                    });
                })
                .catch(fallbackError => console.error('Fallback: Failed to load thread interactions:', fallbackError));
            });
        }

        // ✅ PERFORMANCE FIX: Comments now load on-demand when user opens comment panel
        // This saves 10-20 API requests on initial load

        // Collect all unique user IDs from answers only (comments load later)
        const userIds = new Set<string>();
        
        // Add user IDs from answers
        Object.values(answersData).flat().forEach((answer: any) => {
          if (answer.userId && !answer.isAI) {
            userIds.add(answer.userId);
          }
        });
        
        // ✅ PERFORMANCE FIX: Don't load comments here just for user IDs
        // Comments (and their user IDs) will be loaded when user opens comment panel
        
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

        const finalTime = performance.now();
        const totalAnswers = Object.values(answersData).flat().length;
        console.log(`✅ Thread fully loaded in ${(finalTime - loadStartTime).toFixed(0)}ms`);
        console.log(`📊 Performance Summary:
          - Thread: ${threadData.title}
          - Questions: ${threadData.questions?.length || 0}
          - Answers: ${totalAnswers}
          - Users fetched: ${Object.keys(newUsers).length}
          - Comments: Lazy loaded (0 at init)
          - Interactions: Loading in background
        `);
      } catch (error) {
        console.error('Failed to load thread:', error);
      }
    };

    loadThread();
  }, [currentThreadId]);

  // Handle deep linking - scroll to specific content after thread loads
  useEffect(() => {
    console.log('🔍 Deep link effect triggered - isLoading:', isLoading, 'thread:', !!thread, 'answersLoaded:', Object.keys(answers).length);
    
    // Only proceed if thread is loaded and we have deep link parameters
    if (isLoading || !thread) {
      console.log('⏳ Deep link waiting - isLoading:', isLoading, 'thread:', !!thread);
      return;
    }

    // Check if we have any deep link parameters
    const hasDeepLinkParams = !!(questionId || answerId || commentId);
    if (!hasDeepLinkParams) {
      console.log('ℹ️ No deep link parameters, skipping');
      return;
    }

    // If already handled this deep link, don't run again
    if (deepLinkHandled.current) {
      console.log('✅ Deep link already handled, skipping');
      return;
    }

    // If we're trying to navigate to an answer or comment, wait for answers to load
    if ((answerId || commentId) && Object.keys(answers).length === 0) {
      console.log('⏳ Deep link waiting for answers to load... (currently 0 questions with answers)');
      return;
    }

    const handleDeepLink = async () => {
      console.log('🚀 Deep link handler EXECUTING');
      console.log('🔗 Parameters:', { questionId, answerId, commentId, highlight });
      console.log('🔗 Answers loaded:', Object.keys(answers).length, 'questions');
      console.log('🔗 Total answers:', Object.values(answers).flat().length);
      
      // Mark as handled
      deepLinkHandled.current = true;

      // Priority order: comment > answer > question
      if (commentId && answerId) {
        // Navigate to a specific comment
        console.log('📍 Navigating to comment:', commentId);
        
        // Check if answer exists in loaded data
        const answerExists = Object.values(answers).flat().some(a => a.id === answerId);
        if (!answerExists) {
          console.error('❌ Answer not found:', answerId);
          setDeepLinkStatus({
            show: true,
            message: 'The answer you\'re looking for was not found in this thread.',
            type: 'error'
          });
          setTimeout(() => setDeepLinkStatus(null), 5000);
          return;
        }

        // Open the comment panel (will load comments on-demand)
        await handleOpenComments(answerId);
        
        // Wait for comment panel to open and render
        await new Promise(resolve => setTimeout(resolve, 400));
        
        // Then scroll to the comment
        const success = await scrollToComment(commentId, {
          highlight: highlight || false,
          behavior: 'smooth',
          offset: 100
        });
        
        if (!success) {
          console.warn('⚠️ Comment not found, scrolling to answer instead');
          // Fallback to answer if comment not found
          await scrollToAnswer(answerId, {
            highlight: highlight || false,
            behavior: 'smooth'
          });
        }
      } else if (answerId) {
        // Navigate to a specific answer
        console.log('📍 Navigating to answer:', answerId);
        
        // Verify answer exists in data
        const allAnswers = Object.values(answers).flat();
        const answerExists = allAnswers.some(a => a.id === answerId);
        console.log('🔍 Answer exists in data?', answerExists);
        console.log('🔍 All answer IDs:', allAnswers.map(a => a.id));
        
        if (!answerExists) {
          console.error('❌ Answer not found in thread data:', answerId);
          setDeepLinkStatus({
            show: true,
            message: 'The answer you\'re looking for was not found.',
            type: 'error'
          });
          setTimeout(() => setDeepLinkStatus(null), 5000);
          // Still attempt scroll in case it loads later
        }
        
        // Check if element exists in DOM
        const elementId = `answer-${answerId}`;
        const element = document.getElementById(elementId);
        console.log('🔍 Element in DOM?', !!element, 'ID:', elementId);
        
        const success = await scrollToAnswer(answerId, {
          highlight: highlight || false,
          behavior: 'smooth'
        });
        
        if (!success) {
          console.warn('⚠️ Answer not found in DOM after scroll attempts:', answerId);
          console.log('🔍 All elements with "answer-" IDs:', 
            Array.from(document.querySelectorAll('[id^="answer-"]')).map(el => el.id)
          );
        }
      } else if (questionId) {
        // Navigate to a specific question
        console.log('📍 Navigating to question:', questionId);
        
        // Verify question exists
        const questionExists = thread.questions?.some(q => q.id === questionId);
        if (!questionExists) {
          console.error('❌ Question not found in thread:', questionId);
          setDeepLinkStatus({
            show: true,
            message: 'The question you\'re looking for was not found.',
            type: 'error'
          });
          setTimeout(() => setDeepLinkStatus(null), 5000);
        }
        
        const success = await scrollToQuestion(questionId, {
          highlight: highlight || false,
          behavior: 'smooth'
        });
        
        if (!success) {
          console.warn('⚠️ Question not found in DOM:', questionId);
        }
      } else if (highlight) {
        // Just highlight the thread (scroll to top)
        console.log('📍 Highlighting thread');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    handleDeepLink();
  }, [isLoading, thread, answers, comments, questionId, answerId, commentId, highlight]);

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
              commentCount: 0,
              thinking: finalThinking || undefined,
              likeCount: 0,
              saveCount: 0,
              shareCount: 0
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
              parentId: undefined,
              likeCount: 0,
              saveCount: 0,
              shareCount: 0
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

  // Handle opening comment panel - load comments on-demand
  const handleOpenComments = async (answerId: string) => {
    console.log('💬 Opening comments for answer:', answerId);
    setCommentPanelOpen(answerId);

    // Check if comments already loaded for this answer
    if (comments[answerId] && comments[answerId].length >= 0) {
      console.log('✅ Comments already loaded for answer:', answerId);
      return;
    }

    // Load comments on-demand
    try {
      console.log('📥 Loading comments on-demand for answer:', answerId);
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
      const commentsResponse = await fetch(`${apiUrl}/answers/${answerId}/comments`);
      
      if (commentsResponse.ok) {
        const commentsData = await commentsResponse.json();
        setComments(prev => ({ ...prev, [answerId]: commentsData }));
        
        // Load user info for comment authors in background
        const commentUserIds = new Set<string>();
        commentsData.forEach((comment: any) => {
          if (comment.userId && comment.userId !== state.currentUser?.id) {
            commentUserIds.add(comment.userId);
          }
        });
        
        // Fetch user info in background
        if (commentUserIds.size > 0) {
          Array.from(commentUserIds).forEach(async (userId) => {
            if (!users[userId]) {
              const userInfo = await fetchUserInfo(userId);
              if (userInfo) {
                setUsers(prev => ({ ...prev, [userId]: userInfo }));
              }
            }
          });
        }

        // ✅ PERFORMANCE FIX: Comment interactions are already loaded via batch API call
        // No need to make individual API calls here - interactions are in contentInteractions state
      }
    } catch (error) {
      console.error('Failed to load comments on-demand:', error);
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

  // ==================== METRIC INTERACTION HANDLERS ====================

  // Thread-level metrics removed from UI, only answer-level metrics shown

  const handleLikeAnswer = async (answerId: string) => {
    if (!state.currentUser?.id) return;
    
    const key = `answer_${answerId}`;
    const currentInteraction = contentInteractions[key];
    const newIsLiked = !currentInteraction?.isLiked;
    
    try {
      await metricsService.toggleLike('answer', answerId, state.currentUser.id, newIsLiked ? 'like' : 'unlike');
      
      setContentInteractions(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          isLiked: newIsLiked
        }
      }));
      
      // Update local state for the specific answer
      setAnswers(prev => {
        const updatedAnswers = { ...prev };
        Object.keys(updatedAnswers).forEach(questionId => {
          updatedAnswers[questionId] = updatedAnswers[questionId].map(answer => 
            answer.id === answerId 
              ? {
                  ...answer,
                  likeCount: newIsLiked ? answer.likeCount + 1 : Math.max(0, answer.likeCount - 1)
                }
              : answer
          );
        });
        return updatedAnswers;
      });
    } catch (error) {
      console.error('Failed to toggle answer like:', error);
    }
  };

  const handleSaveAnswer = async (answerId: string) => {
    if (!state.currentUser?.id) return;
    
    const key = `answer_${answerId}`;
    const currentInteraction = contentInteractions[key];
    const newIsSaved = !currentInteraction?.isSaved;
    
    try {
      await metricsService.toggleSave('answer', answerId, state.currentUser.id, newIsSaved ? 'save' : 'unsave');
      
      setContentInteractions(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          isSaved: newIsSaved
        }
      }));
      
      // Update local state for the specific answer
      setAnswers(prev => {
        const updatedAnswers = { ...prev };
        Object.keys(updatedAnswers).forEach(questionId => {
          updatedAnswers[questionId] = updatedAnswers[questionId].map(answer => 
            answer.id === answerId 
              ? {
                  ...answer,
                  saveCount: newIsSaved ? answer.saveCount + 1 : Math.max(0, answer.saveCount - 1)
                }
              : answer
          );
        });
        return updatedAnswers;
      });
    } catch (error) {
      console.error('Failed to toggle answer save:', error);
    }
  };

  const handleShareAnswer = async (answerId: string) => {
    // Find the answer to get its content and question ID for the modal
    let answerContent = '';
    let questionIdForAnswer = '';
    
    Object.entries(answers).forEach(([qId, answerList]) => {
      const foundAnswer = answerList.find(a => a.id === answerId);
      if (foundAnswer) {
        answerContent = foundAnswer.content.substring(0, 100) + (foundAnswer.content.length > 100 ? '...' : '');
        questionIdForAnswer = qId;
      }
    });
    
    // Open share modal with full context
    setShareModalContent({
      type: 'answer',
      id: answerId,
      title: answerContent || 'Answer',
      threadId: thread?.id,
      relatedIds: {
        questionId: questionIdForAnswer
      }
    });
    setShareModalOpen(true);
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
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
          <Button onClick={() => {
            dispatch({ type: 'SET_VIEW_MODE', payload: 'forum' });
            dispatch({ type: 'SET_CURRENT_THREAD', payload: null });
            navigateFromHook('/');
          }}>
            Back to Forum
          </Button>
        </div>
      </div>
    );
  }

  const sortedQuestions = getSortedQuestions();

  return (
    <div className="flex w-full h-screen bg-gray-50 relative">
      {/* Deep Link Status Toast */}
      {deepLinkStatus?.show && (
        <div 
          className={`fixed top-20 left-1/2 transform -translate-x-1/2 z-50 px-4 py-3 rounded-lg shadow-lg max-w-md animate-fade-in ${
            deepLinkStatus.type === 'error' ? 'bg-red-100 text-red-800 border border-red-300' :
            deepLinkStatus.type === 'warning' ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' :
            'bg-green-100 text-green-800 border border-green-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="font-medium">{deepLinkStatus.message}</span>
            <button
              onClick={() => setDeepLinkStatus(null)}
              className="ml-auto text-current opacity-70 hover:opacity-100"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Header - Fixed position */}
        <PublicThreadHeader
          thread={thread}
          sortOrder={sortOrder}
          showThinking={showThinking}
          headerVisible={headerVisible}
          onBackToForum={() => {
            dispatch({ type: 'SET_VIEW_MODE', payload: 'forum' });
            dispatch({ type: 'SET_CURRENT_THREAD', payload: null });
            navigateFromHook('/');
          }}
          onSortChange={setSortOrder}
          onToggleThinking={() => setShowThinking(!showThinking)}
        />

        {/* Thread Content - with padding-top to account for fixed header */}
        <div 
          ref={scrollContainerRef} 
          className={`flex-1 overflow-y-auto transition-all duration-300 ${
            headerVisible ? 'pt-[88px]' : 'pt-0'
          }`}
        >
          {/* Summarization Notification */}
          {isSummarizing && (
            <div className="bg-green-50 border-l-4 border-green-400 p-4 mx-6 mb-4 rounded-md">
              <div className="flex items-center">
                <Loader2 className="w-5 h-5 text-green-600 animate-spin mr-3" />
                <div>
                  <p className="text-green-800 font-medium">AI is summarizing conversation</p>
                  <p className="text-green-600 text-sm">Processing previous messages to maintain context...</p>
                </div>
              </div>
            </div>
          )}

          <div className="p-6">
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
                isGuest={isGuest}
                isAIAnswering={isAIAnswering[question.id] || false}
                streamingRefs={streamingRefs}
                showThinking={showThinking}
                onAddAnswer={handleAddAnswer}
                onAskAI={handleAskAI}
                onOpenComments={handleOpenComments}
                onLikeAnswer={handleLikeAnswer}
                onSaveAnswer={handleSaveAnswer}
                onShareAnswer={handleShareAnswer}
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
        </div>
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

      {/* Share Modal */}
      {shareModalContent && (
        <ShareModal
          isOpen={shareModalOpen}
          onClose={() => {
            setShareModalOpen(false);
            setShareModalContent(null);
          }}
          contentType={shareModalContent.type}
          contentId={shareModalContent.id}
          contentTitle={shareModalContent.title}
          threadId={shareModalContent.threadId}
          relatedIds={shareModalContent.relatedIds}
          userId={state.currentUser?.id}
          onShareComplete={() => {
            // Update share count in local state
            if (shareModalContent.type === 'answer') {
              setAnswers(prev => {
                const updatedAnswers = { ...prev };
                Object.keys(updatedAnswers).forEach(questionId => {
                  updatedAnswers[questionId] = updatedAnswers[questionId].map(answer => 
                    answer.id === shareModalContent.id 
                      ? {
                          ...answer,
                          shareCount: answer.shareCount + 1
                        }
                      : answer
                  );
                });
                return updatedAnswers;
              });
            }
          }}
        />
      )}
    </div>
  );
};