import { ConfigError, loadServerConfig } from '@sanjeevani/config/server';
import { createApp } from './app';
import { createContainer } from './container';
import { createLogger } from './lib/logger';

async function main() {
  let config;
  try {
    config = loadServerConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const logger = createLogger(config.LOG_LEVEL, !config.isProduction && process.stdout.isTTY);
  const container = await createContainer(config, logger);
  const app = createApp(container);
  const caps = container.capabilities();

  const server = app.listen(config.PORT, config.HOST, () => {
    logger.info(
      { port: config.PORT, demoMode: caps.demoMode, ai: caps.ai, stt: caps.stt, tts: caps.tts, maps: caps.maps, persistence: caps.persistence },
      'Sanjeevani API ready',
    );
  });
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  // Hourly retention sweep. `npm run db:purge` does the same from cron.
  const purge = setInterval(() => {
    container.store.conversations
      .purgeExpired(new Date())
      .then((n) => n > 0 && logger.info({ purged: n }, 'expired conversations purged'))
      .catch((err) => logger.warn({ err }, 'purge failed'));
  }, 3600_000);
  purge.unref();

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(() => {
      container
        .close()
        .catch(() => undefined)
        .finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'unhandled rejection'));
}

main().catch((error) => {
  console.error('Failed to start API:', error instanceof Error ? error.message : error);
  process.exit(1);
});
