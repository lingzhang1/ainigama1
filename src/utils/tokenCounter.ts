import { ChatMessage } from '../services/deepseek';

/**
 * Token Counter Utility
 * 
 * Provides functions to estimate token usage for DeepSeek API calls.
 * Uses a heuristic approach since exact tokenization would require
 * the DeepSeek tokenizer which may not be available client-side.
 */

// Simple heuristic: 4 characters per token for English text
// This is a conservative estimate that works reasonably well for most content
export const estimateTokens = (text: string): number => {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
};

// Count tokens for an array of chat messages
export const countChatMessagesTokens = (messages: ChatMessage[]): number => {
  let totalTokens = 0;
  
  for (const message of messages) {
    // Count tokens for message content
    totalTokens += estimateTokens(message.content);
    
    // Add small overhead for role and structure (approximately 10 tokens per message)
    totalTokens += 10;
  }
  
  return totalTokens;
};

// Estimate tokens for a single message object
export const estimateMessageTokens = (content: string, role: 'user' | 'assistant' | 'system' = 'user'): number => {
  return estimateTokens(content) + 10; // Content + overhead
};

// Check if adding a new message would exceed the threshold
export const wouldExceedThreshold = (currentMessages: ChatMessage[], newMessageContent: string, threshold: number): boolean => {
  const currentTokens = countChatMessagesTokens(currentMessages);
  const newMessageTokens = estimateMessageTokens(newMessageContent);
  return (currentTokens + newMessageTokens) > threshold;
};