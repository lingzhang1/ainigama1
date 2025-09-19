import { deepseek } from '@ai-sdk/deepseek';
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
  
  static getInstance(): DeepSeekService {
    if (!DeepSeekService.instance) {
      DeepSeekService.instance = new DeepSeekService();
    }
    return DeepSeekService.instance;
  }

  constructor() {
    // API key is hardcoded for production environment
    console.log('DeepSeek service initialized with API key');
  }

  async streamChat(
    messages: ChatMessage[],
    callbacks: StreamingResponse
  ): Promise<void> {
    try {
      console.log('Starting DeepSeek stream with API key:', this.apiKey.substring(0, 10) + '...');

      const result = await streamText({
        model: deepseek('deepseek-reasoner', { apiKey: this.apiKey }),
        system: "You are a helpful assistant that takes in the web for information and replies to the user with correct answer. Use simple english.",
        messages,
      });

      let fullContent = '';
      let hasContent = false;

      // Use fullStream to get both reasoning and content
      for await (const delta of result.fullStream) {
        
        switch (delta.type) {
          case 'text-delta':
            if (delta.textDelta) {
              fullContent += delta.textDelta;
              hasContent = true;
              callbacks.onContent?.(delta.textDelta);
            }
            break;
          case 'reasoning-delta':
            if (delta.text) {
              callbacks.onThinking?.(delta.text);
            }
            break;
          case 'step-delta':
            if (delta.stepDelta) {
              // Handle different step types
              if (delta.stepDelta.type === 'reasoning-delta' && delta.stepDelta.reasoningDelta) {
                callbacks.onThinking?.(delta.stepDelta.reasoningDelta);
              } else if (delta.stepDelta.type === 'reasoning' && delta.stepDelta.reasoning) {
                callbacks.onThinking?.(delta.stepDelta.reasoning);
              }
            }
            break;
          case 'step-start':
            break;
          case 'step-finish':
            break;
          default:
            console.log('Unknown delta type:', delta.type, delta);
        }
      }

      // Ensure we have content before completing
      if (hasContent && fullContent.trim()) {
        callbacks.onComplete?.(fullContent);
      } else {
        // Fallback: try to get the final text if fullStream didn't provide content
        const finalText = await result.text;
        if (finalText && finalText.trim()) {
          callbacks.onComplete?.(finalText);
        } else {
          callbacks.onComplete?.('No response generated');
        }
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