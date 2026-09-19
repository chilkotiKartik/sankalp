import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

function keyFor(req: Request): string {
  return req.auth?.userId ? `u:${req.auth.userId}` : `ip:${ipKeyGenerator(req.ip ?? '0.0.0.0')}`;
}

function limiter(windowSeconds: number, limit: number, code: string): RequestHandler {
  return rateLimit({
    windowMs: windowSeconds * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: keyFor,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code,
          message: 'Too many requests — please wait a moment. In an emergency, call 112.',
          requestId: req.requestId,
        },
      });
    },
  });
}

export function createRateLimits(options: { windowSeconds: number; max: number; voiceMax: number; sessionMax: number }) {
  return {
    general: limiter(options.windowSeconds, options.max, 'rate_limited'),
    voice: limiter(options.windowSeconds, options.voiceMax, 'voice_rate_limited'),
    session: limiter(600, options.sessionMax, 'session_rate_limited'),
  };
}
