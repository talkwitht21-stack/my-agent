"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskLevel = exports.RiskSettingsSchema = exports.LLMToolCallSchema = exports.TaskRequestSchema = void 0;
const zod_1 = require("zod");
exports.TaskRequestSchema = zod_1.z.object({
    user_message: zod_1.z.string().min(1),
    session_id: zod_1.z.string().min(1)
});
exports.LLMToolCallSchema = zod_1.z.object({
    action: zod_1.z.enum(['research', 'plan', 'execute', 'done']).describe('The action to perform'),
    command: zod_1.z.string().optional().describe('The bash/powershell command to execute (for research or execute)'),
    content: zod_1.z.string().optional().describe('Detailed plan, rationale, or completion summary'),
    is_destructive: zod_1.z.boolean().default(false).describe('True if this command modifies or deletes data')
});
exports.RiskSettingsSchema = zod_1.z.object({
    maxScoreAutoApprove: zod_1.z.number().default(40),
    maxScoreRequireHITL: zod_1.z.number().default(70),
});
var RiskLevel;
(function (RiskLevel) {
    RiskLevel["LOW"] = "low";
    RiskLevel["MEDIUM"] = "medium";
    RiskLevel["HIGH"] = "high"; // 71 - 100
})(RiskLevel || (exports.RiskLevel = RiskLevel = {}));
