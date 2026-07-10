"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = exports.AppSettingsSchema = void 0;
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.AppSettingsSchema = zod_1.z.object({
    PORT: zod_1.z.coerce.number().default(8000),
    HOST: zod_1.z.string().default('0.0.0.0'),
    SSH_HOST: zod_1.z.string(),
    SSH_PORT: zod_1.z.coerce.number().default(22),
    SSH_USER: zod_1.z.string(),
    SSH_KEY_PATH: zod_1.z.string().default('~/.ssh/id_ed25519'),
    SANDBOX_ROOT: zod_1.z.string().default('~/AI_Sandbox'),
    PRIMARY_LLM: zod_1.z.enum(['openai', 'groq', 'deepseek', 'gemini']).default('groq'),
    API_KEY: zod_1.z.string().min(1),
    BASE_URL: zod_1.z.string().optional(),
    MODEL_NAME: zod_1.z.string().default('llama-3.3-70b-versatile')
});
exports.config = exports.AppSettingsSchema.parse(process.env);
