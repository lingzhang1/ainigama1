Design Strategy for DeepSeek Context Window Management
The primary goal is to prevent DeepSeek API token overflow errors by proactively managing conversation context. This strategy involves estimating token usage, summarizing historical context when necessary, and integrating these summaries into the user experience for both private and public chat modes.

1. Core Mechanism: Token Counting and Threshold Detection
DeepSeek Context Window: The deepseek-reasoner model, which you are using, has a context window of 128,000 tokens.
Token Estimation: Since a precise DeepSeek tokenizer might not be readily available or easily integrated client-side, we will use a heuristic-based token estimation. A common rule of thumb for English text is 4 characters per token. This provides a reasonable approximation to detect potential overflow.
Overflow Threshold: To ensure there's always enough room for the summarization prompt itself and new user input, we will set a threshold at 80% of the total context window (i.e., 102,400 tokens). When the estimated token count of the conversation history exceeds this threshold, the overflow handling mechanism will be triggered.
2. Summarization Service
AI-Powered Summarization: When an overflow is detected, the DeepSeek API will be used to generate a concise summary of the overflowing conversation history.
Summarization Prompt: A dedicated prompt will instruct the AI to act as an expert summarizer, condensing the conversation into key topics and points, suitable for continuing the discussion. The summary will be constrained (e.g., maxTokens: 1000) to ensure it fits within the context window for subsequent interactions.
3. Private Chat Overflow Handling
Scenario: A user's private conversation with the AI exceeds the context window threshold.

Flow:

Pre-send Check: Before sending a new user message to deepSeekService.streamChat, the PrivateChat component will calculate the estimated token count of the entire conversation history (including the new user message).
Overflow Detection: If the token count exceeds CONTEXT_OVERFLOW_THRESHOLD:
The AI's immediate response to the user's current message will be a system-generated message indicating that the conversation history is too long and a summary has been generated.
Asynchronously, the deepSeekService will be called to summarize the entire historical conversation.
The generated summary will be stored in the component's state (conversationSummary).
A visual banner (ConversationContextWarning) will appear at the top of the chat interface, prompting the user to start a new conversation with the generated summary.
User Action: Start New Conversation with Summary:
When the user clicks the banner's action button:
A new private conversation will be initiated.
This new conversation will be pre-populated with two initial messages:
An AI message: "Here's a summary of our previous discussion: [generated summary]"
A user message: "Based on this, let's continue our discussion."
The AI will then respond to this user message, effectively continuing the conversation from the summarized context.
The conversationSummary and showContextWarning states will be cleared.
4. Public Chat Overflow Handling
Scenario: An AI response is requested for a question in a public thread, and the accumulated context (all previous questions and answers in the thread) exceeds the context window threshold.

Flow:

Pre-send Check: Within the handleAskAI function in PublicThread, a helper function (prepareMessagesForAI) will calculate the estimated token count of the entire thread context.
Overflow Detection: If the token count exceeds CONTEXT_OVERFLOW_THRESHOLD:
The deepSeekService will be called to summarize the overflowing thread context.
A new "summary" question will be dynamically created and prepended to the thread.questions array in the UI. This question will contain the AI-generated summary and will be visually distinct (e.g., marked as isSummary).
The contextMessages array sent to DeepSeek for the current AI answer will be truncated and start with this new summary, followed by the most recent relevant messages, ensuring it fits within the context window.
This new summary question will also be persisted to the backend database.
5. Implementation Details & New/Modified Files
A. New Utility Files:

src/constants/ai.ts:

export const DEEPSEEK_CONTEXT_WINDOW = 128000; // Tokens for deepseek-reasoner
export const CONTEXT_OVERFLOW_THRESHOLD = DEEPSEEK_CONTEXT_WINDOW * 0.8; // 80% threshold
export const SUMMARIZATION_PROMPT = "You are an expert summarizer. Condense the following conversation into a concise, coherent summary of the main topics and key points, suitable for continuing the discussion. Focus on retaining essential context. The summary should be no more than 500 words.";
src/utils/tokenCounter.ts:

import { ChatMessage } from '../services/deepseek';

// Simple heuristic: 4 characters per token for English text
export const estimateTokens = (text: string): number => {
  return Math.ceil(text.length / 4);
};

export const countChatMessagesTokens = (messages: ChatMessage[]): number => {
  let totalTokens = 0;
  for (const message of messages) {
    totalTokens += estimateTokens(message.content);
    // Also consider system prompts if they are part of the message array
    if (message.role === 'system' && message.content) {
        totalTokens += estimateTokens(message.content);
    }
  }
  return totalTokens;
};
B. Modified src/services/deepseek.ts:

Add a new method summarizeConversation:

// ... existing imports and class structure

export class DeepSeekService {
  // ... existing constructor and streamChat method

