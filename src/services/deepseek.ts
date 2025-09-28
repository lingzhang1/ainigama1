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
      let hasContent = false;

      // Use fullStream to get both reasoning and content
      for await (const delta of result.fullStream) {
        
        switch (delta.type) {
          case 'text-delta':
            if (delta.textDelta) {
              // Mark that content has started streaming
              if (!hasStartedContent) {
                hasStartedContent = true;
                console.log('🎯 Content streaming started');
              }
              
              fullContent += delta.textDelta;
              callbacks.onContent?.(delta.textDelta);
            }
            break;
            
          case 'reasoning-delta':
            if (delta.text) {
              // Mark that thinking has started
              if (!hasStartedThinking) {
                hasStartedThinking = true;
                console.log('🧠 Thinking streaming started');
              }
              
              fullThinking += delta.text;
              callbacks.onThinking?.(delta.text);
            }
            break;
            
          case 'step-delta':
            if (delta.stepDelta) {
              // Handle different step types
              if (delta.stepDelta.type === 'reasoning-delta' && delta.stepDelta.reasoningDelta) {
                if (!hasStartedThinking) {
                  hasStartedThinking = true;
                  console.log('🧠 Thinking streaming started (step-delta)');
                }
                fullThinking += delta.stepDelta.reasoningDelta;
                callbacks.onThinking?.(delta.stepDelta.reasoningDelta);
              } else if (delta.stepDelta.type === 'reasoning' && delta.stepDelta.reasoning) {
                if (!hasStartedThinking) {
                  hasStartedThinking = true;
                  console.log('🧠 Thinking streaming started (step reasoning)');
                }
                fullThinking += delta.stepDelta.reasoning;
                callbacks.onThinking?.(delta.stepDelta.reasoning);
              }
            }
            break;
            
          case 'step-start':
            console.log('📝 Step started:', delta.stepType);
            break;
            
          case 'step-finish':
            console.log('✅ Step finished:', delta.stepType);
            break;
            
          default:
            console.log('🔍 Unknown delta type:', delta.type, delta);
        }
      }

      console.log('🎉 Stream completed - Content:', fullContent.length, 'chars, Thinking:', fullThinking.length, 'chars');
      
      // Always call onComplete with the final content, even if empty
      if (fullContent.trim()) {
        callbacks.onComplete?.(fullContent);
      } else if (hasStartedThinking) {
        // If we had thinking but no content, try to get final text
        try {
          console.log('⚠️ No content received, trying to get final text...');
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
      } else {
        // No thinking or content received
        console.log('❌ No thinking or content received');
        callbacks.onComplete?.('I apologize, but I was unable to generate a response. Please try again.');
      }

    } catch (error) {
      console.error('DeepSeek streaming error:', error);
      callbacks.onError?.(error as Error);
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