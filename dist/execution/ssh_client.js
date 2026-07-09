"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SSHExecutor = void 0;
const ssh2_1 = require("ssh2");
const fs_1 = require("fs");
const os_1 = __importDefault(require("os"));
class SSHExecutor {
    host;
    port;
    username;
    keyPath;
    client;
    connected = false;
    constructor(host, port, username, keyPath) {
        this.host = host;
        this.port = port;
        this.username = username;
        this.keyPath = keyPath;
        this.client = new ssh2_1.Client();
    }
    async connect() {
        if (this.connected)
            return;
        return new Promise((resolve, reject) => {
            const resolvedKeyPath = this.keyPath.replace('~', os_1.default.homedir());
            let privateKey;
            try {
                privateKey = (0, fs_1.readFileSync)(resolvedKeyPath);
            }
            catch (e) {
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
    async execute(command, workingDir) {
        if (!this.connected) {
            await this.connect();
        }
        return new Promise((resolve, reject) => {
            // For Windows SSH, we can try to pass the command directly
            // Note: SSH2 doesn't have a direct 'working_dir' argument for exec, 
            // so we must prepend a cd command, or rely on SandboxRuntime to do it.
            this.client.exec(command, (err, stream) => {
                if (err)
                    return reject(err);
                let stdout = '';
                let stderr = '';
                stream.on('close', (code) => {
                    resolve({ stdout, stderr, code });
                }).on('data', (data) => {
                    stdout += data.toString();
                }).stderr.on('data', (data) => {
                    stderr += data.toString();
                });
            });
        });
    }
    disconnect() {
        if (this.connected) {
            this.client.end();
            this.connected = false;
        }
    }
}
exports.SSHExecutor = SSHExecutor;
