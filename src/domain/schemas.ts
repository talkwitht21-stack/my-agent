import { z } from 'zod';

export const TaskRequestSchema = z.object({
  user_message: z.string().min(1),
  session_id: z.string().min(1)
});

export type TaskRequest = z.infer<typeof TaskRequestSchema>;

export const LLMToolCallSchema = z.object({
  action: z.enum(['research', 'plan', 'execute', 'write_file', 'done']).describe('The action to perform'),
  command: z.string().optional().describe('The bash/powershell command to execute, OR file path for write_file'),
  content: z.string().optional().describe('Detailed plan, rationale, summary, OR file content for write_file'),
  is_destructive: z.boolean().default(false).describe('True if this command modifies or deletes data')
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
