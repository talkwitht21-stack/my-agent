import fastify from 'fastify';
import fastifySocketIO from 'fastify-socket.io';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { config } from '../config/settings';
import { TaskRequestSchema } from '../domain/schemas';
import { TaskOrchestrator } from '../services/orchestrator';
import { ConfigManager, configManager } from '../config/config_manager';

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

// ============================================================
// GET /api/server/status — Server info & uptime
// ============================================================
app.get('/api/server/status', async () => {
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
// GET /api/history — Retrieve project history
// ============================================================
app.get('/api/history', async () => {
  try {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    // Resolve sandbox root (handle ~)
    let sandboxRoot = configManager.getSettings().SANDBOX_ROOT;
    if (sandboxRoot.startsWith('~')) {
      sandboxRoot = path.join(os.homedir(), sandboxRoot.slice(1));
    }
    
    const historyPath = path.join(sandboxRoot, '.agent_history.md');
    if (fs.existsSync(historyPath)) {
      const content = fs.readFileSync(historyPath, 'utf-8');
      return { success: true, history: content };
    } else {
      return { success: true, history: '' };
    }
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

// ============================================================
// POST /api/server/update — Git pull + npm install + rebuild
// ============================================================
app.post('/api/server/update', async (_request, reply) => {
  const { exec } = require('child_process');
  const cwd = path.join(__dirname, '../..');

  return new Promise((resolve) => {
    const cmd = 'git pull && npm install --production && npm run build';
    exec(cmd, { cwd, timeout: 120000 }, (error: any, stdout: string, stderr: string) => {
      if (error) {
        resolve({ success: false, message: `Update failed: ${error.message}`, stdout, stderr });
      } else {
        resolve({ success: true, message: 'Update completed successfully.', stdout, stderr });
      }
    });
  });
});

// ============================================================
// POST /api/server/restart — Schedule a graceful restart
// ============================================================
app.post('/api/server/restart', async () => {
  // Respond first, then restart after a brief delay
  setTimeout(() => {
    app.log.info('Server restart requested via Web UI. Exiting...');
    process.exit(0); // systemd Restart=always will bring it back
  }, 1500);
  return { success: true, message: 'Server restarting in 1.5s...' };
});

export const getIO = () => (app as any).io;

