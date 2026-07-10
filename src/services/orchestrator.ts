import { UniversalLLMAdapter } from '../llm/universal_adapter';
import { RiskEngine } from '../security/risk_engine';
import { SandboxRuntime } from '../execution/sandbox';
import { getIO } from '../api/server';
import { RiskLevel } from '../domain/schemas';

export class TaskOrchestrator {
  constructor(
    private llm: UniversalLLMAdapter,
    private riskEngine: RiskEngine,
    private sandbox: SandboxRuntime
  ) {}

  /** Hot-reload: replace LLM adapter instance */
  public setLLM(newLLM: UniversalLLMAdapter): void {
    this.llm = newLLM;
  }

  /** Hot-reload: replace Sandbox runtime instance */
  public setSandbox(newSandbox: SandboxRuntime): void {
    this.sandbox = newSandbox;
  }

  public async executeTask(sessionId: string, userMessage: string): Promise<any> {
    const io = getIO();
    io.emit('task_update', { session_id: sessionId, status: 'planning', message: 'Generating execution plan...' });

    const systemPrompt = `You are a strict, secure OS agent. You will generate a JSON response to solve the user's task.
You MUST output ONLY JSON with the following structure:
{
  "command": "The bash or powershell command to run. Keep it safe.",
  "rationale": "Why you chose this command",
  "is_destructive": boolean
}
Return only JSON, no markdown formatting if possible.`;

    try {
      const plan = await this.llm.generatePlanAndCommand(userMessage, systemPrompt);
      io.emit('task_update', { session_id: sessionId, status: 'plan_ready', result: plan });

      const evaluation = this.riskEngine.evaluate(plan);
      
      if (evaluation.level === RiskLevel.HIGH) {
        io.emit('task_update', { session_id: sessionId, status: 'error', message: 'Task blocked by Risk Engine (HIGH risk)' });
        return { status: 'blocked', evaluation };
      }

      if (evaluation.level === RiskLevel.MEDIUM) {
        // HITL Workflow
        const taskId = crypto.randomUUID();
        io.emit('approval_request', { 
          task_id: taskId, 
          command: plan.command, 
          risk_score: evaluation.score, 
          risk_level: evaluation.level, 
          reasons: evaluation.reasons 
        });

        // Wait for approval via WebSocket (simplified for now via a Promise)
        const approved = await this.waitForApproval(taskId);
        if (!approved) {
          io.emit('task_update', { session_id: sessionId, status: 'error', message: 'Task denied by user' });
          return { status: 'denied', evaluation };
        }
      }

      // Execute
      io.emit('task_update', { session_id: sessionId, status: 'executing', message: `Running command: ${plan.command}` });
      const result = await this.sandbox.execute(plan.command);

      io.emit('task_update', { session_id: sessionId, status: 'completed', result });
      return { status: 'completed', result };

    } catch (e: any) {
      io.emit('task_update', { session_id: sessionId, status: 'error', message: e.message || String(e) });
      throw e;
    }
  }

  private pendingApprovals = new Map<string, (decision: boolean) => void>();

  public handleApprovalResponse(taskId: string, decision: 'allow' | 'deny') {
    const resolver = this.pendingApprovals.get(taskId);
    if (resolver) {
      resolver(decision === 'allow');
      this.pendingApprovals.delete(taskId);
    }
  }

  private waitForApproval(taskId: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.pendingApprovals.set(taskId, resolve);
    });
  }
}
