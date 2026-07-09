import OpenAI from 'openai';
import { LLMToolCall, LLMToolCallSchema } from '../domain/schemas';

export class UniversalLLMAdapter {
  private client: OpenAI;
  private modelName: string;

  constructor(apiKey: string, provider: 'openai' | 'groq' | 'deepseek' | 'gemini', customBaseUrl?: string, modelName?: string) {
    let baseURL = customBaseUrl;
    
    if (!baseURL) {
      switch (provider) {
        case 'groq': baseURL = 'https://api.groq.com/openai/v1'; break;
        case 'deepseek': baseURL = 'https://api.deepseek.com/v1'; break;
        case 'gemini': baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/'; break;
        case 'openai': baseURL = 'https://api.openai.com/v1'; break;
      }
    }

    this.modelName = modelName || 'llama3-70b-8192'; // Default to a groq model
    
    this.client = new OpenAI({
      apiKey,
      baseURL,
    });
  }

  public async generatePlanAndCommand(taskContext: string, systemPrompt: string): Promise<LLMToolCall> {
    const response = await this.client.chat.completions.create({
      model: this.modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: taskContext }
      ],
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
      throw new Error(`Failed to parse LLM JSON: ${e}`);
    }
  }
}
