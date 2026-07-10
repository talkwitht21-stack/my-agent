import { LLMToolCall, RiskSettings, RiskLevel } from '../domain/schemas';

export class RiskEngine {
  private settings: RiskSettings;

  constructor(settings: RiskSettings) {
    this.settings = settings;
  }

  public evaluate(call: { command?: string; rationale?: string; is_destructive?: boolean }): { score: number; level: RiskLevel; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];
    const commandLower = (call.command || '').toLowerCase();

    // 1. Destructive Flag
    if (call.is_destructive) {
      score += 40;
      reasons.push("LLM flagged operation as destructive");
    }

    // 2. Dangerous Keywords (Semantic parsing)
    const dangerousCommands = ['rm', 'del', 'format', 'sudo', 'icacls', 'chmod', 'chown', 'net user', 'Set-ExecutionPolicy'];
    for (const cmd of dangerousCommands) {
      if (commandLower.includes(cmd)) {
        score += 50;
        reasons.push(`Contains dangerous command/keyword: ${cmd}`);
      }
    }

    // 3. Network operations
    const networkCommands = ['curl', 'wget', 'Invoke-WebRequest', 'ssh', 'scp', 'ftp', 'nc'];
    for (const cmd of networkCommands) {
      if (commandLower.includes(cmd)) {
        score += 30;
        reasons.push(`Contains network/download keyword: ${cmd}`);
      }
    }

    // Cap at 100
    score = Math.min(score, 100);

    let level = RiskLevel.LOW;
    if (score > this.settings.maxScoreRequireHITL) {
      level = RiskLevel.HIGH;
    } else if (score > this.settings.maxScoreAutoApprove) {
      level = RiskLevel.MEDIUM;
    }

    return { score, level, reasons };
  }
}
