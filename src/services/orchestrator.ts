import { UniversalLLMAdapter } from '../llm/universal_adapter';
import { RiskEngine } from '../security/risk_engine';
import { SandboxRuntime } from '../execution/sandbox';
import { getIO } from '../api/server';
import { RiskLevel } from '../domain/schemas';
import { MemoryManager } from './memory_manager';

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
    const memory = new MemoryManager(this.sandbox.pathValidator);
    
    // Setup history for this task session
    const history: { role: 'user' | 'assistant' | 'system', content: string }[] = [];
    
    // Add old history if any, then append the new task
    const pastHistory = memory.getHistory();
    if (pastHistory) {
      history.push({ role: 'system', content: `Previous session history:\n${pastHistory}` });
    }
    history.push({ role: 'user', content: userMessage });
    memory.appendHistory('user', userMessage);

    const systemPrompt = `You are a strict, secure Autonomous OS Agent (like Antigravity). You can research, plan, execute, and debug.
You MUST ALWAYS output ONLY JSON matching this schema:
{
  "action": "research" | "plan" | "execute" | "done",
  "command": "Command to run (only for research/execute)",
  "content": "Detailed plan, rationale, or summary (for plan/done)",
  "is_destructive": boolean (true if command modifies system)
}

Guidelines:
1. 'research': Run safe commands (ls, cat, find, etc.) to understand the environment. You can do this multiple times.
2. 'plan': If the task is complex or you need permission, output a markdown plan in 'content'. Execution pauses until user approves.
3. 'execute': Run commands that modify files, compile code, or install tools. If a command fails, read the error and try again. ALWAYS set is_destructive=true for these.
4. 'done': Task is complete. Summarize what you did in 'content' to update the project context.

Current Project Context:
${memory.getContext()}`;

    io.emit('task_update', { session_id: sessionId, status: 'planning', message: 'Starting autonomous loop...' });

    try {
      while (true) {
        // 1. Generate Action
        const toolCall = await this.llm.generatePlanAndCommand(systemPrompt, history);
        history.push({ role: 'assistant', content: JSON.stringify(toolCall) });
        memory.appendHistory('agent', `Action: ${toolCall.action}\nCommand: ${toolCall.command || 'None'}\nContent: ${toolCall.content || 'None'}`);

        io.emit('task_update', { session_id: sessionId, status: 'plan_ready', result: toolCall });

        // 2. Process Action
        if (toolCall.action === 'done') {
          // Update context
          if (toolCall.content) {
            memory.updateContext(toolCall.content);
          }
          io.emit('task_update', { session_id: sessionId, status: 'completed', result: { message: 'Task finished' } });
          return { status: 'completed' };
        }

        if (toolCall.action === 'plan') {
          // Ask for approval for the plan
          const taskId = crypto.randomUUID();
          io.emit('approval_request', { 
            task_id: taskId, 
            command: toolCall.content, 
            risk_score: 50, 
            risk_level: RiskLevel.MEDIUM, 
            reasons: ["Agent proposed a plan and requires user approval to proceed."] 
          });

          const approved = await this.waitForApproval(taskId);
          if (!approved) {
            const msg = 'User denied the plan. Adjust your plan or ask for clarification.';
            history.push({ role: 'system', content: msg });
            memory.appendHistory('system', msg);
            continue;
          } else {
            const msg = 'User approved the plan. Proceed with execution.';
            history.push({ role: 'system', content: msg });
            memory.appendHistory('system', msg);
            continue;
          }
        }

        // Evaluate risk for research/execute
        const evaluation = this.riskEngine.evaluate({
          command: toolCall.command || '',
          rationale: toolCall.content || '',
          is_destructive: toolCall.is_destructive
        });
        
        let shouldExecute = true;

        if (evaluation.level === RiskLevel.HIGH) {
          const msg = `Task blocked by Risk Engine (HIGH risk). Reasons: ${evaluation.reasons.join(', ')}`;
          io.emit('task_update', { session_id: sessionId, status: 'error', message: msg });
          history.push({ role: 'system', content: msg });
          memory.appendHistory('system', msg);
          shouldExecute = false; // LLM needs to rethink
        } else if (toolCall.action === 'execute' || evaluation.level === RiskLevel.MEDIUM) {
          // Execute actions ALWAYS require HITL unless we tweak it, but for now we'll trigger HITL if execute or medium risk.
          const taskId = crypto.randomUUID();
          io.emit('approval_request', { 
            task_id: taskId, 
            command: toolCall.command, 
            risk_score: evaluation.score, 
            risk_level: evaluation.level, 
            reasons: evaluation.reasons.length ? evaluation.reasons : ['Execution action requested by Agent.']
          });

          shouldExecute = await this.waitForApproval(taskId);
          if (!shouldExecute) {
            const msg = 'Command execution denied by user.';
            history.push({ role: 'system', content: msg });
            memory.appendHistory('system', msg);
          }
        }

        if (shouldExecute && toolCall.command) {
          io.emit('task_update', { session_id: sessionId, status: 'executing', message: `Running: ${toolCall.command}` });
          const result = await this.sandbox.execute(toolCall.command);
          
          const resultStr = `Exit Code: ${result.code}\nStdout:\n${result.stdout}\nStderr:\n${result.stderr}`;
          history.push({ role: 'system', content: resultStr });
          memory.appendHistory('system', resultStr);
          
          io.emit('task_update', { session_id: sessionId, status: 'completed', result: { stdout: result.stdout, stderr: result.stderr } });
        }
      }
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
