import { SSHExecutor, ExecutionResult } from './ssh_client';
import { PathValidator } from '../security/path_validator';

export class SandboxRuntime {
  constructor(
    private ssh: SSHExecutor,
    public pathValidator: PathValidator,
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

  public async writeFile(filePath: string, content: string): Promise<ExecutionResult> {
    const resolvedPath = this.pathValidator.resolveSafe(filePath);
    const b64 = Buffer.from(content).toString('base64');
    
    let cmd = '';
    if (this.isWindows) {
      // In Windows, use powershell to decode base64
      cmd = `powershell -Command "[IO.File]::WriteAllBytes('${resolvedPath}', [Convert]::FromBase64String('${b64}'))"`;
    } else {
      cmd = `echo "${b64}" | base64 -d > "${resolvedPath}"`;
    }
    
    return this.ssh.execute(cmd, '.');
  }
}
