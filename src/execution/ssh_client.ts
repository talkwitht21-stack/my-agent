import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import os from 'os';

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  code: number;
}

export class SSHExecutor {
  private client: Client;
  private connected: boolean = false;

  constructor(
    private host: string,
    private port: number,
    private username: string,
    private keyPath: string
  ) {
    this.client = new Client();
  }

  public async connect(): Promise<void> {
    if (this.connected) return;
    
    return new Promise((resolve, reject) => {
      const resolvedKeyPath = this.keyPath.replace('~', os.homedir());
      let privateKey;
      try {
        privateKey = readFileSync(resolvedKeyPath);
      } catch (e) {
        return reject(new Error(`Could not read SSH key at ${resolvedKeyPath}: ${e}`));
      }

      this.client.on('ready', () => {
        this.connected = true;
        resolve();
      }).on('error', (err) => {
        reject(err);
      }).connect({
        host: this.host,
        port: this.port,
        username: this.username,
        privateKey
      });
    });
  }

  public async execute(command: string, workingDir: string): Promise<ExecutionResult> {
    if (!this.connected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      // For Windows SSH, we can try to pass the command directly
      // Note: SSH2 doesn't have a direct 'working_dir' argument for exec, 
      // so we must prepend a cd command, or rely on SandboxRuntime to do it.
      this.client.exec(command, (err, stream) => {
        if (err) return reject(err);
        
        let stdout = '';
        let stderr = '';

        stream.on('close', (code: number) => {
          resolve({ stdout, stderr, code });
        }).on('data', (data: Buffer) => {
          stdout += data.toString();
        }).stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
      });
    });
  }

  public disconnect() {
    if (this.connected) {
      this.client.end();
      this.connected = false;
    }
  }
}
