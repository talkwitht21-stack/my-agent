import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { PathValidator } from '../security/path_validator';
import path from 'path';

export class MemoryManager {
  private historyFile: string;
  private contextFile: string;

  constructor(private pathValidator: PathValidator) {
    // Both files are securely anchored in the Sandbox Root
    this.historyFile = this.pathValidator.resolveSafe('.agent_history.md');
    this.contextFile = this.pathValidator.resolveSafe('.agent_context.md');
  }

  public getContext(): string {
    try {
      if (existsSync(this.contextFile)) {
        return readFileSync(this.contextFile, 'utf8');
      }
    } catch (e) {
      // ignore
    }
    return 'No context available yet.';
  }

  public updateContext(context: string): void {
    writeFileSync(this.contextFile, context, 'utf8');
  }

  public getHistory(): string {
    try {
      if (existsSync(this.historyFile)) {
        // Read the history. If it's too large, we could truncate, but let's return the whole file for now.
        return readFileSync(this.historyFile, 'utf8');
      }
    } catch (e) {
      // ignore
    }
    return '';
  }

  public appendHistory(role: 'user' | 'agent' | 'system', content: string): void {
    const timestamp = new Date().toISOString();
    const entry = `\n### [${timestamp}] ${role.toUpperCase()}\n${content}\n`;
    appendFileSync(this.historyFile, entry, 'utf8');
  }

  public clearHistory(): void {
    if (existsSync(this.historyFile)) {
      writeFileSync(this.historyFile, '', 'utf8');
    }
  }
}
