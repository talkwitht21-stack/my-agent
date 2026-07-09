"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SandboxRuntime = void 0;
class SandboxRuntime {
    ssh;
    pathValidator;
    isWindows;
    constructor(ssh, pathValidator, isWindows) {
        this.ssh = ssh;
        this.pathValidator = pathValidator;
        this.isWindows = isWindows;
    }
    async execute(command, targetDir = '.') {
        const resolvedPath = this.pathValidator.resolveSafe(targetDir);
        let sandboxedCmd = '';
        if (this.isWindows) {
            sandboxedCmd = `cd /d "${resolvedPath}" && ${command}`;
        }
        else {
            sandboxedCmd = `cd "${resolvedPath}" && ${command}`;
        }
        // Wrap output with a boundary
        const wrappedCmd = `echo ========== UNTRUSTED TOOL OUTPUT ========== && ${sandboxedCmd}`;
        return this.ssh.execute(wrappedCmd, resolvedPath);
    }
}
exports.SandboxRuntime = SandboxRuntime;
