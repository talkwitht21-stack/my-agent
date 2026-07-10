import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const AppSettingsSchema = z.object({
  PORT: z.coerce.number().default(8000),
  HOST: z.string().default('0.0.0.0'),
  
  SSH_HOST: z.string(),
  SSH_PORT: z.coerce.number().default(22),
  SSH_USER: z.string(),
  SSH_KEY_PATH: z.string().default('~/.ssh/id_ed25519'),
  
  SANDBOX_ROOT: z.string().default('~/AI_Sandbox'),
  
  PRIMARY_LLM: z.enum(['openai', 'groq', 'deepseek', 'gemini']).default('groq'),
  API_KEY: z.string().min(1),
  BASE_URL: z.string().optional(),
  MODEL_NAME: z.string().default('llama-3.3-70b-versatile')
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const config = AppSettingsSchema.parse(process.env);
