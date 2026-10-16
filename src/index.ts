import { buildApp } from './app.js';

const start = async () => {
  const app = await buildApp();
  
  const host = process.env.HOST || '0.0.0.0';
  const port = parseInt(process.env.PORT || '3000', 10);
  
  await app.listen({ port, host });
  app.log.info(`🚀 VROOM API iniciado en http://${host}:${port}`);
};

start().catch((err) => {
  console.error('❌ Error al iniciar el servidor:', err);
  process.exit(1);
});