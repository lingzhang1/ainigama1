import { createDeepSeek } from '@ai-sdk/deepseek';
import { streamText } from 'ai';
import { SUMMARIZATION_PROMPT } from '../constants/ai';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface StreamingResponse {
  onThinking?: (thinking: string) => void;
  onContent?: (content: string) => void;
  onComplete?: (fullContent: string) => void;
  onError?: (error: Error) => void;
}

export class DeepSeekService {
  private static instance: DeepSeekService;
  private readonly apiKey: string = 'sk-0dcbd0d5eca74684919812e175de65b7';
  private deepseekClient: any;
  
  static getInstance(): DeepSeekService {
    if (!DeepSeekService.instance) {
      DeepSeekService.instance = new DeepSeekService();
    }
    return DeepSeekService.instance;
  }

  constructor() {
    // Initialize DeepSeek client with API key
    this.deepseekClient = createDeepSeek({
      apiKey: this.apiKey
    });
    console.log('DeepSeek service initialized with createDeepSeek and API key');
  }

  async streamChat(
    messages: ChatMessage[],
    callbacks: StreamingResponse
  ): Promise<void> {
    try {
      console.log('Starting DeepSeek stream with createDeepSeek client');

      const result = await streamText({
        model: this.deepseekClient('deepseek-reasoner'),
        system: "You are a helpful assistant that takes in the web for information and replies to the user with correct answer. Use simple english.",
        messages,
      });

      let fullContent = '';
      let fullThinking = '';
      let hasStartedContent = false;
      let hasStartedThinking = false;
      let streamCompleted = false;

      console.log('🚀 Stream started');

      // Use fullStream to handle all delta types
      for await (const delta of result.fullStream) {
        // console.log('📦 Received delta:', delta.type);

        switch (delta.type) {
          case 'start':
            console.log('🎬 Stream start');
            break;

          case 'start-step':
            console.log('📝 Step started:', delta);
            break;

          case 'reasoning-start':
            console.log('🧠 Reasoning phase started');
            if (!hasStartedThinking) {
              hasStartedThinking = true;
              console.log('🧠 First thinking content incoming');
            }
            break;

          case 'reasoning':
            console.log('🧠 Reasoning phase started');
            if (!hasStartedThinking) {
              hasStartedThinking = true;
              console.log('🧠 First thinking content incoming');
            }
            break;

          case 'reasoning-end':
            console.log('🧠 Reasoning phase ended');
            break;

          case 'text-start':
            console.log('🎯 Text phase started');
            if (!hasStartedContent) {
              hasStartedContent = true;
              console.log('🎯 First content incoming');
            }
            break;

          case 'text':
            console.log('🎯 Text phase started');
            if (!hasStartedContent) {
              hasStartedContent = true;
              console.log('🎯 First content incoming');
            }
            break;

          case 'text-end':
            console.log('🎯 Text phase ended');
            break;

          case 'reasoning-delta':
            if (delta.text) {
              fullThinking += delta.text;
              callbacks.onThinking?.(delta.text);
            }
            break;

          case 'text-delta':
            if (delta.text) {
              fullContent += delta.text;
              callbacks.onContent?.(delta.text);
            }
            if (delta.textDelta) {
              fullContent += delta.textDelta;
              callbacks.onContent?.(delta.textDelta);
            }
            break;

          case 'step-delta':
            if (delta.stepDelta) {
              if (delta.stepDelta.type === 'reasoning-delta' && delta.stepDelta.reasoningDelta) {
                fullThinking += delta.stepDelta.reasoningDelta;
                callbacks.onThinking?.(delta.stepDelta.reasoningDelta);
              } else if (delta.stepDelta.type === 'text-delta' && delta.stepDelta.textDelta) {
                fullContent += delta.stepDelta.text;
                callbacks.onContent?.(delta.stepDelta.text);
              }
            }
            break;

          case 'finish-step':
            console.log('✅ Step finished:', delta.finishReason);
            break;

          case 'finish':
            console.log('🏁 Stream finished:', delta.finishReason);
            break;

          default:
            // Only log unhandled types that might be important
            console.log('❓ Unhandled delta type:', delta.type);
            break;
        }
      }

      // Mark stream as completed
      streamCompleted = true;
      console.log('🎉 Stream completed - Content:', fullContent.length, 'chars, Thinking:', fullThinking.length, 'chars');
      
      // Call onComplete with the accumulated content
      if (fullContent.trim()) {
        console.log('✅ Completing with streamed content');
        callbacks.onComplete?.(fullContent);
      } else {
        // If no content was streamed, try to get final text
        console.log('⚠️ No content streamed, trying to get final text...');
        try {
          const finalText = await result.text;
          if (finalText && finalText.trim()) {
            console.log('✅ Got final text:', finalText.length, 'chars');
            callbacks.onComplete?.(finalText);
          } else {
            console.log('❌ No final text available');
            callbacks.onComplete?.('I apologize, but I was unable to generate a complete response. Please try again.');
          }
        } catch (textError) {
          console.error('❌ Error getting final text:', textError);
          callbacks.onComplete?.('I apologize, but I encountered an error while generating the response. Please try again.');
        }
      }

    } catch (error) {
      console.error('DeepSeek streaming error:', error);
      
      // Prevent multiple error callbacks
      if (!streamCompleted) {
        callbacks.onError?.(error as Error);
      }
    }
  }

  // Summarize a conversation when context window is getting full
  async summarizeConversation(messages: ChatMessage[]): Promise<string> {
    console.log('🔄 Starting conversation summarization with DeepSeek...');
    
    try {
      const result = await streamText({
        model: this.deepseekClient('deepseek-reasoner'),
        system: SUMMARIZATION_PROMPT,
        messages: messages,
        maxTokens: 1000 // Limit summary length to ensure it fits in context
      });
      
      const summary = await result.text;
      console.log('✅ Summarization complete:', summary.length, 'characters');
      return summary;
      
    } catch (error) {
      console.error('❌ DeepSeek summarization error:', error);
      throw new Error('Failed to summarize conversation. Please try starting a new conversation manually.');
    }
  }

  // Fallback method for non-streaming requests
  async generateResponse(messages: ChatMessage[]): Promise<string> {
    return new Promise((resolve, reject) => {
      let fullResponse = '';
      
      this.streamChat(messages, {
        onContent: (content) => {
          fullResponse += content;
        },
        onComplete: (content) => {
          resolve(content);
        },
        onError: (error) => {
          reject(error);
        }
      });
    });
  }
}

export const deepSeekService = DeepSeekService.getInstance();