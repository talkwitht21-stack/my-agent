import { z } from 'zod';

export const TaskRequestSchema = z.object({
  user_message: z.string().min(1),
  session_id: z.string().min(1)
});

export type TaskRequest = z.infer<typeof TaskRequestSchema>;

export const LLMToolCallSchema = z.object({
  command: z.string().describe('The bash/powershell command to execute'),
  rationale: z.string().describe('Why this command is needed'),
  is_destructive: z.boolean().describe('True if this command modifies or deletes data')
});

export type LLMToolCall = z.infer<typeof LLMToolCallSchema>;

export const RiskSettingsSchema = z.object({
  maxScoreAutoApprove: z.number().default(40),
  maxScoreRequireHITL: z.number().default(70),
});

export type RiskSettings = z.infer<typeof RiskSettingsSchema>;

export enum RiskLevel {
  LOW = 'low',       // <= 40
  MEDIUM = 'medium', // 41 - 70
  HIGH = 'high'      // 71 - 100
}
