"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PathValidator = void 0;
const path_1 = __importDefault(require("path"));
class PathValidator {
    sandboxRoot;
    isWindows;
    constructor(sandboxRoot) {
        this.isWindows = sandboxRoot.includes('\\') || (sandboxRoot.length >= 2 && sandboxRoot[1] === ':');
        // Use path.win32 or path.posix based on the root format
        const pathMod = this.isWindows ? path_1.default.win32 : path_1.default.posix;
        this.sandboxRoot = pathMod.normalize(sandboxRoot);
    }
    validate(targetPath) {
        try {
            const resolved = this.resolveSafe(targetPath);
            return true;
        }
        catch {
            return false;
        }
    }
    resolveSafe(targetPath) {
        const pathMod = this.isWindows ? path_1.default.win32 : path_1.default.posix;
        let normalizedTarget = targetPath;
        if (this.isWindows) {
            normalizedTarget = normalizedTarget.replace(/\//g, '\\');
        }
        let resolved = '';
        if (pathMod.isAbsolute(normalizedTarget)) {
            resolved = pathMod.normalize(normalizedTarget);
        }
        else {
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
exports.PathValidator = PathValidator;
