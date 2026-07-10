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
    async writeFile(filePath, content) {
        const resolvedPath = this.pathValidator.resolveSafe(filePath);
        const b64 = Buffer.from(content).toString('base64');
        let cmd = '';
        if (this.isWindows) {
            // In Windows, use powershell to decode base64
            cmd = `powershell -Command "[IO.File]::WriteAllBytes('${resolvedPath}', [Convert]::FromBase64String('${b64}'))"`;
        }
        else {
            cmd = `echo "${b64}" | base64 -d > "${resolvedPath}"`;
        }
        return this.ssh.execute(cmd, '.');
    }
}
exports.SandboxRuntime = SandboxRuntime;
