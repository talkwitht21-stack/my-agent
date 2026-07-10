"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskOrchestrator = void 0;
const server_1 = require("../api/server");
const schemas_1 = require("../domain/schemas");
const memory_manager_1 = require("./memory_manager");
class TaskOrchestrator {
    llm;
    riskEngine;
    sandbox;
    constructor(llm, riskEngine, sandbox) {
        this.llm = llm;
        this.riskEngine = riskEngine;
        this.sandbox = sandbox;
    }
    /** Hot-reload: replace LLM adapter instance */
    setLLM(newLLM) {
        this.llm = newLLM;
    }
    /** Hot-reload: replace Sandbox runtime instance */
    setSandbox(newSandbox) {
        this.sandbox = newSandbox;
    }
    async executeTask(sessionId, userMessage) {
        const io = (0, server_1.getIO)();
        const memory = new memory_manager_1.MemoryManager(this.sandbox.pathValidator);
        // Setup history for this task session
        const history = [];
        // Add old history if any, then append the new task
        const pastHistory = memory.getHistory();
        if (pastHistory) {
            history.push({ role: 'system', content: `Previous session history:\n${pastHistory}` });
        }
        history.push({ role: 'user', content: userMessage });
        memory.appendHistory('user', userMessage);
        const systemPrompt = `You are a strict, secure Autonomous OS Agent (like Antigravity). You can research, plan, execute, and debug.
You MUST ALWAYS output ONLY raw JSON matching this EXACT schema without any markdown formatting, greetings, or other text:
{
  "action": "research" | "plan" | "execute" | "write_file" | "done",
  "command": "Command to run (for research/execute) OR File path (for write_file)",
  "content": "Detailed plan/summary (for plan/done) OR File content (for write_file)",
  "is_destructive": boolean (true if action modifies system)
}

Guidelines:
1. 'research': Run safe commands (ls, cat, find, etc.) to understand the environment.
2. 'plan': If the task is complex, output a markdown plan in 'content'. Execution pauses for user approval.
3. 'execute': Run commands that modify the system, install tools, etc. ALWAYS set is_destructive=true.
4. 'write_file': Safely write a multi-line file. 'command' is the file path, 'content' is the exact file content (properly escaped newlines). ALWAYS set is_destructive=true.
5. 'done': Task is complete. Summarize in 'content'.

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
                        risk_level: schemas_1.RiskLevel.MEDIUM,
                        reasons: ["Agent proposed a plan and requires user approval to proceed."]
                    });
                    const approved = await this.waitForApproval(taskId);
                    if (!approved) {
                        const msg = 'User denied the plan. Adjust your plan or ask for clarification.';
                        history.push({ role: 'system', content: msg });
                        memory.appendHistory('system', msg);
                        continue;
                    }
                    else {
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
                if (evaluation.level === schemas_1.RiskLevel.HIGH) {
                    const msg = `Task blocked by Risk Engine (HIGH risk). Reasons: ${evaluation.reasons.join(', ')}`;
                    io.emit('task_update', { session_id: sessionId, status: 'error', message: msg });
                    history.push({ role: 'system', content: msg });
                    memory.appendHistory('system', msg);
                    shouldExecute = false; // LLM needs to rethink
                }
                else if (toolCall.action === 'execute' || evaluation.level === schemas_1.RiskLevel.MEDIUM) {
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
                    if (toolCall.action === 'write_file') {
                        io.emit('task_update', { session_id: sessionId, status: 'executing', message: `Writing file: ${toolCall.command}` });
                        const result = await this.sandbox.writeFile(toolCall.command, toolCall.content || '');
                        const resultStr = `File Write [${toolCall.command}] Exit Code: ${result.code}\nStderr:\n${result.stderr || 'Success'}`;
                        history.push({ role: 'system', content: resultStr });
                        memory.appendHistory('system', resultStr);
                        io.emit('task_update', { session_id: sessionId, status: 'completed', result: { message: `File ${toolCall.command} written successfully.` } });
                    }
                    else {
                        io.emit('task_update', { session_id: sessionId, status: 'executing', message: `Running: ${toolCall.command}` });
                        const result = await this.sandbox.execute(toolCall.command);
                        const resultStr = `Exit Code: ${result.code}\nStdout:\n${result.stdout}\nStderr:\n${result.stderr}`;
                        history.push({ role: 'system', content: resultStr });
                        memory.appendHistory('system', resultStr);
                        io.emit('task_update', { session_id: sessionId, status: 'completed', result: { stdout: result.stdout, stderr: result.stderr } });
                    }
                }
            }
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
