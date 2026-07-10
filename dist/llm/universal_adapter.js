"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UniversalLLMAdapter = void 0;
const openai_1 = __importDefault(require("openai"));
const schemas_1 = require("../domain/schemas");
class UniversalLLMAdapter {
    client;
    modelName;
    constructor(apiKey, provider, customBaseUrl, modelName) {
        let baseURL = customBaseUrl?.trim();
        if (!baseURL) {
            switch (provider) {
                case 'groq':
                    baseURL = 'https://api.groq.com/openai/v1';
                    break;
                case 'deepseek':
                    baseURL = 'https://api.deepseek.com/v1';
                    break;
                case 'gemini':
                    baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
                    break;
                case 'openai':
                    baseURL = 'https://api.openai.com/v1';
                    break;
                default: baseURL = undefined; // Do not pass empty string to OpenAI
            }
        }
        else if (baseURL && !baseURL.startsWith('http://') && !baseURL.startsWith('https://')) {
            baseURL = 'https://' + baseURL; // Auto-prefix https if missing
        }
        this.modelName = modelName || 'llama-3.3-70b-versatile';
        const clientOptions = { apiKey };
        if (baseURL) {
            clientOptions.baseURL = baseURL;
        }
        this.client = new openai_1.default(clientOptions);
    }
    async generatePlanAndCommand(systemPrompt, history) {
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history
        ];
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
            return schemas_1.LLMToolCallSchema.parse(parsed);
        }
        catch (e) {
            throw new Error(`Failed to parse LLM JSON: ${e}. Raw response: ${content}`);
        }
    }
}
exports.UniversalLLMAdapter = UniversalLLMAdapter;
