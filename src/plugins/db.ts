import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { Pool } from 'pg';

declare module 'fastify' {
  interface FastifyInstance {
    db: Pool;
  }
}

const dbPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    throw new Error('DATABASE_URL no está configurada');
  }

  const pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // Verificar conexión
  try {
    const client = await pool.connect();
    fastify.log.info('✅ Conexión a PostgreSQL establecida');
    client.release();
  } catch (err) {
    fastify.log.error('❌ Error conectando a PostgreSQL:', err);
    throw err;
  }

  // Asignar pool a la instancia
  fastify.decorate('db', pool);

  // Cierre graceful
  fastify.addHook('onClose', async () => {
    fastify.log.info('🔌 Cerrando conexiones PostgreSQL...');
    await pool.end();
  });
};

export default fp(dbPlugin, {
  name: 'db-plugin',
});