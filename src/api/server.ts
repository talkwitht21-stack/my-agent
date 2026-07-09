import fastify from 'fastify';
import fastifySocketIO from 'fastify-socket.io';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { config } from '../config/settings';
import { TaskRequestSchema } from '../domain/schemas';
import { TaskOrchestrator } from '../services/orchestrator';

export const app = fastify({ logger: true });

// Setup Socket.io
app.register(fastifySocketIO, {
  cors: { origin: '*' }
});

app.ready().then(() => {
  (app as any).io.on('connection', (socket: any) => {
    app.log.info(`Socket connected: ${socket.id}`);
    
    socket.on('approval_response', (data: any) => {
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

export const getIO = () => (app as any).io;
