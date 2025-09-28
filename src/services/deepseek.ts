import { createDeepSeek } from '@ai-sdk/deepseek';
import { streamText } from 'ai';

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
      let isThinkingPhase = false;
      // Try different streaming approaches
      console.log('🔄 Attempting textStream approach...');
      
      try {
        // First try: Use textStream for content
        for await (const textDelta of result.textStream) {
          if (!hasStartedContent) {
            hasStartedContent = true;
            console.log('🎯 Content streaming started via textStream');
          }
          
          fullContent += textDelta;
          console.log('📝 Content delta via textStream:', textDelta.length, 'chars');
          callbacks.onContent?.(textDelta);
        }
        
        console.log('✅ TextStream completed with content:', fullContent.length, 'chars');
      } catch (textStreamError) {
        console.log('⚠️ TextStream failed, trying fullStream:', textStreamError.message);
        
        // Fallback: Use fullStream
        for await (const delta of result.fullStream) {
          switch (delta.type) {
            case 'reasoning-delta':
              if (delta.text) {
                if (!hasStartedThinking) {
                  hasStartedThinking = true;
                  console.log('🧠 Thinking streaming started');
                }
                fullThinking += delta.text;
                console.log('🧠 Thinking delta:', delta.text.length, 'chars');
                callbacks.onThinking?.(delta.text);
              }
              break;
              
            case 'text-delta':
              if (delta.textDelta) {
                if (!hasStartedContent) {
                  hasStartedContent = true;
                  console.log('🎯 Content streaming started via fullStream');
                }
                fullContent += delta.textDelta;
                console.log('📝 Content delta via fullStream:', delta.textDelta.length, 'chars');
                callbacks.onContent?.(delta.textDelta);
              }
              break;
              
            case 'step-delta':
              if (delta.stepDelta) {
                if (delta.stepDelta.type === 'reasoning-delta' && delta.stepDelta.reasoningDelta) {
                  if (!hasStartedThinking) {
                    hasStartedThinking = true;
                    console.log('🧠 Thinking streaming started (step-delta)');
                  }
                  fullThinking += delta.stepDelta.reasoningDelta;
                  console.log('🧠 Step thinking delta:', delta.stepDelta.reasoningDelta.length, 'chars');
                  callbacks.onThinking?.(delta.stepDelta.reasoningDelta);
                } else if (delta.stepDelta.type === 'text-delta' && delta.stepDelta.textDelta) {
                  if (!hasStartedContent) {
                    hasStartedContent = true;
                    console.log('🎯 Content streaming started (step-delta)');
                  }
                  fullContent += delta.stepDelta.textDelta;
                  console.log('📝 Step content delta:', delta.stepDelta.textDelta.length, 'chars');
                  callbacks.onContent?.(delta.stepDelta.textDelta);
                }
              }
              break;
              
            default:
              // Ignore other delta types for cleaner logs
              break;
          }
        }
      }
            break;
            
          default:
            console.log('❓ Unhandled delta type:', delta.type, delta);
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