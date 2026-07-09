import fastify from 'fastify';
import { Server } from 'socket.io';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/settings';
import { TaskRequestSchema } from '../domain/schemas';
import { TaskOrchestrator } from '../services/orchestrator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = fastify({ logger: true });

// Setup Socket.io
let io: Server;
app.register(async (instance) => {
  io = new Server(instance.server, {
    cors: { origin: '*' }
  });

  io.on('connection', (socket) => {
    app.log.info(`Socket connected: ${socket.id}`);
    
    socket.on('approval_response', (data) => {
      // data: { task_id, decision }
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

app.post('/api/tasks', async (request, reply) => {
  try {
    const data = TaskRequestSchema.parse(request.body);
    if (!app.hasDecorator('orchestrator')) {
      throw new Error("Orchestrator not initialized");
    }
    
    const orchestrator: TaskOrchestrator = (app as any).orchestrator;
    
    // Run async, don't await the full task
    orchestrator.executeTask(data.session_id, data.user_message).catch(err => {
      app.log.error(err);
    });

    return { status: 'success', message: 'Task received', session_id: data.session_id };
  } catch (err) {
    return reply.status(400).send({ error: 'Invalid task request' });
  }
});

export const getIO = () => io;
