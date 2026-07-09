"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskOrchestrator = void 0;
const server_1 = require("../api/server");
const schemas_1 = require("../domain/schemas");
class TaskOrchestrator {
    llm;
    riskEngine;
    sandbox;
    constructor(llm, riskEngine, sandbox) {
        this.llm = llm;
        this.riskEngine = riskEngine;
        this.sandbox = sandbox;
    }
    async executeTask(sessionId, userMessage) {
        const io = (0, server_1.getIO)();
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
            if (evaluation.level === schemas_1.RiskLevel.HIGH) {
                io.emit('task_update', { session_id: sessionId, status: 'error', message: 'Task blocked by Risk Engine (HIGH risk)' });
                return { status: 'blocked', evaluation };
            }
            if (evaluation.level === schemas_1.RiskLevel.MEDIUM) {
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
        }
        catch (e) {
            io.emit('task_update', { session_id: sessionId, status: 'error', message: e.message || String(e) });
            throw e;
        }
    }
    pendingApprovals = new Map();
    handleApprovalResponse(taskId, decision) {
        const resolver = this.pendingApprovals.get(taskId);
        if (resolver) {
            resolver(decision === 'allow');
            this.pendingApprovals.delete(taskId);
        }
    }
    waitForApproval(taskId) {
        return new Promise((resolve) => {
            this.pendingApprovals.set(taskId, resolve);
        });
    }
}
exports.TaskOrchestrator = TaskOrchestrator;
