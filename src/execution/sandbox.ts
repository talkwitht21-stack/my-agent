import { SSHExecutor, ExecutionResult } from './ssh_client';
import { PathValidator } from '../security/path_validator';

export class SandboxRuntime {
  constructor(
    private ssh: SSHExecutor,
    private pathValidator: PathValidator,
    private isWindows: boolean
  ) {}

  public async execute(command: string, targetDir: string = '.'): Promise<ExecutionResult> {
    const resolvedPath = this.pathValidator.resolveSafe(targetDir);
    
    let sandboxedCmd = '';
    if (this.isWindows) {
      sandboxedCmd = `cd /d "${resolvedPath}" && ${command}`;
    } else {
      sandboxedCmd = `cd "${resolvedPath}" && ${command}`;
    }

    // Wrap output with a boundary
    const wrappedCmd = `echo ========== UNTRUSTED TOOL OUTPUT ========== && ${sandboxedCmd}`;
    
    return this.ssh.execute(wrappedCmd, resolvedPath);
  }
}
