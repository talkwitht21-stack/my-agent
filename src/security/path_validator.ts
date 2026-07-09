import path from 'path';

export class PathValidator {
  private sandboxRoot: string;
  private isWindows: boolean;

  constructor(sandboxRoot: string) {
    this.isWindows = sandboxRoot.includes('\\') || (sandboxRoot.length >= 2 && sandboxRoot[1] === ':');
    
    // Use path.win32 or path.posix based on the root format
    const pathMod = this.isWindows ? path.win32 : path.posix;
    this.sandboxRoot = pathMod.normalize(sandboxRoot);
  }

  public validate(targetPath: string): boolean {
    try {
      const resolved = this.resolveSafe(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  public resolveSafe(targetPath: string): string {
    const pathMod = this.isWindows ? path.win32 : path.posix;
    let normalizedTarget = targetPath;
    
    if (this.isWindows) {
      normalizedTarget = normalizedTarget.replace(/\//g, '\\');
    }

    let resolved = '';
    if (pathMod.isAbsolute(normalizedTarget)) {
      resolved = pathMod.normalize(normalizedTarget);
    } else {
      resolved = pathMod.normalize(pathMod.join(this.sandboxRoot, normalizedTarget));
    }

    const isSafe = this.isWindows 
      ? resolved.toLowerCase().startsWith(this.sandboxRoot.toLowerCase())
      : resolved.startsWith(this.sandboxRoot);

    if (!isSafe) {
      throw new Error(`Path '${targetPath}' resolves outside sandbox '${this.sandboxRoot}'`);
    }

    return resolved;
  }
}
