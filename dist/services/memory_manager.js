"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryManager = void 0;
const fs_1 = require("fs");
class MemoryManager {
    pathValidator;
    historyFile;
    contextFile;
    constructor(pathValidator) {
        this.pathValidator = pathValidator;
        // Both files are securely anchored in the Sandbox Root
        this.historyFile = this.pathValidator.resolveSafe('.agent_history.md');
        this.contextFile = this.pathValidator.resolveSafe('.agent_context.md');
    }
    getContext() {
        try {
            if ((0, fs_1.existsSync)(this.contextFile)) {
                return (0, fs_1.readFileSync)(this.contextFile, 'utf8');
            }
        }
        catch (e) {
            // ignore
        }
        return 'No context available yet.';
    }
    updateContext(context) {
        (0, fs_1.writeFileSync)(this.contextFile, context, 'utf8');
    }
    getHistory() {
        try {
            if ((0, fs_1.existsSync)(this.historyFile)) {
                // Read the history. If it's too large, we could truncate, but let's return the whole file for now.
                return (0, fs_1.readFileSync)(this.historyFile, 'utf8');
            }
        }
        catch (e) {
            // ignore
        }
        return '';
    }
    appendHistory(role, content) {
        const timestamp = new Date().toISOString();
        const entry = `\n### [${timestamp}] ${role.toUpperCase()}\n${content}\n`;
        (0, fs_1.appendFileSync)(this.historyFile, entry, 'utf8');
    }
    clearHistory() {
        if ((0, fs_1.existsSync)(this.historyFile)) {
            (0, fs_1.writeFileSync)(this.historyFile, '', 'utf8');
        }
    }
}
exports.MemoryManager = MemoryManager;
