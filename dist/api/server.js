"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIO = exports.app = void 0;
const fastify_1 = __importDefault(require("fastify"));
const fastify_socket_io_1 = __importDefault(require("fastify-socket.io"));
const static_1 = __importDefault(require("@fastify/static"));
const path_1 = __importDefault(require("path"));
const schemas_1 = require("../domain/schemas");
exports.app = (0, fastify_1.default)({ logger: true });
// Setup Socket.io
exports.app.register(fastify_socket_io_1.default, { cors: { origin: '*' } });
exports.app.ready().then(() => {
    exports.app.io.on('connection', (socket) => {
        exports.app.log.info(`Socket connected: ${socket.id}`);
        socket.on('approval_response', (data) => {
            if (exports.app.hasDecorator('orchestrator')) {
                exports.app.orchestrator.handleApprovalResponse(data.task_id, data.decision);
            }
        });
        socket.on('disconnect', () => exports.app.log.info(`Socket disconnected: ${socket.id}`));
    });
});
exports.app.register(static_1.default, {
    root: path_1.default.join(__dirname, '../../frontend'),
    prefix: '/',
});
// ============================================================
// POST /api/tasks — Submit a new task
// ============================================================
exports.app.post('/api/tasks', async (request, reply) => {
    try {
        const data = schemas_1.TaskRequestSchema.parse(request.body);
        if (!exports.app.hasDecorator('orchestrator')) {
            throw new Error("Orchestrator not initialized");
        }
        const orchestrator = exports.app.orchestrator;
        orchestrator.executeTask(data.session_id, data.user_message).catch(err => {
            exports.app.log.error(err);
        });
        return { status: 'success', message: 'Task received', session_id: data.session_id };
    }
    catch (err) {
        return reply.status(400).send({ error: 'Invalid task request' });
    }
});
// ============================================================
// GET /api/settings — Get current settings (API key masked)
// ============================================================
exports.app.get('/api/settings', async (_request, reply) => {
    if (!exports.app.hasDecorator('configManager')) {
        return reply.status(500).send({ error: 'ConfigManager not initialized' });
    }
    const cm = exports.app.configManager;
    return cm.getSettings();
});
// ============================================================
// PUT /api/settings — Update settings (hot-reload + persist)
// ============================================================
exports.app.put('/api/settings', async (request, reply) => {
    if (!exports.app.hasDecorator('configManager')) {
        return reply.status(500).send({ error: 'ConfigManager not initialized' });
    }
    const cm = exports.app.configManager;
    const body = request.body;
    const result = await cm.updateSettings(body);
    if (!result.success) {
        return reply.status(400).send(result);
    }
    return result;
});
// ============================================================
// POST /api/settings/test-ssh — Test SSH connection
// ============================================================
exports.app.post('/api/settings/test-ssh', async (request, reply) => {
    if (!exports.app.hasDecorator('configManager')) {
        return reply.status(500).send({ error: 'ConfigManager not initialized' });
    }
    const cm = exports.app.configManager;
    const body = (request.body || {});
    const result = await cm.testSSHConnection({
        host: body.SSH_HOST,
        port: body.SSH_PORT ? Number(body.SSH_PORT) : undefined,
        username: body.SSH_USER,
        keyPath: body.SSH_KEY_PATH,
    });
    return result;
});
// ============================================================
// GET /api/server/status — Server info & uptime
// ============================================================
exports.app.get('/api/server/status', async () => {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const mins = Math.floor((uptime % 3600) / 60);
    const secs = Math.floor(uptime % 60);
    return {
        status: 'running',
        uptime: `${hours}h ${mins}m ${secs}s`,
        uptimeSeconds: Math.floor(uptime),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
        pid: process.pid,
    };
});
// ============================================================
// POST /api/server/update — Git pull + npm install + rebuild
// ============================================================
exports.app.post('/api/server/update', async (_request, reply) => {
    const { exec } = require('child_process');
    const cwd = path_1.default.join(__dirname, '../..');
    return new Promise((resolve) => {
        const cmd = 'git pull && npm install --production && npm run build';
        exec(cmd, { cwd, timeout: 120000 }, (error, stdout, stderr) => {
            if (error) {
                resolve({ success: false, message: `Update failed: ${error.message}`, stdout, stderr });
            }
            else {
                resolve({ success: true, message: 'Update completed successfully.', stdout, stderr });
            }
        });
    });
});
// ============================================================
// POST /api/server/restart — Schedule a graceful restart
// ============================================================
exports.app.post('/api/server/restart', async () => {
    // Respond first, then restart after a brief delay
    setTimeout(() => {
        exports.app.log.info('Server restart requested via Web UI. Exiting...');
        process.exit(0); // systemd Restart=always will bring it back
    }, 1500);
    return { success: true, message: 'Server restarting in 1.5s...' };
});
const getIO = () => exports.app.io;
exports.getIO = getIO;
