import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet, * as helmetModule from 'helmet';
const helmetFn = typeof helmet === 'function' ? helmet : (helmetModule as unknown as { default?: typeof helmet }).default ?? (helmetModule as unknown as typeof helmet);
import type { Container } from './container';
import { errorHandler, notFoundHandler } from './lib/errors';
import { loadAuth } from './middleware/auth';
import { createRateLimits } from './middleware/rate-limit';
import { accessLog, noStore, requestId } from './middleware/request';
import { authRoutes } from './routes/auth';
import { conversationRoutes } from './routes/conversations';
import { facilityRoutes } from './routes/facilities';
import { privacyRoutes } from './routes/privacy';
import { systemRoutes } from './routes/system';
import { voiceRoutes } from './routes/voice';

export function createApp(c: Container) {
  const app = express();
  const limits = createRateLimits({
    windowSeconds: c.config.RATE_LIMIT_WINDOW_S,
    max: c.config.RATE_LIMIT_MAX,
    voiceMax: c.config.RATE_LIMIT_VOICE_MAX,
    sessionMax: c.config.RATE_LIMIT_SESSION_MAX,
  });

  app.disable('x-powered-by');
  app.set('trust proxy', c.config.TRUST_PROXY);

  app.use(requestId);
  if (!c.config.isTest) app.use(accessLog(c.logger));
  app.use(
    helmetFn({
      // JSON API only — a locked-down CSP is safe here.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || c.config.allowedOrigins.includes(origin)),
      credentials: true,
      methods: ['GET', 'POST', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  app.use(noStore);
  app.use(loadAuth(c.auth));
  app.use(limits.general);

  app.use(systemRoutes(c));
  app.use(authRoutes(c, limits.session));
  app.use(conversationRoutes(c));
  app.use(facilityRoutes(c));
  app.use(voiceRoutes(c, limits.voice));
  app.use(privacyRoutes(c));

  app.use(notFoundHandler);
  app.use(errorHandler(c.logger));
  return app;
}
