import OpenAI from 'openai';
import { LLMToolCall, LLMToolCallSchema } from '../domain/schemas';

export class UniversalLLMAdapter {
  private client: OpenAI;
  private modelName: string;

  constructor(apiKey: string, provider: string, customBaseUrl?: string, modelName?: string) {
    let baseURL = customBaseUrl?.trim();
    
    if (!baseURL) {
      switch (provider) {
        case 'groq': baseURL = 'https://api.groq.com/openai/v1'; break;
        case 'deepseek': baseURL = 'https://api.deepseek.com/v1'; break;
        case 'gemini': baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/'; break;
        case 'openai': baseURL = 'https://api.openai.com/v1'; break;
        default: baseURL = undefined; // Do not pass empty string to OpenAI
      }
    } else if (baseURL && !baseURL.startsWith('http://') && !baseURL.startsWith('https://')) {
      baseURL = 'https://' + baseURL; // Auto-prefix https if missing
    }

    this.modelName = modelName || 'llama-3.3-70b-versatile';
    
    const clientOptions: any = { apiKey };
    if (baseURL) {
      clientOptions.baseURL = baseURL;
    }
    
    this.client = new OpenAI(clientOptions);
  }

  public async generatePlanAndCommand(
    systemPrompt: string,
    history: { role: 'user' | 'assistant' | 'system', content: string }[]
  ): Promise<LLMToolCall> {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history
    ] as any[];

    const response = await this.client.chat.completions.create({
      model: this.modelName,
      messages: messages,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from LLM");
    }

    try {
      const parsed = JSON.parse(content);
      return LLMToolCallSchema.parse(parsed);
    } catch (e) {
      throw new Error(`Failed to parse LLM JSON: ${e}. Raw response: ${content}`);
    }
  }
}
