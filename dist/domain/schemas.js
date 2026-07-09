"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskLevel = exports.RiskSettingsSchema = exports.LLMToolCallSchema = exports.TaskRequestSchema = void 0;
const zod_1 = require("zod");
exports.TaskRequestSchema = zod_1.z.object({
    user_message: zod_1.z.string().min(1),
    session_id: zod_1.z.string().min(1)
});
exports.LLMToolCallSchema = zod_1.z.object({
    command: zod_1.z.string().describe('The bash/powershell command to execute'),
    rationale: zod_1.z.string().describe('Why this command is needed'),
    is_destructive: zod_1.z.boolean().describe('True if this command modifies or deletes data')
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
