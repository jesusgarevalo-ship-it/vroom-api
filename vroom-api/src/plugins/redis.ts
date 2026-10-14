import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import Redis from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

const redisPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  redis.on('connect', () => {
    fastify.log.info('✅ Conexión a Redis establecida');
  });

  redis.on('error', (err) => {
    fastify.log.error('❌ Error en Redis:', err);
  });

  fastify.decorate('redis', redis);

  // Cierre graceful
  fastify.addHook('onClose', async () => {
    fastify.log.info('🔌 Cerrando conexión Redis...');
    await redis.quit();
  });
};

export default fp(redisPlugin, {
  name: 'redis-plugin',
});