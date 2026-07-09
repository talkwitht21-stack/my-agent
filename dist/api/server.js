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
exports.app.register(fastify_socket_io_1.default, {
    cors: { origin: '*' }
});
exports.app.ready().then(() => {
    exports.app.io.on('connection', (socket) => {
        exports.app.log.info(`Socket connected: ${socket.id}`);
        socket.on('approval_response', (data) => {
            // data: { task_id, decision }
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
exports.app.post('/api/tasks', async (request, reply) => {
    try {
        const data = schemas_1.TaskRequestSchema.parse(request.body);
        if (!exports.app.hasDecorator('orchestrator')) {
            throw new Error("Orchestrator not initialized");
        }
        const orchestrator = exports.app.orchestrator;
        // Run async, don't await the full task
        orchestrator.executeTask(data.session_id, data.user_message).catch(err => {
            exports.app.log.error(err);
        });
        return { status: 'success', message: 'Task received', session_id: data.session_id };
    }
    catch (err) {
        return reply.status(400).send({ error: 'Invalid task request' });
    }
});
const getIO = () => exports.app.io;
exports.getIO = getIO;
