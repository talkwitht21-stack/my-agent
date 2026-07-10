import { z } from 'zod';
import { AppSettingsSchema, type AppSettings } from './settings';
import { writeFileSync } from 'fs';
import path from 'path';
import { UniversalLLMAdapter } from '../llm/universal_adapter';
import { SSHExecutor } from '../execution/ssh_client';
import { SandboxRuntime } from '../execution/sandbox';
import { PathValidator } from '../security/path_validator';
import { TaskOrchestrator } from '../services/orchestrator';

export class ConfigManager {
  private settings: AppSettings;
  private envPath: string;
  private orchestrator: TaskOrchestrator | null = null;

  constructor() {
    this.envPath = path.join(__dirname, '../../.env');
    this.settings = AppSettingsSchema.parse(process.env);
  }

  /** Returns current settings with API_KEY masked for display */
  public getSettings(): Record<string, any> {
    const s: Record<string, any> = { ...this.settings };
    if (s.API_KEY && s.API_KEY.length > 8) {
      s.API_KEY = '•'.repeat(s.API_KEY.length - 8) + s.API_KEY.slice(-8);
    }
    return s;
  }

  /** Returns raw settings (unmasked) for internal use */
  public getRawSettings(): AppSettings {
    return { ...this.settings };
  }

  /** Get a single setting value */
  public get<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.settings[key];
  }

  /** Register the orchestrator for hot-reload */
  public setOrchestrator(orch: TaskOrchestrator) {
    this.orchestrator = orch;
  }

  /** Update settings, persist to .env, and hot-reload affected services */
  public async updateSettings(partial: Partial<AppSettings>): Promise<{ success: boolean; message: string }> {
    // If API_KEY looks masked (contains •), keep the original
    if (partial.API_KEY && partial.API_KEY.includes('•')) {
      delete partial.API_KEY;
    }

    // Remove empty/undefined values
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(partial)) {
      if (v !== undefined && v !== '') {
        cleaned[k] = v;
      }
    }

    // Merge with current
    const merged = { ...this.settings, ...cleaned };

    // Validate
    const result = AppSettingsSchema.safeParse(merged);
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
  private writeEnvFile(): void {
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
      `PROJECTS='${this.settings.PROJECTS}'`,
      `PROVIDER_CONFIGS='${this.settings.PROVIDER_CONFIGS}'`
    ];
    writeFileSync(this.envPath, lines.join('\n') + '\n');
  }

  /** Recreate LLM/SSH/Sandbox services and inject into orchestrator */
  private reinitializeServices(llmChanged: boolean, sandboxChanged: boolean): void {
    if (!this.orchestrator) return;

    if (llmChanged) {
      const newLLM = new UniversalLLMAdapter(
        this.settings.API_KEY,
        this.settings.PRIMARY_LLM,
        this.settings.BASE_URL,
        this.settings.MODEL_NAME
      );
      this.orchestrator.setLLM(newLLM);
    }

    if (sandboxChanged) {
      const newSSH = new SSHExecutor(
        this.settings.SSH_HOST,
        this.settings.SSH_PORT,
        this.settings.SSH_USER,
        this.settings.SSH_KEY_PATH
      );
      const newPathValidator = new PathValidator(this.settings.SANDBOX_ROOT);
      const newSandbox = new SandboxRuntime(newSSH, newPathValidator, (newPathValidator as any)['isWindows']);
      this.orchestrator.setSandbox(newSandbox);
    }
  }

  /** Test SSH connection with current or provided settings */
  public async testSSHConnection(params?: {
    host?: string; port?: number; username?: string; keyPath?: string;
  }): Promise<{ success: boolean; message: string }> {
    const host = params?.host || this.settings.SSH_HOST;
    const port = params?.port || this.settings.SSH_PORT;
    const username = params?.username || this.settings.SSH_USER;
    const keyPath = params?.keyPath || this.settings.SSH_KEY_PATH;

    const ssh = new SSHExecutor(host, port, username, keyPath);
    try {
      await ssh.connect();
      const result = await ssh.execute('echo "SSH connection successful"', '.');
      ssh.disconnect();
      return { success: true, message: result.stdout.trim() || 'Connected successfully' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  }
}

export const configManager = new ConfigManager();
