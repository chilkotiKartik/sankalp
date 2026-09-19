import { pino, type Logger as PinoLogger } from 'pino';

export type Logger = PinoLogger;

/**
 * Structured logs with aggressive redaction. Request bodies are never logged —
 * they can contain health information.
 */
export function createLogger(level: string, pretty: boolean): Logger {
  return pino({
    level,
    base: { service: 'sanjeevani-api' },
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'headers.cookie',
        'headers.authorization',
        '*.text',
        '*.transcript',
        '*.comment',
        '*.apiKey',
        '*.password',
        '*.token',
        'err.config',
      ],
      censor: '[redacted]',
    },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } } : {}),
  });
}
