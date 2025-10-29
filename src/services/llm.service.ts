import { Injectable } from '@nestjs/common';

export interface LLMRequest {
  model: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Mock LLM Service - simplified interface from your actual LLM service
 */
@Injectable()
export class LLMService {
  async executePrompt(request: LLMRequest): Promise<LLMResponse> {
    // Mock LLM response with realistic delay
    await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));

    // Simulate different responses based on prompt content
    let responseContent = 'Mock LLM response';

    if (request.prompt.includes('novelty')) {
      responseContent = 'This invention shows moderate novelty with some innovative aspects...';
    } else if (request.prompt.includes('feasibility')) {
      responseContent = 'The technical feasibility appears strong with current technology...';
    } else if (request.prompt.includes('impact')) {
      responseContent = 'The potential impact could be significant in the target market...';
    } else if (request.prompt.includes('monetization')) {
      responseContent = 'Revenue opportunities exist through licensing and direct sales...';
    }

    return {
      content: responseContent,
      usage: {
        completionTokens: Math.floor(Math.random() * 200) + 100,
        promptTokens: Math.floor(Math.random() * 100) + 50,
        totalTokens: Math.floor(Math.random() * 300) + 150,
      },
    };
  }

  async *streamCompletion(
    request: LLMRequest,
  ): AsyncIterable<{ content: string; isComplete: boolean }> {
    const fullResponse = await this.executePrompt(request);
    const words = fullResponse.content.split(' ');

    let currentContent = '';
    for (const word of words) {
      currentContent += (currentContent ? ' ' : '') + word;
      yield { content: word + ' ', isComplete: false };
      await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 100));
    }

    yield { content: '', isComplete: true };
  }
}