  async summarizeConversation(messages: ChatMessage[]): Promise<string> {
    console.log('Starting summarization with DeepSeek...');
    try {
      const result = await streamText({
        model: this.deepseekClient('deepseek-reasoner'), // Or a smaller model if available/suitable
        system: SUMMARIZATION_PROMPT, // Use the new constant
        messages: messages, // Send the full history for summarization
        maxTokens: 1000 // Limit the summary length
      });
      const summary = await result.text();
      console.log('Summarization complete:', summary.length, 'chars');
      return summary;
    } catch (error) {
      console.error('DeepSeek summarization error:', error);
      throw new Error('Failed to summarize conversation.');
    }
  }
}
C. New Component for Private Chat Warning:

src/components/PrivateChat/ConversationContextWarning.tsx:

import React from 'react';
import { AlertTriangle, MessageSquarePlus } from 'lucide-react';
import { Button } from '../ui/button';

interface ConversationContextWarningProps {
  summary: string | null;
  onStartNewConversationWithSummary: (summary: string) => void;
  onDismiss: () => void;
}

export const ConversationContextWarning: React.FC<ConversationContextWarningProps> = ({
  summary,
  onStartNewConversationWithSummary,
  onDismiss
}) => {
  if (!summary) return null;

  return (
    <div className="p-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 flex items-center justify-between shadow-md">
      <div className="flex items-center">
        <AlertTriangle className="h-5 w-5 mr-3" />
        <div>
          <p className="font-bold">Conversation Context Limit Reached</p>
          <p className="text-sm">Your conversation history is very long. A summary has been generated.</p>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onStartNewConversationWithSummary(summary)}
          className="bg-yellow-500 hover:bg-yellow-600 text-white flex items-center"
        >
          <MessageSquarePlus className="h-4 w-4 mr-2" />
          Start New Chat with Summary
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="text-yellow-800 hover:bg-yellow-200"
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
};
D. Modified src/types/index.ts:

Update Question interface:

export interface Question {
  id: string;
  content: string;
  timestamp: Date;
  userId: string;
  threadId: string;
  isSummary?: boolean; // Add this new optional property
}
E. Modified src/components/PrivateChat/PrivateChat.tsx:

Imports:

import { estimateTokens, countChatMessagesTokens } from '../../utils/tokenCounter';
import { DEEPSEEK_CONTEXT_WINDOW, CONTEXT_OVERFLOW_THRESHOLD, SUMMARIZATION_PROMPT } from '../../constants/ai';
import { ConversationContextWarning } from './ConversationContextWarning';
State:

const [conversationSummary, setConversationSummary] = useState<string | null>(null);
const [showContextWarning, setShowContextWarning] = useState(false);
handleSendMessage Logic:

const handleSendMessage = async () => {
  if (!newMessage.trim() || !currentConversation) return;

  if (isProcessingRef.current) {
    console.log('⚠️ Already processing a message, ignoring new request');
    return;
  }
  isProcessingRef.current = true;

  // ... (existing guest mode logic)

  const userMessage: Message = {
    id: uuidv4(),
    content: newMessage.trim(),
    timestamp: new Date(),
    sender: 'user'
  };

  const updatedConversationWithUserMessage = {
    ...workingConversation,
    messages: [...workingConversation.messages, userMessage],
    updatedAt: new Date()
  };
  setCurrentConversation(updatedConversationWithUserMessage);
  setNewMessage('');

  // Prepare messages for token counting (including the new user message)
  const chatMessagesForTokenCount: ChatMessage[] = updatedConversationWithUserMessage.messages.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.content
  }));

  const currentTokenCount = countChatMessagesTokens(chatMessagesForTokenCount);
  console.log(`Estimated token count: ${currentTokenCount} / ${DEEPSEEK_CONTEXT_WINDOW}`);

  if (currentTokenCount > CONTEXT_OVERFLOW_THRESHOLD) {
    console.warn("Private chat context overflow detected. Triggering summarization.");
    setShowContextWarning(true); // Show the banner

    // Summarize asynchronously
    deepSeekService.summarizeConversation(chatMessagesForTokenCount)
      .then(summary => {
        setConversationSummary(summary);
      })
      .catch(error => {
        console.error("Summarization failed:", error);
        // Optionally, add an error message to the chat
        const errorSummaryMessage: Message = {
          id: uuidv4(),
          content: "Failed to summarize conversation history. Please start a new chat manually.",
          timestamp: new Date(),
          sender: 'ai'
        };
        setCurrentConversation(prev => prev ? { ...prev, messages: [...prev.messages, errorSummaryMessage] } : null);
      });

    // Add a system message to the current conversation indicating the limit
    const systemMessage: Message = {
        id: uuidv4(),
        content: "Your conversation history is getting very long. A summary is being prepared. Please use the banner above to start a new conversation with the summary.",
        timestamp: new Date(),
        sender: 'ai'
    };
    setCurrentConversation(prev => prev ? { ...prev, messages: [...prev.messages, systemMessage] } : null);
    isProcessingRef.current = false; // Release lock
    return; // Stop here, don't call DeepSeek for this message
  }

  // ... (rest of the DeepSeek streaming logic, using updatedConversationWithUserMessage)
  // Ensure the chatMessages sent to deepSeekService.streamChat are `chatMessagesForTokenCount`
  // as they already include the latest user message.
};
New Function handleStartNewConversationWithSummary:

