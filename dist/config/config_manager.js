"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configManager = exports.ConfigManager = void 0;
const settings_1 = require("./settings");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const universal_adapter_1 = require("../llm/universal_adapter");
const ssh_client_1 = require("../execution/ssh_client");
const sandbox_1 = require("../execution/sandbox");
const path_validator_1 = require("../security/path_validator");
class ConfigManager {
    settings;
    envPath;
    orchestrator = null;
    constructor() {
        this.envPath = path_1.default.join(__dirname, '../../.env');
        this.settings = settings_1.AppSettingsSchema.parse(process.env);
    }
    /** Returns current settings with API_KEY masked for display */
    getSettings() {
        const s = { ...this.settings };
        if (s.API_KEY && s.API_KEY.length > 8) {
            s.API_KEY = '•'.repeat(s.API_KEY.length - 8) + s.API_KEY.slice(-8);
        }
        return s;
    }
    /** Returns raw settings (unmasked) for internal use */
    getRawSettings() {
        return { ...this.settings };
    }
    /** Get a single setting value */
    get(key) {
        return this.settings[key];
    }
    /** Register the orchestrator for hot-reload */
    setOrchestrator(orch) {
        this.orchestrator = orch;
    }
    /** Update settings, persist to .env, and hot-reload affected services */
    async updateSettings(partial) {
        // If API_KEY looks masked (contains •), keep the original
        if (partial.API_KEY && partial.API_KEY.includes('•')) {
            delete partial.API_KEY;
        }
        // Remove empty/undefined values
        const cleaned = {};
        for (const [k, v] of Object.entries(partial)) {
            if (v !== undefined && v !== '') {
                cleaned[k] = v;
            }
        }
        // Merge with current
        const merged = { ...this.settings, ...cleaned };
        // Validate
        const result = settings_1.AppSettingsSchema.safeParse(merged);
        if (!result.success) {
            const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
            return { success: false, message: `Validation failed: ${issues}` };
        }
        // Determine what changed
        const llmChanged = 'API_KEY' in cleaned || 'PRIMARY_LLM' in cleaned || 'MODEL_NAME' in cleaned || 'BASE_URL' in cleaned;
        const sshChanged = 'SSH_HOST' in cleaned || 'SSH_PORT' in cleaned || 'SSH_USER' in cleaned || 'SSH_KEY_PATH' in cleaned;
        const sandboxChanged = 'SANDBOX_ROOT' in cleaned;
        // Update in-memory config
        this.settings = result.data;
        // Persist to .env file
        this.writeEnvFile();
        // Hot-reload affected services
        if (this.orchestrator) {
            this.reinitializeServices(llmChanged, sshChanged || sandboxChanged);
        }
        return { success: true, message: 'Settings updated and applied successfully.' };
    }
    /** Persist current settings to .env file */
    writeEnvFile() {
        const lines = [
            `PORT=${this.settings.PORT}`,
            `HOST=${this.settings.HOST}`,
            '',
            `SSH_HOST=${this.settings.SSH_HOST}`,
            `SSH_PORT=${this.settings.SSH_PORT}`,
            `SSH_USER=${this.settings.SSH_USER}`,
            `SSH_KEY_PATH=${this.settings.SSH_KEY_PATH}`,
            '',
            `SANDBOX_ROOT=${this.settings.SANDBOX_ROOT}`,
            '',
            `PRIMARY_LLM=${this.settings.PRIMARY_LLM}`,
            `API_KEY=${this.settings.API_KEY}`,
            `BASE_URL=${this.settings.BASE_URL || ''}`,
            `MODEL_NAME=${this.settings.MODEL_NAME}`,
            `DATABASE_URL=file:./data/agent.db`,
            '',
            `CUSTOM_PROVIDERS='${this.settings.CUSTOM_PROVIDERS}'`,
            `PROJECTS='${this.settings.PROJECTS}'`
        ];
        (0, fs_1.writeFileSync)(this.envPath, lines.join('\n') + '\n');
    }
    /** Recreate LLM/SSH/Sandbox services and inject into orchestrator */
    reinitializeServices(llmChanged, sandboxChanged) {
        if (!this.orchestrator)
            return;
        if (llmChanged) {
            const newLLM = new universal_adapter_1.UniversalLLMAdapter(this.settings.API_KEY, this.settings.PRIMARY_LLM, this.settings.BASE_URL, this.settings.MODEL_NAME);
            this.orchestrator.setLLM(newLLM);
        }
        if (sandboxChanged) {
            const newSSH = new ssh_client_1.SSHExecutor(this.settings.SSH_HOST, this.settings.SSH_PORT, this.settings.SSH_USER, this.settings.SSH_KEY_PATH);
            const newPathValidator = new path_validator_1.PathValidator(this.settings.SANDBOX_ROOT);
            const newSandbox = new sandbox_1.SandboxRuntime(newSSH, newPathValidator, newPathValidator['isWindows']);
            this.orchestrator.setSandbox(newSandbox);
        }
    }
    /** Test SSH connection with current or provided settings */
    async testSSHConnection(params) {
        const host = params?.host || this.settings.SSH_HOST;
        const port = params?.port || this.settings.SSH_PORT;
        const username = params?.username || this.settings.SSH_USER;
        const keyPath = params?.keyPath || this.settings.SSH_KEY_PATH;
        const ssh = new ssh_client_1.SSHExecutor(host, port, username, keyPath);
        try {
            await ssh.connect();
            const result = await ssh.execute('echo "SSH connection successful"', '.');
            ssh.disconnect();
            return { success: true, message: result.stdout.trim() || 'Connected successfully' };
        }
        catch (err) {
            return { success: false, message: err.message || 'Connection failed' };
        }
    }
}
exports.ConfigManager = ConfigManager;
exports.configManager = new ConfigManager();
