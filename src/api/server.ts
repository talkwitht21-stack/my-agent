import fastify from 'fastify';
import fastifySocketIO from 'fastify-socket.io';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { config } from '../config/settings';
import { TaskRequestSchema } from '../domain/schemas';
import { TaskOrchestrator } from '../services/orchestrator';
import { ConfigManager } from '../config/config_manager';

export const app = fastify({ logger: true });

// Setup Socket.io
app.register(fastifySocketIO, { cors: { origin: '*' } });

app.ready().then(() => {
  (app as any).io.on('connection', (socket: any) => {
    app.log.info(`Socket connected: ${socket.id}`);
    socket.on('approval_response', (data: any) => {
      if (app.hasDecorator('orchestrator')) {
        (app as any).orchestrator.handleApprovalResponse(data.task_id, data.decision);
      }
    });
    socket.on('disconnect', () => app.log.info(`Socket disconnected: ${socket.id}`));
  });
});

app.register(fastifyStatic, {
  root: path.join(__dirname, '../../frontend'),
  prefix: '/',
});

// ============================================================
// POST /api/tasks — Submit a new task
// ============================================================
app.post('/api/tasks', async (request, reply) => {
  try {
    const data = TaskRequestSchema.parse(request.body);
    if (!app.hasDecorator('orchestrator')) {
      throw new Error("Orchestrator not initialized");
    }
    const orchestrator: TaskOrchestrator = (app as any).orchestrator;
    orchestrator.executeTask(data.session_id, data.user_message).catch(err => {
      app.log.error(err);
    });
    return { status: 'success', message: 'Task received', session_id: data.session_id };
  } catch (err) {
    return reply.status(400).send({ error: 'Invalid task request' });
  }
});

// ============================================================
// GET /api/settings — Get current settings (API key masked)
// ============================================================
app.get('/api/settings', async (_request, reply) => {
  if (!app.hasDecorator('configManager')) {
    return reply.status(500).send({ error: 'ConfigManager not initialized' });
  }
  const cm: ConfigManager = (app as any).configManager;
  return cm.getSettings();
});

// ============================================================
// PUT /api/settings — Update settings (hot-reload + persist)
// ============================================================
app.put('/api/settings', async (request, reply) => {
  if (!app.hasDecorator('configManager')) {
    return reply.status(500).send({ error: 'ConfigManager not initialized' });
  }
  const cm: ConfigManager = (app as any).configManager;
  const body = request.body as Record<string, any>;
  const result = await cm.updateSettings(body);
  if (!result.success) {
    return reply.status(400).send(result);
  }
  return result;
});

// ============================================================
// POST /api/settings/test-ssh — Test SSH connection
// ============================================================
app.post('/api/settings/test-ssh', async (request, reply) => {
  if (!app.hasDecorator('configManager')) {
    return reply.status(500).send({ error: 'ConfigManager not initialized' });
  }
  const cm: ConfigManager = (app as any).configManager;
  const body = (request.body || {}) as Record<string, any>;
  const result = await cm.testSSHConnection({
    host: body.SSH_HOST,
    port: body.SSH_PORT ? Number(body.SSH_PORT) : undefined,
    username: body.SSH_USER,
    keyPath: body.SSH_KEY_PATH,
  });
  return result;
});

export const getIO = () => (app as any).io;