const handleStartNewConversationWithSummary = async (summary: string) => {
  // Create a new conversation
  await handleNewConversation(); // This will set currentConversation to the new one

  // Wait for the new conversation to be set, then add messages
  setCurrentConversation(prev => {
    if (!prev) return null; // Should not happen if handleNewConversation works

    const aiSummaryMessage: Message = {
      id: uuidv4(),
      content: `Here's a summary of our previous discussion: ${summary}`,
      timestamp: new Date(),
      sender: 'ai'
    };
    const userContinuationMessage: Message = {
      id: uuidv4(),
      content: "Based on this summary, let's continue our discussion.",
      timestamp: new Date(),
      sender: 'user'
    };

    const newMessages = [aiSummaryMessage, userContinuationMessage];

    // Update the new conversation with these messages
    const updatedNewConversation = {
      ...prev,
      messages: newMessages,
      updatedAt: new Date()
    };

    // Persist these initial messages to the backend
    if (ws.socket?.connected && !isGuest) {
      ws.socket.emit('save_conversation', {
        conversationId: updatedNewConversation.id,
        messages: newMessages
      });
    } else if (!isGuest) {
      // Fallback: save via REST API if WebSocket is not available
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
      fetch(`${apiUrl}/save-messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: updatedNewConversation.id,
          messages: newMessages
        })
      }).catch(apiError => console.error('Failed to save initial summary messages via API:', apiError));
    }

    return updatedNewConversation;
  });

  // Clear the warning
  setConversationSummary(null);
  setShowContextWarning(false);
};
Render ConversationContextWarning:

// ... inside PrivateChat's main render function, before ChatHeader
{showContextWarning && conversationSummary && (
  <ConversationContextWarning
    summary={conversationSummary}
    onStartNewConversationWithSummary={handleStartNewConversationWithSummary}
    onDismiss={() => setShowContextWarning(false)}
  />
)}
// ...
F. Modified src/components/PublicThread/PublicThread.tsx:

Imports:

import { estimateTokens, countChatMessagesTokens } from '../../utils/tokenCounter';
import { DEEPSEEK_CONTEXT_WINDOW, CONTEXT_OVERFLOW_THRESHOLD, SUMMARIZATION_PROMPT } from '../../constants/ai';
prepareMessagesForAI (new helper function):

const prepareMessagesForAI = async (targetQuestionId: string): Promise<{ messages: ChatMessage[], summaryAdded: boolean }> => {
  if (!thread) return { messages: [], summaryAdded: false };

  let messages: ChatMessage[] = [];
  let summaryAdded = false;

  messages.push({
    role: 'system',
    content: `You are participating in a public discussion thread where multiple users can ask questions and provide answers. The thread creator can ask multiple questions, and each question can have multiple answers from different users and AI.
Structure:

Original User asks questions (Question 1, Question 2, etc.)

Multiple users and AI can provide answers to each question

You should acknowledge the community context and build upon previous answers when relevant

Address your response to the community, not just the original questioner`
});


const sortedQuestions = [...thread.questions].sort((a, b) =>
  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
);

let questionNumber = 1;
let targetQuestionNumber = 1;

for (const question of sortedQuestions) {
  messages.push({
    role: 'user',
    content: `[Question ${questionNumber} from ${thread.creator.name}]: ${question.content}`
  });

  if (question.id === targetQuestionId) {
    targetQuestionNumber = questionNumber;
  }

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
      messages.push({
        role: 'user',
        content: `[Answer from User${answer.userId?.slice(-4) || 'Unknown'}]: ${answer.content}`
      });
    }
  }
  questionNumber++;
}

const targetQuestion = sortedQuestions.find(q => q.id === targetQuestionId);
if (targetQuestion) {
  messages.push({
    role: 'user',
    content: `Now please provide your answer to Question ${targetQuestionNumber}: "${targetQuestion.content}"`
  });
}

let currentTokenCount = countChatMessagesTokens(messages);
console.log(`Estimated token count for public thread: ${currentTokenCount} / ${DEEPSEEK_CONTEXT_WINDOW}`);

if (currentTokenCount > CONTEXT_OVERFLOW_THRESHOLD) {
    console.warn("Public thread context overflow detected. Summarizing...");
    const summary = await deepSeekService.summarizeConversation(messages);

    const summaryQuestion: Question = {
        id: uuidv4(),
        content: `AI-generated summary of previous discussion: ${summary}`,
        timestamp: new Date(),
        userId: 'ai-system', // A special ID for system-generated content
        threadId: thread.id,
        isSummary: true
    };

    // Prepend to the thread's questions (this will update the UI)
    setThread(prev => prev ? {
        ...prev,
        questions: [summaryQuestion, ...prev.questions]
    } : null);

    // Persist the summary question to the backend
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
      await fetch(`${apiUrl}/threads/${thread.id}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: summaryQuestion.content,
          userId: summaryQuestion.userId,
          isSummary: true // Ensure backend handles this
        })
      });
      console.log('Summary question saved to backend.');
    } catch (error) {
      console.error('Failed to save summary question to backend:', error);
    }

    // Update the messages array for the current AI call to use the summary
    messages = [
        { role: 'system', content: `Here is a summary of the prior conversation: ${summary}` },
        { role: 'user', content: `Now, based on this summary and the current question, please provide your answer to Question ${targetQuestionNumber}: "${targetQuestion.content}"` }
    ];
    summaryAdded = true;
}

