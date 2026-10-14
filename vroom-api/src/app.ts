import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { dbPlugin } from './plugins/db.js';
import { redisPlugin } from './plugins/redis.js';
import { authRoutes } from './routes/auth.js';
import { productsRoutes } from './routes/products.js';
import { ordersRoutes } from './routes/orders.js';
import { paymentsRoutes } from './routes/payments.js';
import { setupSocket } from './socket/tracking.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport:
        process.env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // Registrar plugin CORS
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // Registrar plugins de base de datos y Redis
  await app.register(dbPlugin);
  await app.register(redisPlugin);

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Registrar rutas
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(productsRoutes, { prefix: '/products' });
  await app.register(ordersRoutes, { prefix: '/orders' });
  await app.register(paymentsRoutes, { prefix: '/payments' });

  // Configurar Socket.io
  setupSocket(app);

  // Manejo global de errores
  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);
    
    if (error.validation) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: error.message,
        code: 'VALIDATION_ERROR',
      });
    }
    
    return reply.status(error.statusCode || 500).send({
      error: error.name || 'Internal Server Error',
      message: error.message,
      code: error.code || 'INTERNAL_ERROR',
    });
  });

  return app;
}