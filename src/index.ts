import fastify from 'fastify';
import cron from 'node-cron';
import { config } from './config.js';
import { registerExecutorRoutes } from './executor.js';
import { runScanner } from './scanner.js';

const server = fastify({ logger: true });

// Register routes
registerExecutorRoutes(server, config);

// Health check route
server.get('/health', async () => {
  return { status: 'ok' };
});

// Start server
const start = async () => {
  try {
    await server.listen({ port: config.PORT, host: '0.0.0.0' });
    console.log(`Server listening on ${config.PORT}`);

    // Schedule scanner
    console.log(`Scheduling scanner with cron: ${config.CRON_SCHEDULE}`);
    await runScanner(config);
    cron.schedule(config.CRON_SCHEDULE, async () => {
      try {
        await runScanner(config);
      } catch (error) {
        console.error('Error running scanner:', error);
      }
    });

  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