return { messages, summaryAdded };
};


handleAskAI Logic:

const handleAskAI = async (questionId: string) => {
  if (isGuest) return;

  if (isAIAnswering[questionId]) {
    console.log('⚠️ AI already answering question:', questionId);
    return;
  }

  try {
    setIsAIAnswering(prev => ({ ...prev, [questionId]: true }));

    streamingRefs.current[questionId] = {
      thinking: '', content: '', isActive: true, thinkingElement: null, contentElement: null, streamingContainer: null,
    };

    // Prepare messages for AI, including summarization if needed
    const { messages: contextMessages, summaryAdded } = await prepareMessagesForAI(questionId);

    // ... (rest of the DeepSeek streaming logic, using contextMessages)
  } catch (error) {
    console.error('Failed to get AI answer:', error);
    setIsAIAnswering(prev => ({ ...prev, [questionId]: false }));

    if (streamingRefs.current[questionId]) {
      streamingRefs.current[questionId].isActive = false;
      delete streamingRefs.current[questionId];
    }
  }
};
G. Modified src/components/PublicThread/QuestionSection.tsx:

Render Logic: Adjust rendering for summary questions.

// ... inside QuestionSection component
// ...
<div className="mb-6">
  <div className="flex items-start space-x-3">
    {question.isSummary ? (
      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
        <span className="text-white text-xs font-bold">AI</span>
      </div>
    ) : (
      <Avatar className="w-8 h-8">
        <AvatarImage src={threadCreator.avatar} />
        <AvatarFallback>{threadCreator.name.charAt(0)}</AvatarFallback>
      </Avatar>
    )}
    <div className="flex-1">
      <div className="flex items-center space-x-2 mb-2">
        <span className="font-medium text-gray-800">
          {question.isSummary ? 'AI System' : threadCreator.name}
        </span>
        <Badge variant="outline" className="text-xs">
          {question.isSummary ? 'Summary' : `Question ${sortOrder === 'newest' ? totalQuestions - questionIndex : questionIndex + 1}`}
        </Badge>
        <span className="text-xs text-gray-500">
          {formatDistanceToNow(question.timestamp)} ago
        </span>
      </div>
      <p className="text-gray-800 leading-relaxed">{question.content}</p>
    </div>
  </div>
</div>

{/* Hide Add Answer section for summary questions */}
{!question.isSummary && (
  <div className="mt-6 pt-4 border-t border-gray-100">
    {/* ... (existing Add Answer section) */}
  </div>
)}
// ...
H. Backend API Modifications (infrastructure/aws/src/handlers/questions.js):

addQuestion Handler: Update to handle the isSummary flag.

// ... inside exports.addQuestion
const requestBody = parseRequestBody(event.body);
const { content, userId, isSummary } = requestBody; // Destructure isSummary

// ... (existing validation)

const question = {
  id: questionId,
  thread_id: threadId,
  content: content.trim(),
  user_id: userId,
  created_at: now,
  is_summary: isSummary || false // Save isSummary flag
};

await dbOperations.put(tables.questions, question);

// ... (existing update thread question count and timestamp)

const newQuestion = {
  id: questionId,
  content: content.trim(),
  timestamp: now,
  userId: userId,
  threadId: threadId,
  isSummary: isSummary || false // Return isSummary flag
};
// ...
This comprehensive strategy addresses context window management for both private and public chats, providing a clear user experience and maintaining data integrity.